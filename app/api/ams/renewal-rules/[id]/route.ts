import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const updateRenewalRuleSchema = z
  .object({
    is_enabled: z.boolean().optional(),
    days_before_expiration: z.coerce.number().int().min(1).max(365).optional(),
    create_case: z.boolean().optional(),
    case_priority: z.enum(CASE_PRIORITIES).optional(),
    assign_to: z.string().uuid().nullable().optional(),
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid renewal rule id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateRenewalRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM renewal_rules
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Renewal rule not found." as const };
      }

      const nextAssignTo =
        parsed.data.assign_to !== undefined ? parsed.data.assign_to : before.assign_to;

      if (nextAssignTo) {
        const assigneeExists = await activeUserExists(client, nextAssignTo);
        if (!assigneeExists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE renewal_rules
          SET
            is_enabled = $2,
            days_before_expiration = $3,
            create_case = $4,
            case_priority = $5,
            assign_to = $6,
            metadata = $7,
            updated_by = $8
          WHERE id = $1
          RETURNING *
        `,
        [
          id,
          parsed.data.is_enabled ?? before.is_enabled,
          parsed.data.days_before_expiration ?? before.days_before_expiration,
          parsed.data.create_case ?? before.create_case,
          parsed.data.case_priority ?? before.case_priority,
          nextAssignTo ?? null,
          JSON.stringify(parsed.data.metadata !== undefined ? parsed.data.metadata : before.metadata),
          session.user_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "renewal_rule.update",
        entityType: "renewal_rules",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "renewal_rule.updated",
        entityType: "renewal_rule",
        entityId: id,
        metaJson: {
          is_enabled: after.is_enabled,
          days_before_expiration: after.days_before_expiration,
          create_case: after.create_case,
          case_priority: after.case_priority,
          assign_to: after.assign_to,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      return NextResponse.json(
        { error: updated.error },
        { status: updated.error === "Renewal rule not found." ? 404 : 400 },
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
      return NextResponse.json({ error: "Invalid renewal rule id." }, { status: 400 });
    }

    const deleted = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM renewal_rules
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
          UPDATE renewal_rules
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
        action: "renewal_rule.delete",
        entityType: "renewal_rules",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "renewal_rule.deleted",
        entityType: "renewal_rule",
        entityId: id,
        metaJson: {
          days_before_expiration: before.days_before_expiration,
          deleted_at: after.deleted_at,
        },
      });

      return after;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Renewal rule not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: deleted });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
