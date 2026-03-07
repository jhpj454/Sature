import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const listQuerySchema = z.object({
  status: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  type: z.enum(["task", "service_case"]).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(100),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      assigned_to_user_id:
        request.nextUrl.searchParams.get("assigned_to_user_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const { status, priority, type, assigned_to_user_id, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const assignee = assigned_to_user_id ?? session.user_id;

      const rowsRes = await client.query(
        `
          WITH task_items AS (
            SELECT
              'task'::text AS type,
              t.id AS entity_id,
              t.title,
              CASE
                WHEN t.linked_entity_type = 'account' THEN t.linked_entity_id
                WHEN t.linked_entity_type = 'policy' THEN p.account_id
                WHEN t.linked_entity_type = 'service_case' THEN sc.account_id
                ELSE NULL
              END AS account_id,
              CASE
                WHEN t.linked_entity_type = 'policy' THEN t.linked_entity_id
                WHEN t.linked_entity_type = 'service_case' THEN sc.policy_id
                ELSE NULL
              END AS policy_id,
              t.status::text AS status,
              'normal'::text AS priority,
              2::int AS priority_rank,
              t.assigned_to_user_id,
              t.due_date,
              t.created_at
            FROM tasks t
            LEFT JOIN policies p
              ON t.linked_entity_type = 'policy'
             AND p.id = t.linked_entity_id
            LEFT JOIN service_cases sc
              ON t.linked_entity_type = 'service_case'
             AND sc.id = t.linked_entity_id
             AND sc.deleted_at IS NULL
            WHERE t.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND t.deleted_at IS NULL
              AND ($1::uuid IS NULL OR t.assigned_to_user_id = $1)
              AND ($2::text IS NULL OR t.status::text = $2)
              AND ($3::text IS NULL OR $3 = 'task')
              AND ($4::text IS NULL OR $4 = 'normal')
          ),
          service_case_items AS (
            SELECT
              'service_case'::text AS type,
              sc.id AS entity_id,
              sc.title,
              sc.account_id,
              sc.policy_id,
              sc.status::text AS status,
              sc.priority::text AS priority,
              CASE sc.priority::text
                WHEN 'urgent' THEN 4
                WHEN 'high' THEN 3
                WHEN 'normal' THEN 2
                ELSE 1
              END AS priority_rank,
              sc.assigned_to_user_id,
              sc.due_date,
              sc.created_at
            FROM service_cases sc
            WHERE sc.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND sc.deleted_at IS NULL
              AND ($1::uuid IS NULL OR sc.assigned_to_user_id = $1)
              AND ($2::text IS NULL OR sc.status::text = $2)
              AND ($3::text IS NULL OR $3 = 'service_case')
              AND ($4::text IS NULL OR sc.priority::text = $4)
          ),
          combined AS (
            SELECT * FROM task_items
            UNION ALL
            SELECT * FROM service_case_items
          )
          SELECT
            c.type,
            c.entity_id,
            c.title,
            c.account_id,
            a.account_name,
            c.policy_id,
            p.policy_number,
            c.priority,
            c.status,
            c.assigned_to_user_id,
            u.display_name AS assigned_to_name,
            c.due_date,
            c.created_at
          FROM combined c
          LEFT JOIN accounts a
            ON a.id = c.account_id
           AND a.agency_id = current_setting('app.current_agency_id', true)::uuid
          LEFT JOIN policies p
            ON p.id = c.policy_id
           AND p.agency_id = current_setting('app.current_agency_id', true)::uuid
          LEFT JOIN users u
            ON u.id = c.assigned_to_user_id
           AND u.agency_id = current_setting('app.current_agency_id', true)::uuid
          ORDER BY c.priority_rank DESC, c.due_date ASC NULLS LAST, c.created_at DESC
          LIMIT $5 OFFSET $6
        `,
        [assignee ?? null, status ?? null, type ?? null, priority ?? null, page_size, offset],
      );

      const countRes = await client.query<{ total: string }>(
        `
          WITH task_items AS (
            SELECT t.id
            FROM tasks t
            LEFT JOIN policies p
              ON t.linked_entity_type = 'policy'
             AND p.id = t.linked_entity_id
            LEFT JOIN service_cases sc
              ON t.linked_entity_type = 'service_case'
             AND sc.id = t.linked_entity_id
             AND sc.deleted_at IS NULL
            WHERE t.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND t.deleted_at IS NULL
              AND ($1::uuid IS NULL OR t.assigned_to_user_id = $1)
              AND ($2::text IS NULL OR t.status::text = $2)
              AND ($3::text IS NULL OR $3 = 'task')
              AND ($4::text IS NULL OR $4 = 'normal')
          ),
          service_case_items AS (
            SELECT sc.id
            FROM service_cases sc
            WHERE sc.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND sc.deleted_at IS NULL
              AND ($1::uuid IS NULL OR sc.assigned_to_user_id = $1)
              AND ($2::text IS NULL OR sc.status::text = $2)
              AND ($3::text IS NULL OR $3 = 'service_case')
              AND ($4::text IS NULL OR sc.priority::text = $4)
          )
          SELECT (SELECT COUNT(*) FROM task_items) + (SELECT COUNT(*) FROM service_case_items) AS total
        `,
        [assignee ?? null, status ?? null, type ?? null, priority ?? null],
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
      return jsonError(401, "Unauthorized");
    }

    if (error instanceof z.ZodError) {
      return jsonError(422, "Invalid query.");
    }

    console.error("GET /api/work-queue failed", error);
    return jsonError(500, "Unable to load work queue.");
  }
}
