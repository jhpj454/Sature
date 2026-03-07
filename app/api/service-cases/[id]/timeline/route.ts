import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid service case id." }, { status: 400 });
    }

    const timeline = await withTenantClientFromRequest(request, async (client, session) => {
      const caseRes = await client.query(
        `
          SELECT id
          FROM service_cases
          WHERE id = $1
            AND agency_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id, session.agency_id],
      );

      if (caseRes.rowCount === 0) {
        return { error: "Service case not found." as const };
      }

      const result = await client.query(
        `
          WITH activity_items AS (
            SELECT
              'activity'::text AS type,
              a.id,
              a.entity_id,
              COALESCE(a.summary, a.activity_type::text, 'Activity') AS summary,
              CASE
                WHEN a.details IS NULL THEN NULL
                ELSE a.details::text
              END AS content,
              COALESCE(a.occurred_at, a.created_at) AS created_at,
              a.created_by::text AS created_by
            FROM activities a
            WHERE a.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND a.entity_type = 'service_case'
              AND a.entity_id = $1
              AND a.deleted_at IS NULL
          ),
          event_items AS (
            SELECT
              'event'::text AS type,
              e.id,
              e.entity_id,
              e.event_type AS summary,
              CASE
                WHEN e.meta_json IS NULL THEN NULL
                ELSE e.meta_json::text
              END AS content,
              e.created_at,
              NULL::text AS created_by
            FROM events e
            WHERE e.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND e.entity_type = 'service_case'
              AND e.entity_id = $1
          ),
          case_update_items AS (
            SELECT
              'case_update'::text AS type,
              al.id,
              al.entity_id,
              al.action AS summary,
              NULL::text AS content,
              al.created_at,
              al.actor_user_id::text AS created_by
            FROM audit_log al
            WHERE al.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND al.entity_id = $1
              AND al.entity_type IN ('service_case', 'service_cases')
              AND al.action IN ('service_case.create', 'service_case.update')
          )
          SELECT
            type,
            id::text AS id,
            entity_id::text AS entity_id,
            summary,
            content,
            created_at,
            created_by
          FROM (
            SELECT * FROM activity_items
            UNION ALL
            SELECT * FROM event_items
            UNION ALL
            SELECT * FROM case_update_items
          ) items
          ORDER BY created_at DESC
          LIMIT 500
        `,
        [id],
      );

      return { data: result.rows };
    });

    if ("error" in timeline) {
      return NextResponse.json({ error: timeline.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: timeline.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
