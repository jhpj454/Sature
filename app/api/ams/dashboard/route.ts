import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export interface AmsDashboardData {
  open_cases_mine: number | null;
  cases_by_status_mine: { status: string; count: string }[] | null;
  tasks_due_today_mine: number | null;
  policies_expiring_30_days: number | null;
  renewals_in_progress_mine: number | null;
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
