import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const STATUSES = ["active", "inactive"] as const;

const createCommissionSplitSchema = z.object({
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  producer_id: z.string().uuid(),
  split_percent: z.coerce.number().min(0).max(1).nullable().optional(),
  split_flat: z.coerce.number().nullable().optional(),
  status: z.enum(STATUSES).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function activePolicyExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  policyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM policies
      WHERE id = $1
      LIMIT 1
    `,
    [policyId],
  );

  return result.rowCount > 0;
}

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

function normalizeSplitAmounts(parsed: z.infer<typeof createCommissionSplitSchema>) {
  const splitPercent = parsed.split_percent ?? null;
  const splitFlat = parsed.split_flat ?? null;

  if ((splitPercent ?? 0) <= 0 && (splitFlat ?? 0) === 0) {
    return { error: "Either split_percent or split_flat is required." as const };
  }

  return { splitPercent, splitFlat };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            policy_id,
            effective_date,
            producer_id,
            split_percent,
            split_flat,
            status,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM commission_splits
          WHERE policy_id = $1
            AND deleted_at IS NULL
          ORDER BY effective_date DESC, created_at DESC
        `,
        [id],
      );

      return result.rows;
    });

    return NextResponse.json({ ok: true, data });
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
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createCommissionSplitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const normalized = normalizeSplitAmounts(parsed.data);
    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const policyExists = await activePolicyExists(client, id);
      if (!policyExists) {
        return { error: "Policy not found." as const };
      }

      const producerExists = await activeUserExists(client, parsed.data.producer_id);
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      const insertRes = await client.query(
        `
          INSERT INTO commission_splits (
            agency_id,
            policy_id,
            effective_date,
            producer_id,
            split_percent,
            split_flat,
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
          parsed.data.effective_date,
          parsed.data.producer_id,
          normalized.splitPercent,
          normalized.splitFlat,
          parsed.data.status,
          JSON.stringify(parsed.data.metadata),
          session.user_id,
          session.user_id,
        ],
      );

      const row = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "commission_split.create",
        entityType: "commission_splits",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "commission_split.created",
        entityType: "commission_split",
        entityId: row.id,
        metaJson: {
          policy_id: row.policy_id,
          producer_id: row.producer_id,
          split_percent: row.split_percent,
          split_flat: row.split_flat,
          status: row.status,
        },
      });

      return { data: row };
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
