import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export interface CrmDashboardData {
  // 12-month revenue series from converted leads
  revenue_by_month: { month: string; won_revenue: number }[];

  // 3 Month Revenue: sum of estimated_revenue from leads with status='converted' in last 90 days
  three_month_revenue: number;
  three_month_converted_count: number;

  // Opportunities: sum of estimated_revenue from leads with status IN ('new','working','qualified') and pipeline_id IS NOT NULL
  opportunities_revenue: number;
  opportunities_count: number;

  // Renewals This Month: count from service_cases where type='renewal' and status != 'closed'
  renewals_this_month: number;

  // Recent activities for the agency
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
      const { agency_id } = session;

      // 3 Month Revenue
      const threeMonthRevenueRow = await (async () => {
        try {
          const r = await client.query<{ total: string; count: string }>(
            `SELECT COALESCE(SUM(estimated_revenue), 0) AS total, COUNT(*) AS count
             FROM crm_leads
             WHERE agency_id = $1
               AND status = 'converted'
               AND updated_at >= NOW() - INTERVAL '90 days'`,
            [agency_id],
          );
          return r.rows[0] ?? null;
        } catch (err) {
          console.error("CRM dashboard query failed [three_month_revenue]:", err);
          return null;
        }
      })();

      // Opportunities
      const opportunitiesRow = await (async () => {
        try {
          const r = await client.query<{ total: string; count: string }>(
            `SELECT COALESCE(SUM(estimated_revenue), 0) AS total, COUNT(*) AS count
             FROM crm_leads
             WHERE agency_id = $1
               AND status IN ('new', 'working', 'qualified')
               AND pipeline_id IS NOT NULL`,
            [agency_id],
          );
          return r.rows[0] ?? null;
        } catch (err) {
          console.error("CRM dashboard query failed [opportunities]:", err);
          return null;
        }
      })();

      // Revenue by month (last 12 months from converted leads)
      const revenueByMonthRows = await (async () => {
        try {
          const r = await client.query<{ month: string; won_revenue: string }>(
            `SELECT TO_CHAR(updated_at, 'YYYY-MM') AS month,
                    COALESCE(SUM(estimated_revenue), 0) AS won_revenue
             FROM crm_leads
             WHERE agency_id = $1
               AND status = 'converted'
               AND updated_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
             GROUP BY TO_CHAR(updated_at, 'YYYY-MM')
             ORDER BY 1`,
            [agency_id],
          );
          return r.rows;
        } catch (err) {
          console.error("CRM dashboard query failed [revenue_by_month]:", err);
          return [];
        }
      })();

      // Renewals This Month (safe — table might not exist)
      const renewalsRow = await (async () => {
        try {
          const r = await client.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM service_cases
             WHERE agency_id = $1
               AND type = 'renewal'
               AND status != 'closed'
               AND created_at >= date_trunc('month', CURRENT_DATE)`,
            [agency_id],
          );
          return r.rows[0] ?? null;
        } catch (err) {
          console.error("CRM dashboard query failed [renewals_this_month]:", err);
          return null;
        }
      })();

      // Recent activities
      const recentActivitiesRows = await (async () => {
        try {
          const r = await client.query<CrmDashboardData["recent_activities"][number]>(
            `SELECT id, activity_type, summary, entity_type, entity_id, created_at, created_by
             FROM activities
             WHERE agency_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [agency_id],
          );
          return r.rows;
        } catch (err) {
          console.error("CRM dashboard query failed [recent_activities]:", err);
          return [];
        }
      })();

      return {
        revenue_by_month: revenueByMonthRows.map((r) => ({
          month: r.month,
          won_revenue: parseFloat(r.won_revenue),
        })),
        three_month_revenue: parseFloat(threeMonthRevenueRow?.total ?? "0"),
        three_month_converted_count: parseInt(threeMonthRevenueRow?.count ?? "0", 10),
        opportunities_revenue: parseFloat(opportunitiesRow?.total ?? "0"),
        opportunities_count: parseInt(opportunitiesRow?.count ?? "0", 10),
        renewals_this_month: parseInt(renewalsRow?.count ?? "0", 10),
        recent_activities: recentActivitiesRows,
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
