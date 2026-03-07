import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { normalizeServiceCasePriority } from "@/src/server/automation/timeTriggers.mjs";

const updateServiceCaseSchema = z
  .object({
    status: z.enum(["open", "in_progress", "waiting", "done", "closed"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assigned_to_user_id: z.string().uuid().nullable().optional(),
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
  agencyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [userId, agencyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid service case id." }, { status: 400 });
    }

    const serviceCase = await withTenantClientFromRequest(
      request,
      async (client, session) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            case_type,
            status,
            priority,
            account_id,
            policy_id,
            transaction_id,
            assigned_to_user_id,
            due_date,
            sla_due_at,
            title,
            dedupe_key,
            deleted_at,
            created_at,
            updated_at
          FROM service_cases
          WHERE id = $1
            AND agency_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id, session.agency_id],
      );
      return result.rows[0] ?? null;
      },
    );

    if (!serviceCase) {
      return NextResponse.json({ error: "Service case not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: serviceCase });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid service case id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateServiceCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM service_cases
          WHERE id = $1
            AND agency_id = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Service case not found." as const };
      }

      const nextAssignee =
        parsed.data.assigned_to_user_id !== undefined
          ? parsed.data.assigned_to_user_id
          : before.assigned_to_user_id;

      if (nextAssignee) {
        const assigneeExists = await activeUserExists(
          client,
          nextAssignee,
          session.agency_id,
        );
        if (!assigneeExists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE service_cases
          SET
            status = $2,
            priority = $3,
            assigned_to_user_id = $4
          WHERE id = $1
            AND agency_id = $5
          RETURNING *
        `,
        [
          id,
          parsed.data.status ?? before.status,
          normalizeServiceCasePriority(parsed.data.priority ?? before.priority),
          nextAssignee ?? null,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "service_case.update",
        entityType: "service_case",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "service_case.updated",
        entityType: "service_case",
        entityId: id,
        metaJson: {
          status: after.status,
          priority: after.priority,
          assigned_to_user_id: after.assigned_to_user_id,
        },
      });

      if (before.status !== after.status) {
        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "service_case.status_changed",
          entityType: "service_case",
          entityId: id,
          metaJson: {
            from: before.status,
            to: after.status,
          },
        });
      }

      return { data: after };
    });

    if ("error" in updated) {
      const status = updated.error === "Service case not found." ? 404 : 400;
      return NextResponse.json({ error: updated.error }, { status });
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
