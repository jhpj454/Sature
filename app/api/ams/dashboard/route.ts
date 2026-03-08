import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export interface AmsDashboardData {
  open_cases_mine: number;
  cases_by_status_mine: { status: string; count: string }[];
  tasks_due_today_mine: number;
  policies_expiring_30_days: number;
  renewals_in_progress_mine: number;
  recent_activities: {
    id: string;
    agency_id: string;
    activity_type: string;
    summary: string | null;
    created_by: string;
    created_at: string;
    due_at: string | null;
    is_completed: boolean | null;
    first_name: string | null;
    last_name: string | null;
  }[];
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
        client.query<{ count: string }>(
          `SELECT COUNT(*) FROM cases
           WHERE agency_id = $1
             AND assigned_to_user_id = $2
             AND status NOT IN ('done', 'closed')`,
          [agency_id, user_id],
        ),
        client.query<{ status: string; count: string }>(
          `SELECT status, COUNT(*) as count FROM cases
           WHERE agency_id = $1
             AND assigned_to_user_id = $2
             AND status NOT IN ('done', 'closed')
           GROUP BY status`,
          [agency_id, user_id],
        ),
        client.query<{ count: string }>(
          `SELECT COUNT(*) FROM activities
           WHERE agency_id = $1
             AND created_by = $2
             AND activity_type = 'task'
             AND due_at <= (CURRENT_DATE + INTERVAL '1 day - 1 second')
             AND (is_completed = false OR is_completed IS NULL)`,
          [agency_id, user_id],
        ),
        client.query<{ count: string }>(
          `SELECT COUNT(*) FROM policies
           WHERE agency_id = $1
             AND status = 'active'
             AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
          [agency_id],
        ),
        client.query<{ count: string }>(
          `SELECT COUNT(*) FROM cases
           WHERE agency_id = $1
             AND assigned_to_user_id = $2
             AND case_type = 'renewal'
             AND status NOT IN ('done', 'closed')`,
          [agency_id, user_id],
        ),
        client.query<AmsDashboardData["recent_activities"][number]>(
          `SELECT a.id, a.agency_id, a.activity_type, a.summary,
                  a.created_by, a.created_at, a.due_at, a.is_completed,
                  u.first_name, u.last_name
           FROM activities a
           LEFT JOIN users u ON u.id = a.created_by
           WHERE a.agency_id = $1
           ORDER BY a.created_at DESC
           LIMIT 10`,
          [agency_id],
        ),
      ]);

      return {
        open_cases_mine: parseInt(openCasesResult.rows[0].count, 10),
        cases_by_status_mine: casesByStatusResult.rows,
        tasks_due_today_mine: parseInt(tasksDueTodayResult.rows[0].count, 10),
        policies_expiring_30_days: parseInt(policiesExpiringResult.rows[0].count, 10),
        renewals_in_progress_mine: parseInt(renewalsInProgressResult.rows[0].count, 10),
        recent_activities: recentActivitiesResult.rows,
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
