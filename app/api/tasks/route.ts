import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { writeAuditLog } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const listQuerySchema = z.object({
  status: z.enum(["open", "completed"]).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linked_entity_type: z.string().trim().min(1).optional(),
  linked_entity_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  linked_entity_type: z.string().trim().min(1).nullable().optional(),
  linked_entity_id: z.string().uuid().nullable().optional(),
});

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

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      assigned_to_user_id:
        request.nextUrl.searchParams.get("assigned_to_user_id") ?? undefined,
      due_date: request.nextUrl.searchParams.get("due_date") ?? undefined,
      linked_entity_type:
        request.nextUrl.searchParams.get("linked_entity_type") ?? undefined,
      linked_entity_id:
        request.nextUrl.searchParams.get("linked_entity_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const {
      status,
      assigned_to_user_id,
      due_date,
      linked_entity_type,
      linked_entity_id,
      page,
      page_size,
    } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client) => {
      const rowsRes = await client.query(
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
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
            AND ($1::text IS NULL OR status::text = $1)
            AND ($2::uuid IS NULL OR assigned_to_user_id = $2)
            AND ($3::date IS NULL OR due_date = $3)
            AND ($4::text IS NULL OR linked_entity_type = $4)
            AND ($5::uuid IS NULL OR linked_entity_id = $5)
          ORDER BY created_at DESC
          LIMIT $6 OFFSET $7
        `,
        [
          status ?? null,
          assigned_to_user_id ?? null,
          due_date ?? null,
          linked_entity_type ?? null,
          linked_entity_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM tasks
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
            AND ($1::text IS NULL OR status::text = $1)
            AND ($2::uuid IS NULL OR assigned_to_user_id = $2)
            AND ($3::date IS NULL OR due_date = $3)
            AND ($4::text IS NULL OR linked_entity_type = $4)
            AND ($5::uuid IS NULL OR linked_entity_id = $5)
        `,
        [
          status ?? null,
          assigned_to_user_id ?? null,
          due_date ?? null,
          linked_entity_type ?? null,
          linked_entity_id ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: data.rows,
      pagination: {
        page,
        page_size,
        total: data.total,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const task = await withTenantClientFromRequest(request, async (client, session) => {
      if (parsed.data.assigned_to_user_id) {
        const assigneeExists = await activeUserExists(
          client,
          parsed.data.assigned_to_user_id,
          session.agency_id,
        );
        if (!assigneeExists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const insertRes = await client.query(
        `
          INSERT INTO tasks (
            agency_id,
            status,
            title,
            description,
            due_date,
            assigned_to_user_id,
            created_by_user_id,
            linked_entity_type,
            linked_entity_id
          ) VALUES (
            current_setting('app.current_agency_id', true)::uuid,
            'open',
            $1, $2, $3, $4, $5, $6, $7
          )
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
          parsed.data.title,
          parsed.data.description ?? null,
          parsed.data.due_date ?? null,
          parsed.data.assigned_to_user_id ?? null,
          session.user_id,
          parsed.data.linked_entity_type ?? null,
          parsed.data.linked_entity_id ?? null,
        ],
      );

      const row = insertRes.rows[0];

      await writeAuditLog(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task.create",
        entityType: "task",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task.created",
        entityType: "task",
        entityId: row.id,
        metaJson: {
          status: row.status,
          assigned_to_user_id: row.assigned_to_user_id,
        },
      });

      return { data: row };
    });

    if ("error" in task) {
      return NextResponse.json({ error: task.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: task.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
