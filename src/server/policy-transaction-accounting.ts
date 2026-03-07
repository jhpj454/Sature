import type { PoolClient } from "pg";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

type RequestMeta = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type TransactionRecord = {
  id: string;
  policy_id: string;
  status: string;
  commission_delta: number | string | null;
  cash_delta: number | string | null;
};

type ApplyPolicyTransactionAccountingParams = {
  client: PoolClient;
  agencyId: string;
  actorUserId: string;
  transaction: TransactionRecord;
  action: "posted" | "voided";
  previousStatus?: string | null;
  meta?: RequestMeta;
};

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function applyPolicyTransactionAccounting(
  params: ApplyPolicyTransactionAccountingParams,
) {
  const {
    client,
    agencyId,
    actorUserId,
    transaction,
    action,
    previousStatus,
    meta,
  } = params;

  const commissionDelta = toNumber(transaction.commission_delta);
  const cashDelta = toNumber(transaction.cash_delta);

  const shouldApplyRollups =
    action === "posted"
      ? transaction.status === "posted"
      : previousStatus === "posted";

  const multiplier = action === "posted" ? 1 : -1;

  let updatedPolicy: Record<string, unknown> | null = null;

  if (shouldApplyRollups) {
    const policyBeforeRes = await client.query(
      `
        SELECT *
        FROM policies
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [transaction.policy_id],
    );

    const policyBefore = policyBeforeRes.rows[0];

    if (!policyBefore) {
      throw new Error("Policy not found while applying transaction accounting.");
    }

    const updateRes = await client.query(
      `
        UPDATE policies
        SET
          commission_expected = COALESCE(commission_expected, 0) + $1,
          commission_received = COALESCE(commission_received, 0) + $2,
          last_transaction_id = $3,
          revenue_status = CASE
            WHEN (COALESCE(commission_received, 0) + $2) = (COALESCE(commission_expected, 0) + $1)
              THEN 'balanced'
            WHEN (COALESCE(commission_received, 0) + $2) < (COALESCE(commission_expected, 0) + $1)
              THEN 'under_collected'
            ELSE 'over_collected'
          END
        WHERE id = $4
        RETURNING *
      `,
      [
        multiplier * commissionDelta,
        multiplier * cashDelta,
        transaction.id,
        transaction.policy_id,
      ],
    );

    updatedPolicy = updateRes.rows[0] ?? null;

    if (updatedPolicy) {
      await logAudit(client, {
        agencyId,
        actorUserId,
        action: "policy.update_rollups",
        entityType: "policies",
        entityId: transaction.policy_id,
        beforeJson: policyBefore,
        afterJson: updatedPolicy,
        requestId: meta?.requestId ?? null,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      });

      await emitEvent(client, {
        agencyId,
        eventType: "policy.updated",
        entityType: "policy",
        entityId: transaction.policy_id,
        metaJson: {
          reason: action === "posted" ? "transaction_posted" : "transaction_voided_reversal",
          transaction_id: transaction.id,
          commission_delta_applied: multiplier * commissionDelta,
          cash_delta_applied: multiplier * cashDelta,
          revenue_status: updatedPolicy.revenue_status,
        },
      });
    }
  }

  await emitEvent(client, {
    agencyId,
    eventType:
      action === "posted"
        ? "policy_transaction.posted"
        : "policy_transaction.voided",
    entityType: "policy_transaction",
    entityId: transaction.id,
    metaJson: {
      policy_id: transaction.policy_id,
      previous_status: previousStatus ?? null,
      status: transaction.status,
      rollups_applied: shouldApplyRollups,
      commission_delta: commissionDelta,
      cash_delta: cashDelta,
    },
  });

  return {
    updatedPolicy,
    rollupsApplied: shouldApplyRollups,
  };
}
