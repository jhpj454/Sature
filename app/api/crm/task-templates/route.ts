import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const ASSIGNEE_ROLES = ["producer", "csr", "marketing", "admin"] as const;

const createTemplateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  default_offset_days: z.number().int().nullable().optional(),
  default_assignee_role: z.enum(ASSIGNEE_ROLES).nullable().optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const { rows } = await client.query(
        `SELECT * FROM task_templates
         WHERE agency_id = $1 AND deleted_at IS NULL
         ORDER BY name ASC`,
        [session.agency_id],
      );

      return rows;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/task-templates failed", error);
    return jsonError(500, "Unable to load task templates.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const insertRes = await client.query(
        `
          INSERT INTO task_templates (agency_id, name, description, default_offset_days, default_assignee_role, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.name,
          parsed.data.description ?? null,
          parsed.data.default_offset_days ?? null,
          parsed.data.default_assignee_role ?? null,
          session.user_id,
        ],
      );

      const template = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_template.create",
        entityType: "task_template",
        entityId: template.id,
        afterJson: template,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_template.created",
        entityType: "task_template",
        entityId: template.id,
        metaJson: { name: template.name },
      });

      return { data: template };
    });

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/task-templates failed", error);
    return jsonError(500, "Unable to create task template.");
  }
}
