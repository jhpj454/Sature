import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const PAYOUT_STATUSES = ["scheduled", "paid", "void"] as const;

const createPayoutItemSchema = z.object({
  policy_transaction_id: z.string().uuid(),
  amount: z.coerce.number(),
  memo: z.string().trim().min(1).nullable().optional(),
});

const createProducerPayoutSchema = z.object({
  payout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().nullable().optional(),
  method: z.string().trim().min(1).nullable().optional(),
  memo: z.string().trim().min(1).nullable().optional(),
  status: z.enum(PAYOUT_STATUSES).default("scheduled"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  items: z.array(createPayoutItemSchema).min(1),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function activeUserExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  userId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [userId],
  );

  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid producer id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client) => {
      const producerExists = await activeUserExists(client, id);
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      const payoutsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            producer_id,
            payout_date,
            amount,
            method,
            memo,
            status,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM producer_payouts
          WHERE producer_id = $1
            AND deleted_at IS NULL
          ORDER BY payout_date DESC, created_at DESC
        `,
        [id],
      );

      return { data: payoutsRes.rows };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid producer id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createProducerPayoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const itemsTotal = parsed.data.items.reduce((sum, item) => sum + item.amount, 0);
    const payoutAmount = parsed.data.amount ?? itemsTotal;

    if (parsed.data.amount !== null && parsed.data.amount !== undefined && payoutAmount !== itemsTotal) {
      return NextResponse.json(
        { error: "Payout amount must equal sum of payout items." },
        { status: 400 },
      );
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const producerExists = await activeUserExists(client, id);
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      const transactionIds = [...new Set(parsed.data.items.map((item) => item.policy_transaction_id))];
      const transactionsRes = await client.query(
        `
          SELECT id
          FROM policy_transactions
          WHERE id = ANY($1::uuid[])
            AND deleted_at IS NULL
        `,
        [transactionIds],
      );

      if (transactionsRes.rowCount !== transactionIds.length) {
        return { error: "One or more policy transactions were not found." as const };
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          session.agency_id,
          id,
          parsed.data.payout_date,
          payoutAmount,
          parsed.data.method ?? null,
          parsed.data.memo ?? null,
          parsed.data.status,
          JSON.stringify(parsed.data.metadata),
          session.user_id,
          session.user_id,
        ],
      );

      const payout = payoutRes.rows[0];
      const items = [] as Record<string, unknown>[];

      for (const item of parsed.data.items) {
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
            item.policy_transaction_id,
            item.amount,
            item.memo ?? null,
            session.user_id,
            session.user_id,
          ],
        );

        items.push(itemRes.rows[0]);
      }

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "producer_payout.create",
        entityType: "producer_payouts",
        entityId: payout.id,
        afterJson: {
          payout,
          items,
        },
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
          item_count: items.length,
        },
      });

      return {
        data: {
          ...payout,
          items,
        },
      };
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
