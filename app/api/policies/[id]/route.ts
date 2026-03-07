import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const policyStatusSchema = z.enum(["quoted", "active", "canceled", "expired", "pending"]);
const billingTypeSchema = z.enum(["direct_bill", "agency_bill"]);

const updatePolicySchema = z
  .object({
    account_id: z.string().uuid().optional(),
    carrier_id: z.string().uuid().nullable().optional(),
    lob: z.string().min(1).optional(),
    policy_number: z.string().min(1).optional(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: policyStatusSchema.optional(),
    billing_type: billingTypeSchema.optional(),
    premium_amount: z.coerce.number().optional(),
    commission_estimate_amount: z.coerce.number().optional(),
    agency_fee_amount: z.coerce.number().optional(),
    agency_revenue_estimate_amount: z.coerce.number().optional(),
    assigned_csr_id: z.string().uuid().nullable().optional(),
    producer_id: z.string().uuid().nullable().optional(),
    csr_id: z.string().uuid().nullable().optional(),
    renewal_status: z
      .enum(["not_started", "in_progress", "quoted", "bound", "lost"])
      .optional(),
    renewal_assigned_to: z.string().uuid().nullable().optional(),
    renewal_next_action_at: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function tenantEntityExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  table: "accounts" | "carriers",
  id: string,
  agencyId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND agency_id = $2 LIMIT 1`,
    [id, agencyId],
  );
  return result.rowCount > 0;
}

async function activeUserExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  userId: string,
  agencyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [userId, agencyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const policy = await withTenantClientFromRequest(request, async (client, session) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            account_id,
            carrier_id,
            lob,
            policy_number,
            effective_date,
            expiration_date,
            status,
            billing_type,
            premium_amount,
            commission_estimate_amount,
            agency_fee_amount,
            agency_revenue_estimate_amount,
            assigned_csr_id,
            producer_id,
            csr_id,
            commission_expected,
            commission_received,
            last_transaction_id,
            revenue_status,
            renewal_status,
            renewal_assigned_to,
            renewal_last_touch_at,
            renewal_next_action_at,
            created_at,
            updated_at
          FROM policies
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
        `,
        [id, session.agency_id],
      );
      return result.rows[0] ?? null;
    });

    if (!policy) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: policy });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM policies
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Policy not found." as const };
      }

      const nextAccountId = parsed.data.account_id ?? before.account_id;
      if (nextAccountId) {
        const accountExists = await tenantEntityExists(
          client,
          "accounts",
          nextAccountId,
          session.agency_id,
        );
        if (!accountExists) {
          return { error: "Account not found." as const };
        }
      }

      const nextCarrierId =
        parsed.data.carrier_id !== undefined ? parsed.data.carrier_id : before.carrier_id;
      if (nextCarrierId) {
        const carrierExists = await tenantEntityExists(
          client,
          "carriers",
          nextCarrierId,
          session.agency_id,
        );
        if (!carrierExists) {
          return { error: "Carrier not found." as const };
        }
      }

      const nextAssignedCsrId =
        parsed.data.assigned_csr_id !== undefined
          ? parsed.data.assigned_csr_id
          : before.assigned_csr_id;
      const nextCsrId = parsed.data.csr_id !== undefined ? parsed.data.csr_id : before.csr_id;
      const nextProducerId =
        parsed.data.producer_id !== undefined ? parsed.data.producer_id : before.producer_id;
      const nextRenewalAssignedTo =
        parsed.data.renewal_assigned_to !== undefined
          ? parsed.data.renewal_assigned_to
          : before.renewal_assigned_to;

      const userIdsToValidate = [
        nextAssignedCsrId,
        nextCsrId,
        nextProducerId,
        nextRenewalAssignedTo,
      ].filter((value) => Boolean(value));

      for (const userId of userIdsToValidate) {
        const exists = await activeUserExists(
          client,
          userId as string,
          session.agency_id,
        );
        if (!exists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE policies
          SET
            account_id = $2,
            carrier_id = $3,
            lob = $4,
            policy_number = $5,
            effective_date = $6,
            expiration_date = $7,
            status = $8,
            billing_type = $9,
            premium_amount = $10,
            commission_estimate_amount = $11,
            agency_fee_amount = $12,
            agency_revenue_estimate_amount = $13,
            assigned_csr_id = $14,
            producer_id = $15,
            csr_id = $16,
            renewal_status = $17,
            renewal_assigned_to = $18,
            renewal_next_action_at = $19
          WHERE id = $1
            AND agency_id = $20
          RETURNING *
        `,
        [
          id,
          nextAccountId,
          nextCarrierId,
          parsed.data.lob ?? before.lob,
          parsed.data.policy_number ?? before.policy_number,
          parsed.data.effective_date ?? before.effective_date,
          parsed.data.expiration_date ?? before.expiration_date,
          parsed.data.status ?? before.status,
          parsed.data.billing_type ?? before.billing_type,
          parsed.data.premium_amount ?? before.premium_amount,
          parsed.data.commission_estimate_amount ?? before.commission_estimate_amount,
          parsed.data.agency_fee_amount ?? before.agency_fee_amount,
          parsed.data.agency_revenue_estimate_amount ?? before.agency_revenue_estimate_amount,
          nextAssignedCsrId ?? null,
          nextProducerId ?? null,
          nextCsrId ?? null,
          parsed.data.renewal_status ?? before.renewal_status,
          nextRenewalAssignedTo ?? null,
          parsed.data.renewal_next_action_at !== undefined
            ? parsed.data.renewal_next_action_at
            : before.renewal_next_action_at,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy.update",
        entityType: "policy",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy.updated",
        entityType: "policy",
        entityId: id,
        metaJson: {
          status: after.status,
          expiration_date: after.expiration_date,
          renewal_status: after.renewal_status,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const status = updated.error === "Policy not found." ? 404 : 400;
      return NextResponse.json({ error: updated.error }, { status });
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
