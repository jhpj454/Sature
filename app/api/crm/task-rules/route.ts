import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const TRIGGER_TYPES = [
  "policy_expiration",
  "account_created",
  "deal_won",
  "deal_stage_changed",
  "recurring_schedule",
] as const;

const createRuleSchema = z.object({
  name: z.string().trim().min(1),
  template_id: z.string().uuid(),
  trigger_type: z.enum(TRIGGER_TYPES),
  trigger_offset_days: z.number().int().nullable().optional(),
  segment_filters: z.record(z.string(), z.unknown()).optional(),
  recurrence_rule: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const { rows } = await client.query(
        `
          SELECT r.*,
                 t.name AS template_name
          FROM task_automation_rules r
          LEFT JOIN task_templates t ON t.id = r.template_id AND t.agency_id = r.agency_id
          WHERE r.agency_id = $1 AND r.deleted_at IS NULL
          ORDER BY r.name ASC
        `,
        [session.agency_id],
      );

      return rows;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/task-rules failed", error);
    return jsonError(500, "Unable to load task automation rules.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // Verify template exists
      const tplRes = await client.query(
        `SELECT id FROM task_templates WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [parsed.data.template_id, session.agency_id],
      );
      if (tplRes.rows.length === 0) {
        return { error: "Task template not found." as const };
      }

      const insertRes = await client.query(
        `
          INSERT INTO task_automation_rules (
            agency_id, name, template_id, trigger_type, trigger_offset_days,
            segment_filters, recurrence_rule, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.name,
          parsed.data.template_id,
          parsed.data.trigger_type,
          parsed.data.trigger_offset_days ?? null,
          JSON.stringify(parsed.data.segment_filters ?? {}),
          parsed.data.recurrence_rule ?? null,
          parsed.data.is_active ?? true,
          session.user_id,
        ],
      );

      const rule = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_rule.create",
        entityType: "task_automation_rule",
        entityId: rule.id,
        afterJson: rule,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_rule.created",
        entityType: "task_automation_rule",
        entityId: rule.id,
        metaJson: { name: rule.name, trigger_type: rule.trigger_type },
      });

      return { data: rule };
    });

    if ("error" in created) {
      return jsonError(404, created.error ?? "Task template not found.");
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/task-rules failed", error);
    return jsonError(500, "Unable to create task automation rule.");
  }
}
