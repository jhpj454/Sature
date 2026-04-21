import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const TRIGGER_TYPES = [
  "policy_expiration",
  "account_created",
  "deal_won",
  "deal_stage_changed",
  "recurring_schedule",
] as const;

const updateRuleSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    template_id: z.string().uuid().optional(),
    trigger_type: z.enum(TRIGGER_TYPES).optional(),
    trigger_offset_days: z.number().int().nullable().optional(),
    segment_filters: z.record(z.string(), z.unknown()).nullable().optional(),
    recurrence_rule: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
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
      return jsonError(400, "Invalid rule id.");
    }

    const rule = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const { rows } = await client.query(
        `
          SELECT r.*, t.name AS template_name
          FROM task_automation_rules r
          LEFT JOIN task_templates t ON t.id = r.template_id AND t.agency_id = r.agency_id
          WHERE r.id = $1 AND r.agency_id = $2 AND r.deleted_at IS NULL
          LIMIT 1
        `,
        [id, session.agency_id],
      );
      return rows[0] ?? null;
    });

    if (!rule) {
      return jsonError(404, "Task automation rule not found.");
    }

    return NextResponse.json({ ok: true, data: rule });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/task-rules/[id] failed", error);
    return jsonError(500, "Unable to load task automation rule.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid rule id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const beforeRes = await client.query(
        `SELECT * FROM task_automation_rules WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, session.agency_id],
      );
      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Task automation rule not found." as const };
      }

      if (parsed.data.template_id) {
        const tplRes = await client.query(
          `SELECT id FROM task_templates WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [parsed.data.template_id, session.agency_id],
        );
        if (tplRes.rows.length === 0) {
          return { error: "Task template not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE task_automation_rules SET
            name = $2,
            template_id = $3,
            trigger_type = $4,
            trigger_offset_days = $5,
            segment_filters = $6,
            recurrence_rule = $7,
            is_active = $8,
            updated_at = now()
          WHERE id = $1 AND agency_id = $9
          RETURNING *
        `,
        [
          id,
          parsed.data.name ?? before.name,
          parsed.data.template_id ?? before.template_id,
          parsed.data.trigger_type ?? before.trigger_type,
          parsed.data.trigger_offset_days !== undefined
            ? parsed.data.trigger_offset_days
            : before.trigger_offset_days,
          parsed.data.segment_filters !== undefined
            ? JSON.stringify(parsed.data.segment_filters ?? {})
            : before.segment_filters,
          parsed.data.recurrence_rule !== undefined
            ? parsed.data.recurrence_rule
            : before.recurrence_rule,
          parsed.data.is_active !== undefined ? parsed.data.is_active : before.is_active,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_rule.update",
        entityType: "task_automation_rule",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_rule.updated",
        entityType: "task_automation_rule",
        entityId: id,
        metaJson: { name: after.name, is_active: after.is_active },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const msg = updated.error ?? "Task automation rule not found.";
      const status = msg === "Task automation rule not found." ? 404 : 400;
      return jsonError(status, msg);
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/task-rules/[id] failed", error);
    return jsonError(500, "Unable to update task automation rule.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid rule id.");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const beforeRes = await client.query(
        `SELECT * FROM task_automation_rules WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, session.agency_id],
      );
      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Task automation rule not found." as const };
      }

      await client.query(
        `UPDATE task_automation_rules SET deleted_at = now() WHERE id = $1 AND agency_id = $2`,
        [id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task_rule.delete",
        entityType: "task_automation_rule",
        entityId: id,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task_rule.deleted",
        entityType: "task_automation_rule",
        entityId: id,
        metaJson: {},
      });

      return { data: { id } };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Task automation rule not found.");
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("DELETE /api/crm/task-rules/[id] failed", error);
    return jsonError(500, "Unable to delete task automation rule.");
  }
}
