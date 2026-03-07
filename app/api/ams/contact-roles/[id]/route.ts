import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid contact role id." },
        { status: 400 },
      );
    }

    const deleted = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM contact_roles
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
            UPDATE contact_roles
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
          action: "contact_role.delete",
          entityType: "contact_roles",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "contact_role.deleted",
          entityType: "contact_role",
          entityId: id,
          metaJson: {
            entity_type: before.entity_type,
            entity_id: before.entity_id,
            contact_id: before.contact_id,
            role: before.role,
            deleted_at: after.deleted_at,
          },
        });

        return after;
      },
    );

    if (!deleted) {
      return NextResponse.json({ error: "Contact role not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: deleted });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
