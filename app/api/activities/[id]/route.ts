import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { writeAuditLog } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const patchSchema = z.object({
  content: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid activity id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM activities
          WHERE id = $1
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
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

      const updateRes = await client.query(
        `
          UPDATE activities
          SET
            summary = $2,
            updated_by = $3
          WHERE id = $1
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
          RETURNING
            id,
            agency_id,
            activity_type,
            entity_type,
            entity_id,
            summary AS content,
            occurred_at,
            created_by AS created_by_user_id,
            created_at,
            updated_at
        `,
        [id, parsed.data.content, session.user_id],
      );

      const after = updateRes.rows[0];

      await writeAuditLog(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "activity.update",
        entityType: "activity",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "activity.updated",
        entityType: "activity",
        entityId: id,
        metaJson: {
          entity_type: after.entity_type,
          entity_id: after.entity_id,
          activity_type: after.activity_type,
        },
      });

      return after;
    });

    if (!updated) {
      return NextResponse.json({ error: "Activity not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
