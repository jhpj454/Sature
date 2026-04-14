import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export interface UpcomingRenewal {
  id: string;
  policy_number: string;
  lob: string;
  expiration_date: string;
  renewal_status: string;
  client_name: string | null;
}

export interface OpenServiceCase {
  id: string;
  case_type: string;
  account_name: string | null;
}

export interface AmsDashboardData {
  open_cases_mine: number | null;
  cases_by_status_mine: { status: string; count: string }[] | null;
  tasks_due_today_mine: number | null;
  policies_expiring_30_days: number | null;
  renewals_in_progress_mine: number | null;
  upcoming_renewals_30d: UpcomingRenewal[] | null;
  open_service_cases_non_renewal: OpenServiceCase[] | null;
  recent_activities: {
    id: string;
    agency_id: string;
    activity_type: string;
    summary: string | null;
    created_by: string;
    created_at: string;
    display_name: string | null;
  }[] | null;
}

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const { agency_id, user_id } = session;

      const [
        openCasesResult,
        casesByStatusResult,
        tasksDueTodayResult,
        policiesExpiringResult,
        renewalsInProgressResult,
        upcomingRenewalsResult,
        openCasesNonRenewalResult,
        recentActivitiesResult,
      ] = await Promise.all([
        client
          .query<{ count: string }>(
            `SELECT COUNT(*) FROM service_cases
             WHERE agency_id = $1
               AND assigned_to_user_id = $2
               AND status NOT IN ('done', 'closed')
               AND deleted_at IS NULL`,
            [agency_id, user_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] open_cases_mine:", err.message);
            return null;
          }),

        client
          .query<{ status: string; count: string }>(
            `SELECT status, COUNT(*) as count FROM service_cases
             WHERE agency_id = $1
               AND assigned_to_user_id = $2
               AND status NOT IN ('done', 'closed')
               AND deleted_at IS NULL
             GROUP BY status`,
            [agency_id, user_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] cases_by_status_mine:", err.message);
            return null;
          }),

        client
          .query<{ count: string }>(
            `SELECT COUNT(*) FROM tasks
             WHERE agency_id = $1
               AND assigned_to_user_id = $2
               AND status = 'open'
               AND due_date <= CURRENT_DATE
               AND deleted_at IS NULL`,
            [agency_id, user_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] tasks_due_today_mine:", err.message);
            return null;
          }),

        client
          .query<{ count: string }>(
            `SELECT COUNT(*) FROM policies
             WHERE agency_id = $1
               AND status = 'active'
               AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
            [agency_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] policies_expiring_30_days:", err.message);
            return null;
          }),

        client
          .query<{ count: string }>(
            `SELECT COUNT(*) FROM service_cases
             WHERE agency_id = $1
               AND assigned_to_user_id = $2
               AND case_type = 'renewal'
               AND status NOT IN ('done', 'closed')
               AND deleted_at IS NULL`,
            [agency_id, user_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] renewals_in_progress_mine:", err.message);
            return null;
          }),

        client
          .query<UpcomingRenewal>(
            `SELECT
               p.id,
               p.policy_number,
               p.lob,
               p.expiration_date,
               COALESCE(p.renewal_status, 'not_started') AS renewal_status,
               COALESCE(
                 NULLIF(TRIM(ct.business_name), ''),
                 NULLIF(TRIM(CONCAT(ct.first_name, ' ', ct.last_name)), '')
               ) AS client_name
             FROM policies p
             LEFT JOIN LATERAL (
               SELECT ct2.first_name, ct2.last_name, ct2.business_name
               FROM contact_roles cr
               JOIN contacts ct2
                 ON ct2.id = cr.contact_id
                AND ct2.deleted_at IS NULL
               WHERE cr.entity_type = 'policy'
                 AND cr.entity_id = p.id
                 AND cr.role = 'insured'
                 AND cr.deleted_at IS NULL
               ORDER BY cr.is_primary DESC, cr.created_at DESC
               LIMIT 1
             ) ct ON TRUE
             WHERE p.agency_id = $1
               AND p.status = 'active'
               AND p.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
             ORDER BY p.expiration_date ASC
             LIMIT 25`,
            [agency_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] upcoming_renewals_30d:", err.message);
            return null;
          }),

        client
          .query<OpenServiceCase>(
            `SELECT
               sc.id,
               sc.case_type,
               a.account_name
             FROM service_cases sc
             LEFT JOIN accounts a
               ON a.id = sc.account_id
              AND a.deleted_at IS NULL
             WHERE sc.agency_id = $1
               AND sc.assigned_to_user_id = $2
               AND sc.case_type != 'renewal'
               AND sc.status NOT IN ('done', 'closed')
               AND sc.deleted_at IS NULL
             ORDER BY sc.created_at DESC
             LIMIT 15`,
            [agency_id, user_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] open_service_cases_non_renewal:", err.message);
            return null;
          }),

        client
          .query<AmsDashboardData["recent_activities"] extends (infer T)[] | null ? T : never>(
            `SELECT a.id, a.agency_id, a.activity_type, a.summary,
                    a.created_by, a.created_at,
                    u.display_name
             FROM activities a
             LEFT JOIN users u ON u.id = a.created_by
             WHERE a.agency_id = $1
             ORDER BY a.created_at DESC
             LIMIT 10`,
            [agency_id],
          )
          .catch((err) => {
            console.error("[ams/dashboard] recent_activities:", err.message);
            return null;
          }),
      ]);

      return {
        open_cases_mine: openCasesResult ? parseInt(openCasesResult.rows[0].count, 10) : null,
        cases_by_status_mine: casesByStatusResult ? casesByStatusResult.rows : null,
        tasks_due_today_mine: tasksDueTodayResult ? parseInt(tasksDueTodayResult.rows[0].count, 10) : null,
        policies_expiring_30_days: policiesExpiringResult ? parseInt(policiesExpiringResult.rows[0].count, 10) : null,
        renewals_in_progress_mine: renewalsInProgressResult ? parseInt(renewalsInProgressResult.rows[0].count, 10) : null,
        upcoming_renewals_30d: upcomingRenewalsResult ? upcomingRenewalsResult.rows : null,
        open_service_cases_non_renewal: openCasesNonRenewalResult ? openCasesNonRenewalResult.rows : null,
        recent_activities: recentActivitiesResult ? recentActivitiesResult.rows : null,
      } satisfies AmsDashboardData;
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
