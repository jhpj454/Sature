import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    due_date: isoDateSchema.nullable().optional(),
    assigned_to_user_id: z.string().uuid().nullable().optional(),
    status: z.enum(["open", "completed"]).optional(),
    linked_entity_type: z.string().nullable().optional(),
    linked_entity_id: z.string().uuid().nullable().optional(),
    recurrence_rule: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid task id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
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
        `
          UPDATE tasks SET
            title = $2,
            description = $3,
            due_date = $4,
            assigned_to_user_id = $5,
            status = $6,
            linked_entity_type = $7,
            linked_entity_id = $8,
            recurrence_rule = $9,
            updated_at = now()
          WHERE id = $1 AND agency_id = $10
          RETURNING *
        `,
        [
          id,
          parsed.data.title ?? before.title,
          parsed.data.description !== undefined ? parsed.data.description : before.description,
          parsed.data.due_date !== undefined ? parsed.data.due_date : before.due_date,
          parsed.data.assigned_to_user_id !== undefined
            ? parsed.data.assigned_to_user_id
            : before.assigned_to_user_id,
          parsed.data.status ?? before.status,
          parsed.data.linked_entity_type !== undefined
            ? parsed.data.linked_entity_type
            : before.linked_entity_type,
          parsed.data.linked_entity_id !== undefined
            ? parsed.data.linked_entity_id
            : before.linked_entity_id,
          parsed.data.recurrence_rule !== undefined
            ? parsed.data.recurrence_rule
            : before.recurrence_rule,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task.update",
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
        eventType: "task.updated",
        entityType: "task",
        entityId: id,
        metaJson: { status: after.status, due_date: after.due_date },
      });

      return { data: after };
    });

    if ("error" in updated) {
      return jsonError(404, updated.error ?? "Task not found.");
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/tasks/[id] failed", error);
    return jsonError(500, "Unable to update task.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

      await client.query(
        `UPDATE tasks SET deleted_at = now() WHERE id = $1 AND agency_id = $2`,
        [id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task.delete",
        entityType: "task",
        entityId: id,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task.deleted",
        entityType: "task",
        entityId: id,
        metaJson: {},
      });

      return { data: { id } };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Task not found.");
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("DELETE /api/crm/tasks/[id] failed", error);
    return jsonError(500, "Unable to delete task.");
  }
}
