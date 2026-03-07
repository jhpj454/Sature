import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const STATUSES = ["active", "inactive"] as const;

const updateCommissionSplitSchema = z
  .object({
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    producer_id: z.string().uuid().optional(),
    split_percent: z.coerce.number().min(0).max(1).nullable().optional(),
    split_flat: z.coerce.number().nullable().optional(),
    status: z.enum(STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
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

function normalizeSplitAmounts({
  splitPercent,
  splitFlat,
}: {
  splitPercent: number | null;
  splitFlat: number | null;
}) {
  if ((splitPercent ?? 0) <= 0 && (splitFlat ?? 0) === 0) {
    return { error: "Either split_percent or split_flat is required." as const };
  }

  return { splitPercent, splitFlat };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid commission split id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCommissionSplitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM commission_splits
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Commission split not found." as const };
      }

      const nextProducerId = parsed.data.producer_id ?? before.producer_id;
      if (parsed.data.producer_id !== undefined) {
        const producerExists = await activeUserExists(client, parsed.data.producer_id);
        if (!producerExists) {
          return { error: "Producer not found." as const };
        }
      }

      const nextSplitPercent =
        parsed.data.split_percent !== undefined ? parsed.data.split_percent : before.split_percent;
      const nextSplitFlat =
        parsed.data.split_flat !== undefined ? parsed.data.split_flat : before.split_flat;

      const normalized = normalizeSplitAmounts({
        splitPercent: nextSplitPercent,
        splitFlat: nextSplitFlat,
      });
      if ("error" in normalized) {
        return { error: normalized.error };
      }

      const updateRes = await client.query(
        `
          UPDATE commission_splits
          SET
            effective_date = $2,
            producer_id = $3,
            split_percent = $4,
            split_flat = $5,
            status = $6,
            metadata = $7,
            updated_by = $8
          WHERE id = $1
          RETURNING *
        `,
        [
          id,
          parsed.data.effective_date ?? before.effective_date,
          nextProducerId,
          normalized.splitPercent,
          normalized.splitFlat,
          parsed.data.status ?? before.status,
          JSON.stringify(parsed.data.metadata !== undefined ? parsed.data.metadata : before.metadata),
          session.user_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "commission_split.update",
        entityType: "commission_splits",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "commission_split.updated",
        entityType: "commission_split",
        entityId: id,
        metaJson: {
          policy_id: after.policy_id,
          producer_id: after.producer_id,
          status: after.status,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      return NextResponse.json(
        { error: updated.error },
        { status: updated.error === "Commission split not found." ? 404 : 400 },
      );
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid commission split id." }, { status: 400 });
    }

    const deleted = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM commission_splits
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return null;
      }

      const deleteRes = await client.query(
        `
          UPDATE commission_splits
          SET
            deleted_at = now(),
            updated_by = $2
          WHERE id = $1
          RETURNING *
        `,
        [id, session.user_id],
      );

      const after = deleteRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "commission_split.delete",
        entityType: "commission_splits",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "commission_split.deleted",
        entityType: "commission_split",
        entityId: id,
        metaJson: {
          policy_id: before.policy_id,
          producer_id: before.producer_id,
          deleted_at: after.deleted_at,
        },
      });

      return after;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Commission split not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: deleted });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
