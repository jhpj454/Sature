import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid task id.");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const beforeRes = await client.query(
        `SELECT * FROM tasks WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, session.agency_id],
      );
      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Task not found." as const };
      }

      const updateRes = await client.query(
        `UPDATE tasks SET status = 'completed', updated_at = now() WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [id, session.agency_id],
      );
      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task.complete",
        entityType: "task",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task.completed",
        entityType: "task",
        entityId: id,
        metaJson: { completed_by: session.user_id },
      });

      return { data: after };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Task not found.");
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/tasks/[id]/complete failed", error);
    return jsonError(500, "Unable to complete task.");
  }
}
