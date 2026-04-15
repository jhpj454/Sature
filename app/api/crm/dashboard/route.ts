import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export interface CrmDashboardData {
  open_deals_mine: number;
  open_deals_revenue_mine: number;
  deals_by_stage_mine: { stage: string; count: string }[];
  leads_assigned_mine: number;
  closed_won_this_month_mine: number;
  closed_won_revenue_this_month_mine: number;
  revenue_by_month: { month: string; won_revenue: number }[];
  pipeline_potential: number;
  recent_activities: {
    id: string;
    activity_type: string;
    summary: string | null;
    entity_type: string;
    entity_id: string;
    created_at: string;
    created_by: string | null;
  }[];
}

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const { agency_id, user_id } = session;

      const [
        openDealsResult,
        dealsByStageResult,
        leadsAssignedResult,
        closedWonResult,
        revenueByMonthResult,
        pipelinePotentialResult,
        recentActivitiesResult,
      ] = await Promise.all([
        client.query<{ count: string; total_revenue: string }>(
          `SELECT COUNT(*) AS count, COALESCE(SUM(estimated_revenue), 0) AS total_revenue
           FROM crm_deals
           WHERE agency_id = $1
             AND producer_user_id = $2
             AND status = 'open'`,
          [agency_id, user_id],
        ),
        client.query<{ stage: string; count: string }>(
          `SELECT stage, COUNT(*) AS count
           FROM crm_deals
           WHERE agency_id = $1
             AND producer_user_id = $2
             AND status = 'open'
           GROUP BY stage
           ORDER BY count DESC`,
          [agency_id, user_id],
        ),
        client.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM crm_leads
           WHERE agency_id = $1
             AND assigned_producer_id = $2
             AND status IN ('new', 'contacted')`,
          [agency_id, user_id],
        ),
        client.query<{ count: string; total_revenue: string }>(
          `SELECT COUNT(*) AS count, COALESCE(SUM(estimated_revenue), 0) AS total_revenue
           FROM crm_deals
           WHERE agency_id = $1
             AND producer_user_id = $2
             AND status = 'won'
             AND updated_at >= date_trunc('month', CURRENT_DATE)`,
          [agency_id, user_id],
        ),
        client.query<{ month: string; won_revenue: string }>(
          `SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month,
                  COALESCE(SUM(estimated_revenue), 0) AS won_revenue
           FROM crm_deals
           WHERE producer_user_id = $1
             AND status = 'won'
             AND updated_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
           GROUP BY date_trunc('month', updated_at)
           ORDER BY date_trunc('month', updated_at)`,
          [user_id],
        ),
        client.query<{ pipeline_potential: string }>(
          `SELECT COALESCE(SUM(estimated_revenue), 0) AS pipeline_potential
           FROM crm_deals
           WHERE producer_user_id = $1
             AND status = 'open'`,
          [user_id],
        ),
        client.query<CrmDashboardData["recent_activities"][number]>(
          `SELECT id, activity_type, summary, entity_type, entity_id, created_at, created_by
           FROM activities
           WHERE agency_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [agency_id],
        ),
      ]);

      return {
        open_deals_mine: parseInt(openDealsResult.rows[0]?.count ?? "0", 10),
        open_deals_revenue_mine: parseFloat(openDealsResult.rows[0]?.total_revenue ?? "0"),
        deals_by_stage_mine: dealsByStageResult.rows,
        leads_assigned_mine: parseInt(leadsAssignedResult.rows[0]?.count ?? "0", 10),
        closed_won_this_month_mine: parseInt(closedWonResult.rows[0]?.count ?? "0", 10),
        closed_won_revenue_this_month_mine: parseFloat(closedWonResult.rows[0]?.total_revenue ?? "0"),
        revenue_by_month: revenueByMonthResult.rows.map((r) => ({
          month: r.month,
          won_revenue: parseFloat(r.won_revenue),
        })),
        pipeline_potential: parseFloat(pipelinePotentialResult.rows[0]?.pipeline_potential ?? "0"),
        recent_activities: recentActivitiesResult.rows,
      } satisfies CrmDashboardData;
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
