import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";
import type { CrmDashboardData } from "@/app/api/crm/dashboard/route";

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
        <p className="text-sm text-rose-600">{dashboardRequest.errorMessage}</p>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-medium text-zinc-700">Open Deals</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard != null ? dashboard.open_deals_mine : "—"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {dashboard != null ? formatCurrency(dashboard.open_deals_revenue_mine) : "—"}
          </p>
        </article>

        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-medium text-zinc-700">Leads Assigned</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard != null ? dashboard.leads_assigned_mine : "—"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">new or contacted</p>
        </article>

        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-medium text-zinc-700">Closed Won This Month</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard != null ? dashboard.closed_won_this_month_mine : "—"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {dashboard != null ? formatCurrency(dashboard.closed_won_revenue_this_month_mine) : "—"}
          </p>
        </article>

        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Pipeline by Stage</h2>
          {dashboard != null && dashboard.deals_by_stage_mine.length > 0 ? (
            <ul className="space-y-1">
              {dashboard.deals_by_stage_mine.map((row) => (
                <li className="flex items-center justify-between text-sm" key={row.stage}>
                  <span className="capitalize text-zinc-600">{row.stage.replace(/_/g, " ")}</span>
                  <span className="font-medium text-zinc-900">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">{dashboard != null ? "No open deals." : "—"}</p>
          )}
        </article>
      </section>

      <section className="rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
        <div className="border-b border-zinc-200/50 px-4 py-3">
          <h2 className="font-medium text-zinc-900">Recent Activity</h2>
        </div>
        {dashboard != null && dashboard.recent_activities.length > 0 ? (
          <ul className="divide-y divide-zinc-200/40">
            {dashboard.recent_activities.map((activity) => (
              <li className="flex items-start gap-3 px-4 py-3" key={activity.id}>
                <span className="mt-0.5 inline-flex rounded-full bg-sky-50/80 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200/60">
                  {ACTIVITY_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-900">
                    {activity.summary ?? "(no summary)"}
                  </p>
                  {activity.entity_type ? (
                    <p className="text-xs text-zinc-400">
                      {activity.entity_type.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-zinc-400">
                  {formatDateTime(activity.created_at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">
            {dashboard != null ? "No recent activity." : "—"}
          </p>
        )}
      </section>
    </div>
  );
}
