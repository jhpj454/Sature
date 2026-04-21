import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ASSIGNEE_ROLES = ["producer", "csr", "marketing", "admin"] as const;

const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    default_offset_days: z.number().int().nullable().optional(),
    default_assignee_role: z.enum(ASSIGNEE_ROLES).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid template id.");
    }

    const template = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const { rows } = await client.query(
        `SELECT * FROM task_templates WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, session.agency_id],
      );
      return rows[0] ?? null;
    });

    if (!template) {
      return jsonError(404, "Task template not found.");
    }

    return NextResponse.json({ ok: true, data: template });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/task-templates/[id] failed", error);
    return jsonError(500, "Unable to load task template.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid template id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const beforeRes = await client.query(
        `SELECT * FROM task_templates WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, session.agency_id],
      );
      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Task template not found." as const };
      }

      const updateRes = await client.query(
        `
          UPDATE task_templates SET
            name = $2,
            description = $3,
            default_offset_days = $4,
            default_assignee_role = $5,
            updated_at = now()
          WHERE id = $1 AND agency_id = $6
          RETURNING *
        `,
        [
          id,
          parsed.data.name ?? before.name,
          parsed.data.description !== undefined ? parsed.data.description : before.description,
          parsed.data.default_offset_days !== undefined
            ? parsed.data.default_offset_days
            : before.default_offset_days,
          parsed.data.default_assignee_role !== undefined
            ? parsed.data.default_assignee_role
            : before.default_assignee_role,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_template.update",
        entityType: "task_template",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_template.updated",
        entityType: "task_template",
        entityId: id,
        metaJson: { name: after.name },
      });

      return { data: after };
    });

    if ("error" in updated) {
      return jsonError(404, updated.error ?? "Task template not found.");
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/task-templates/[id] failed", error);
    return jsonError(500, "Unable to update task template.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid template id.");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const beforeRes = await client.query(
        `SELECT * FROM task_templates WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, session.agency_id],
      );
      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Task template not found." as const };
      }

      await client.query(
        `UPDATE task_templates SET deleted_at = now() WHERE id = $1 AND agency_id = $2`,
        [id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_template.delete",
        entityType: "task_template",
        entityId: id,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_template.deleted",
        entityType: "task_template",
        entityId: id,
        metaJson: {},
      });

      return { data: { id } };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Task template not found.");
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("DELETE /api/crm/task-templates/[id] failed", error);
    return jsonError(500, "Unable to delete task template.");
  }
}
