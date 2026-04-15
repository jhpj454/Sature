import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";
import type { CrmDashboardData } from "@/app/api/crm/dashboard/route";
import { RevenueChart } from "./_components/RevenueChart";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  task: "Task",
  meeting: "Meeting",
  system: "System",
  status_change: "Status Change",
  document_added: "Document Added",
};

export default async function CrmDashboardPage() {
  const dashboardRequest = await safeApiFetchJson<{ ok: true; data: CrmDashboardData }>(
    "/api/crm/dashboard",
  );

  const dashboard = dashboardRequest.ok ? dashboardRequest.data.data : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Dashboard"
        description="Producer workspace for lead follow-up, deal movement, and daily sales action."
        actions={
          <Link href="/crm/win-deals">
            <Button size="sm">Open Win Deals</Button>
          </Link>
        }
      />

      {!dashboardRequest.ok && (
        <p className="text-sm text-rose-500">{dashboardRequest.errorMessage}</p>
      )}

      {/* Revenue Chart */}
      <section
        className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none"
      >
        <h2 className="mb-4 text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Won Revenue — Last 12 Months</h2>
        {dashboard != null ? (
          <RevenueChart data={dashboard.revenue_by_month} />
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-400 dark:text-[#9da5b4]">—</div>
        )}
      </section>

      {/* Revenue stat cards */}
      <section className="grid gap-4 md:grid-cols-2">
        <article
          className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-6 backdrop-blur-xl dark:shadow-none"
        >
          <h2 className="text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Revenue Closed This Month</h2>
          <p className="mt-3 text-4xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard != null ? formatCurrency(dashboard.closed_won_revenue_this_month_mine) : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-400 dark:text-[#9da5b4]">
            {dashboard != null ? `${dashboard.closed_won_this_month_mine} deal${dashboard.closed_won_this_month_mine !== 1 ? "s" : ""} closed won` : "—"}
          </p>
        </article>

        <article
          className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-6 backdrop-blur-xl dark:shadow-none"
        >
          <h2 className="text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Pipeline Potential</h2>
          <p className="mt-3 text-4xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard != null ? formatCurrency(dashboard.pipeline_potential) : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-400 dark:text-[#9da5b4]">
            {dashboard != null ? `${dashboard.open_deals_mine} open deal${dashboard.open_deals_mine !== 1 ? "s" : ""} in pipeline` : "—"}
          </p>
        </article>
      </section>

      {/* Supporting stat cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <article
          className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none"
        >
          <h2 className="text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Open Deals</h2>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard != null ? dashboard.open_deals_mine : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-400 dark:text-[#9da5b4]">
            {dashboard != null ? formatCurrency(dashboard.open_deals_revenue_mine) : "—"}
          </p>
        </article>

        <article
          className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none"
        >
          <h2 className="text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Leads Assigned</h2>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard != null ? dashboard.leads_assigned_mine : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-400 dark:text-[#9da5b4]">new or contacted</p>
        </article>

        <article
          className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none"
        >
          <h2 className="mb-3 text-[13px] font-semibold text-slate-400 dark:text-[#9da5b4]">Pipeline by Stage</h2>
          {dashboard != null && dashboard.deals_by_stage_mine.length > 0 ? (
            <ul className="space-y-1.5">
              {dashboard.deals_by_stage_mine.map((row) => (
                <li className="flex items-center justify-between text-sm" key={row.stage}>
                  <span className="capitalize text-slate-500 dark:text-[#9da5b4]">{row.stage.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-slate-700 dark:text-[#e8eaf0]">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 dark:text-[#9da5b4]">{dashboard != null ? "No open deals." : "—"}</p>
          )}
        </article>
      </section>

      {/* Recent Activity */}
      <section
        className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] backdrop-blur-xl dark:shadow-none"
      >
        <div className="border-b border-slate-200/30 dark:border-white/[0.08] px-5 py-3.5">
          <h2 className="font-semibold text-slate-700 dark:text-[#e8eaf0]">Recent Activity</h2>
        </div>
        {dashboard != null && dashboard.recent_activities.length > 0 ? (
          <ul className="divide-y divide-slate-200/20 dark:divide-white/[0.06]">
            {dashboard.recent_activities.map((activity) => (
              <li className="flex items-start gap-3 px-5 py-3.5" key={activity.id}>
                <span className="mt-0.5 inline-flex rounded-full bg-blue-50/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-[#5a8fcf]">
                  {ACTIVITY_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-[#e8eaf0]">
                    {activity.summary ?? "(no summary)"}
                  </p>
                  {activity.entity_type ? (
                    <p className="text-xs text-slate-400 dark:text-[#9da5b4]">
                      {activity.entity_type.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-slate-400 dark:text-[#9da5b4]">
                  {formatDateTime(activity.created_at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-[#9da5b4]">
            {dashboard != null ? "No recent activity." : "—"}
          </p>
        )}
      </section>
    </div>
  );
}
