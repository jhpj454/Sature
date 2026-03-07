import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { writeAuditLog } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const patchSchema = z
  .object({
    status: z.enum(["open", "completed"]).optional(),
    assigned_to_user_id: z.string().uuid().nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
      return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
    }

    const task = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            status,
            title,
            description,
            due_date,
            assigned_to_user_id,
            created_by_user_id,
            linked_entity_type,
            linked_entity_id,
            created_at,
            updated_at
          FROM tasks
          WHERE id = $1
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: task });
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
      return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
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
          FROM tasks
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
        return { error: "Task not found." as const };
      }

      const nextAssignee =
        parsed.data.assigned_to_user_id !== undefined
          ? parsed.data.assigned_to_user_id
          : before.assigned_to_user_id;

      if (nextAssignee) {
        const assigneeExists = await activeUserExists(client, nextAssignee, session.agency_id);
        if (!assigneeExists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE tasks
          SET
            status = $2,
            assigned_to_user_id = $3,
            due_date = $4
          WHERE id = $1
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
          RETURNING
            id,
            agency_id,
            status,
            title,
            description,
            due_date,
            assigned_to_user_id,
            created_by_user_id,
            linked_entity_type,
            linked_entity_id,
            created_at,
            updated_at
        `,
        [
          id,
          parsed.data.status ?? before.status,
          nextAssignee ?? null,
          parsed.data.due_date !== undefined ? parsed.data.due_date : before.due_date,
        ],
      );

      const after = updateRes.rows[0];

      await writeAuditLog(client, {
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

      if (before.status !== after.status && after.status === "completed") {
        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "task.completed",
          entityType: "task",
          entityId: id,
          metaJson: {
            from: before.status,
            to: after.status,
          },
        });
      }

      if (before.assigned_to_user_id !== after.assigned_to_user_id) {
        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "task.reassigned",
          entityType: "task",
          entityId: id,
          metaJson: {
            from: before.assigned_to_user_id,
            to: after.assigned_to_user_id,
          },
        });
      }

      return { data: after };
    });

    if ("error" in updated) {
      const status = updated.error === "Task not found." ? 404 : 400;
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
