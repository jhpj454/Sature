import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const RENEWAL_STATUSES = [
  "not_started",
  "in_progress",
  "quoted",
  "bound",
  "lost",
] as const;

const touchSchema = z.object({
  renewal_status: z.enum(RENEWAL_STATUSES).optional(),
  renewal_next_action_at: z.string().datetime().nullable().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = touchSchema.safeParse(body ?? {});

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM policies
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        const nextStatus = parsed.data.renewal_status ?? before.renewal_status;
        const nextActionAt =
          parsed.data.renewal_next_action_at !== undefined
            ? parsed.data.renewal_next_action_at
            : before.renewal_next_action_at;

        const updateRes = await client.query(
          `
            UPDATE policies
            SET
              renewal_status = $2,
              renewal_last_touch_at = now(),
              renewal_next_action_at = $3
            WHERE id = $1
            RETURNING *
          `,
          [id, nextStatus, nextActionAt],
        );

        const after = updateRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "renewal.touch",
          entityType: "policies",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "renewal.touched",
          entityType: "policy",
          entityId: id,
          metaJson: {
            renewal_status: after.renewal_status,
            renewal_last_touch_at: after.renewal_last_touch_at,
            renewal_next_action_at: after.renewal_next_action_at,
          },
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "policy.updated",
          entityType: "policy",
          entityId: id,
          metaJson: {
            reason: "renewal_touch",
            renewal_status: after.renewal_status,
          },
        });

        return after;
      },
    );

    if (!result) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
