import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listTasksQuerySchema = z.object({
  status: z.enum(["open", "completed"]).optional(),
  due_before: isoDateSchema.optional(),
  due_after: isoDateSchema.optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.string().uuid().optional(),
  view: z.enum(["mine"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  linked_entity_type: z.string().nullable().optional(),
  linked_entity_id: z.string().uuid().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listTasksQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      due_before: request.nextUrl.searchParams.get("due_before") ?? undefined,
      due_after: request.nextUrl.searchParams.get("due_after") ?? undefined,
      assigned_to_user_id:
        request.nextUrl.searchParams.get("assigned_to_user_id") ?? undefined,
      linked_entity_type:
        request.nextUrl.searchParams.get("linked_entity_type") ?? undefined,
      linked_entity_id:
        request.nextUrl.searchParams.get("linked_entity_id") ?? undefined,
      view: request.nextUrl.searchParams.get("view") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const {
      status,
      due_before,
      due_after,
      assigned_to_user_id,
      linked_entity_type,
      linked_entity_id,
      view,
      page,
      page_size,
    } = parsedQuery.data;

    const offset = (page - 1) * page_size;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const mineFilter = view === "mine" ? session.user_id : null;

      const rowsRes = await client.query(
        `
          SELECT t.*,
                 u.display_name AS assignee_display_name,
                 creator.display_name AS creator_display_name
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assigned_to_user_id AND u.agency_id = t.agency_id
          LEFT JOIN users creator ON creator.id = t.created_by_user_id AND creator.agency_id = t.agency_id
          WHERE t.agency_id = $1
            AND t.deleted_at IS NULL
            AND ($2::text IS NULL OR t.status::text = $2)
            AND ($3::date IS NULL OR t.due_date <= $3)
            AND ($4::date IS NULL OR t.due_date >= $4)
            AND ($5::uuid IS NULL OR t.assigned_to_user_id = $5)
            AND ($6::text IS NULL OR t.linked_entity_type = $6)
            AND ($7::uuid IS NULL OR t.linked_entity_id = $7)
            AND ($8::uuid IS NULL OR t.assigned_to_user_id = $8)
          ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
          LIMIT $9 OFFSET $10
        `,
        [
          session.agency_id,
          status ?? null,
          due_before ?? null,
          due_after ?? null,
          assigned_to_user_id ?? null,
          linked_entity_type ?? null,
          linked_entity_id ?? null,
          mineFilter,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM tasks t
          WHERE t.agency_id = $1
            AND t.deleted_at IS NULL
            AND ($2::text IS NULL OR t.status::text = $2)
            AND ($3::date IS NULL OR t.due_date <= $3)
            AND ($4::date IS NULL OR t.due_date >= $4)
            AND ($5::uuid IS NULL OR t.assigned_to_user_id = $5)
            AND ($6::text IS NULL OR t.linked_entity_type = $6)
            AND ($7::uuid IS NULL OR t.linked_entity_id = $7)
            AND ($8::uuid IS NULL OR t.assigned_to_user_id = $8)
        `,
        [
          session.agency_id,
          status ?? null,
          due_before ?? null,
          due_after ?? null,
          assigned_to_user_id ?? null,
          linked_entity_type ?? null,
          linked_entity_id ?? null,
          mineFilter,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: result.rows,
      pagination: { page, page_size, total: result.total },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/tasks failed", error);
    return jsonError(500, "Unable to load tasks.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const insertRes = await client.query(
        `
          INSERT INTO tasks (
            agency_id,
            title,
            description,
            status,
            due_date,
            assigned_to_user_id,
            created_by_user_id,
            linked_entity_type,
            linked_entity_id,
            recurrence_rule,
            template_id
          ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.title,
          parsed.data.description ?? null,
          parsed.data.due_date ?? null,
          parsed.data.assigned_to_user_id ?? null,
          session.user_id,
          parsed.data.linked_entity_type ?? null,
          parsed.data.linked_entity_id ?? null,
          parsed.data.recurrence_rule ?? null,
          parsed.data.template_id ?? null,
        ],
      );

      const task = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "task.create",
        entityType: "task",
        entityId: task.id,
        afterJson: task,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "task.created",
        entityType: "task",
        entityId: task.id,
        metaJson: { title: task.title, status: task.status, due_date: task.due_date },
      });

      return { data: task };
    });

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/tasks failed", error);
    return jsonError(500, "Unable to create task.");
  }
}
