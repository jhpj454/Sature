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
      return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
    }

    const timeline = await withTenantClientFromRequest(request, async (client) => {
      const accountRes = await client.query(
        `
          SELECT 1
          FROM accounts
          WHERE id = $1
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id],
      );

      if (accountRes.rowCount === 0) {
        return { error: "Account not found." as const };
      }

      const result = await client.query(
        `
          WITH account_policies AS (
            SELECT p.id
            FROM policies p
            WHERE p.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND p.account_id = $1
          ),
          account_cases AS (
            SELECT sc.id
            FROM service_cases sc
            WHERE sc.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND sc.account_id = $1
              AND sc.deleted_at IS NULL
          ),
          account_policy_transactions AS (
            SELECT pt.id
            FROM policy_transactions pt
            JOIN account_policies ap
              ON ap.id = pt.policy_id
            WHERE pt.deleted_at IS NULL
          ),
          account_contacts AS (
            SELECT c.id
            FROM contacts c
            WHERE c.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND c.account_id = $1
              AND c.deleted_at IS NULL
          ),
          activity_items AS (
            SELECT
              'activity'::text AS type,
              a.id AS entity_id,
              COALESCE(a.summary, 'Activity') AS summary,
              a.created_at,
              a.created_by AS created_by
            FROM activities a
            WHERE a.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND a.deleted_at IS NULL
              AND (
                (a.entity_type = 'service_case' AND a.entity_id IN (SELECT id FROM account_cases))
                OR (a.entity_type = 'policy' AND a.entity_id IN (SELECT id FROM account_policies))
                OR (
                  a.entity_type = 'policy_transaction'
                  AND a.entity_id IN (SELECT id FROM account_policy_transactions)
                )
                OR (a.entity_type = 'contact' AND a.entity_id IN (SELECT id FROM account_contacts))
              )
          ),
          service_case_items AS (
            SELECT
              'service_case'::text AS type,
              sc.id AS entity_id,
              sc.title AS summary,
              sc.created_at,
              sc.assigned_to_user_id AS created_by
            FROM service_cases sc
            WHERE sc.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND sc.account_id = $1
              AND sc.deleted_at IS NULL
          ),
          policy_transaction_items AS (
            SELECT
              'policy_transaction'::text AS type,
              pt.id AS entity_id,
              COALESCE(pt.memo, pt.transaction_type) AS summary,
              pt.created_at,
              pt.created_by AS created_by
            FROM policy_transactions pt
            JOIN account_policies ap
              ON ap.id = pt.policy_id
            WHERE pt.deleted_at IS NULL
          ),
          event_items AS (
            SELECT
              'event'::text AS type,
              e.id AS entity_id,
              e.event_type AS summary,
              e.created_at,
              NULL::uuid AS created_by
            FROM events e
            WHERE e.agency_id = current_setting('app.current_agency_id', true)::uuid
              AND (
                (e.entity_type = 'account' AND e.entity_id = $1)
                OR (e.entity_type = 'service_case' AND e.entity_id IN (SELECT id FROM account_cases))
                OR (e.entity_type = 'policy' AND e.entity_id IN (SELECT id FROM account_policies))
                OR (
                  e.entity_type = 'policy_transaction'
                  AND e.entity_id IN (SELECT id FROM account_policy_transactions)
                )
                OR (e.entity_type = 'contact' AND e.entity_id IN (SELECT id FROM account_contacts))
              )
          )
          SELECT type, entity_id, summary, created_at, created_by
          FROM (
            SELECT * FROM activity_items
            UNION ALL
            SELECT * FROM service_case_items
            UNION ALL
            SELECT * FROM policy_transaction_items
            UNION ALL
            SELECT * FROM event_items
          ) timeline
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
