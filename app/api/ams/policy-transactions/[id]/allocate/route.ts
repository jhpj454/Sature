import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import {
  allocateTransactionToProducers,
  AllocationError,
} from "@/src/server/producer-allocation";

const allocateSchema = z.object({
  create_draft_payout: z.boolean().default(false),
  payout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.string().trim().min(1).nullable().optional(),
  memo: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid policy transaction id." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = allocateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const allocation = await allocateTransactionToProducers(client, id);

      const createdPayouts: Record<string, unknown>[] = [];

      if (parsed.data.create_draft_payout) {
        const payoutDate = parsed.data.payout_date ?? allocation.allocation_date;

        for (const suggestion of allocation.suggestions) {
          if (suggestion.amount === 0) {
            continue;
          }

          const payoutRes = await client.query(
            `
              INSERT INTO producer_payouts (
                agency_id,
                producer_id,
                payout_date,
                amount,
                method,
                memo,
                status,
                metadata,
                created_by,
                updated_by
              ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8, $9)
              RETURNING *
            `,
            [
              session.agency_id,
              suggestion.producer_id,
              payoutDate,
              suggestion.amount,
              parsed.data.method ?? null,
              parsed.data.memo ?? `Auto allocation for transaction ${id}`,
              JSON.stringify({
                ...parsed.data.metadata,
                source: "policy_transaction.allocate",
                policy_transaction_id: id,
                split_id: suggestion.split_id,
              }),
              session.user_id,
              session.user_id,
            ],
          );

          const payout = payoutRes.rows[0];

          const itemRes = await client.query(
            `
              INSERT INTO producer_payout_items (
                agency_id,
                producer_payout_id,
                policy_transaction_id,
                amount,
                memo,
                created_by,
                updated_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING *
            `,
            [
              session.agency_id,
              payout.id,
              id,
              suggestion.amount,
              parsed.data.memo ?? `Auto allocation for transaction ${id}`,
              session.user_id,
              session.user_id,
            ],
          );

          const payoutItem = itemRes.rows[0];

          await logAudit(client, {
            agencyId: session.agency_id,
            actorUserId: session.user_id,
            action: "producer_payout.create",
            entityType: "producer_payouts",
            entityId: payout.id,
            afterJson: payout,
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          });

          await logAudit(client, {
            agencyId: session.agency_id,
            actorUserId: session.user_id,
            action: "producer_payout_item.create",
            entityType: "producer_payout_items",
            entityId: payoutItem.id,
            afterJson: payoutItem,
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          });

          await emitEvent(client, {
            agencyId: session.agency_id,
            eventType: "payout.created",
            entityType: "producer_payout",
            entityId: payout.id,
            metaJson: {
              producer_id: payout.producer_id,
              amount: payout.amount,
              status: payout.status,
              policy_transaction_id: id,
              auto_allocated: true,
            },
          });

          createdPayouts.push({
            payout,
            item: payoutItem,
          });
        }

      }

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_transaction.allocate",
        entityType: "policy_transactions",
        entityId: id,
        afterJson: {
          allocation,
          create_draft_payout: parsed.data.create_draft_payout,
          created_payout_count: createdPayouts.length,
        },
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_transaction.allocated",
        entityType: "policy_transaction",
        entityId: id,
        metaJson: {
          policy_id: allocation.policy_id,
          allocation_basis: allocation.allocation_basis,
          basis_amount: allocation.basis_amount,
          allocated_total: allocation.allocated_total,
          create_draft_payout: parsed.data.create_draft_payout,
          payout_count: createdPayouts.length,
        },
      });

      return {
        allocation,
        created_payouts: createdPayouts,
      };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof AllocationError) {
      const status = error.message.includes("not found") ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
