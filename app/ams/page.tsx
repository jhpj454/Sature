import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatDate } from "@/app/ams/_lib/format";
import type { AmsDashboardData } from "@/app/api/ams/dashboard/route";

const LOB_LABELS: Record<string, string> = {
  gl: "General Liability",
  bop: "Business Owners Policy",
  auto: "Commercial Auto",
  wc: "Workers' Comp",
  property: "Commercial Property",
  umbrella: "Umbrella",
  home: "Homeowners",
  personal_auto: "Personal Auto",
  life: "Life",
  health: "Health",
};

const CASE_TYPE_LABELS: Record<string, string> = {
  endorsement: "Endorsement",
  coi: "Certificate of Insurance",
  claim: "Claim",
  billing: "Billing",
  cancellation: "Cancellation",
  other: "Other",
};

function formatLob(lob: string) {
  return LOB_LABELS[lob.toLowerCase()] ?? lob;
}

function formatCaseType(caseType: string) {
  return CASE_TYPE_LABELS[caseType] ?? caseType;
}

function RenewalStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    not_started: "bg-slate-100/60 text-slate-500 dark:bg-white/[0.08] dark:text-[#9da5b4]",
    in_progress: "bg-blue-50/60 text-blue-600 dark:bg-[rgba(74,127,193,0.20)] dark:text-[#a8c4e8]",
    quoted: "bg-amber-50/60 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
    bound: "bg-emerald-50/60 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    lost: "bg-rose-50/60 text-rose-500 dark:bg-rose-900/30 dark:text-rose-300",
  };
  const labels: Record<string, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    quoted: "Quoted",
    bound: "Bound",
    lost: "Lost",
  };

  const cls = styles[status] ?? "bg-slate-100/60 text-slate-500 dark:bg-white/[0.08] dark:text-[#9da5b4]";
  const label = labels[status] ?? status;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default async function AmsDashboardPage() {
  const dashboardRequest = await safeApiFetchJson<{ ok: true; data: AmsDashboardData }>(
    "/api/ams/dashboard",
  );

  const dashboard = dashboardRequest.ok ? dashboardRequest.data.data : null;
  const renewals = dashboard?.upcoming_renewals_30d ?? [];
  const serviceCases = dashboard?.open_service_cases_non_renewal ?? [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-[#e8eaf0]">AMS Dashboard</h1>
          <p className="text-sm text-slate-400 dark:text-[#9da5b4]">Your agency at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-lg bg-slate-800 dark:bg-[#2563eb] px-3 py-2 text-[13px] font-medium text-white shadow-sm transition-all duration-200 hover:bg-slate-700 dark:hover:bg-[#3b82f6]"
            href="/ams/work-queue"
          >
            Open Work Queue
          </Link>
          <Link
            className="rounded-lg border border-white/50 dark:border-white/[0.14] bg-white/30 dark:bg-white/[0.08] px-3 py-2 text-[13px] text-slate-500 dark:text-[#9da5b4] backdrop-blur-sm transition-all duration-200 hover:bg-white/50 dark:hover:bg-white/[0.12] hover:text-slate-700 dark:hover:text-[#e8eaf0]"
            href="/ams/service-cases"
          >
            Service Cases
          </Link>
        </div>
      </div>

      {!dashboardRequest.ok && (
        <p className="text-sm text-rose-500">{dashboardRequest.errorMessage}</p>
      )}

      {/* Summary stats */}
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">Cases Open</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard?.open_cases_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">Tasks Due Today</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard?.tasks_due_today_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">Renewals Next 30 Days</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard?.policies_expiring_30_days ?? "—"}
          </p>
        </article>
        <article className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-5 backdrop-blur-xl dark:shadow-none">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">In Progress</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800 dark:text-[#e8eaf0]">
            {dashboard?.renewals_in_progress_mine ?? "—"}
          </p>
        </article>
      </section>

      {/* Upcoming Renewals table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-700 dark:text-[#e8eaf0]">Upcoming Renewals</h2>
            <p className="text-xs text-slate-400 dark:text-[#9da5b4]">
              {renewals.length > 0
                ? `${renewals.length} polic${renewals.length === 1 ? "y" : "ies"} renewing in the next 30 days`
                : "No renewals in the next 30 days"}
            </p>
          </div>
          <Link
            className="text-xs text-slate-400 dark:text-[#9da5b4] transition-colors hover:text-slate-700 dark:hover:text-[#e8eaf0]"
            href="/ams/renewals"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] backdrop-blur-xl dark:shadow-none">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/30 dark:border-white/[0.08] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Policy Type</th>
                <th className="px-5 py-3">Renews</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((renewal) => (
                <tr
                  key={renewal.id}
                  className="border-t border-slate-200/20 dark:border-white/[0.06] transition-colors hover:bg-white/30 dark:hover:bg-white/[0.06]"
                >
                  <td className="px-5 py-3">
                    <Link
                      className="font-medium text-slate-700 dark:text-[#e8eaf0] transition-colors hover:text-blue-600 dark:hover:text-[#5a8fcf]"
                      href={`/ams/policies/${renewal.id}`}
                    >
                      {renewal.client_name ?? renewal.policy_number}
                    </Link>
                    {renewal.client_name && (
                      <div className="text-xs text-slate-400 dark:text-[#9da5b4]">{renewal.policy_number}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-[#9da5b4]">{formatLob(renewal.lob)}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-[#9da5b4]">{formatDate(renewal.expiration_date)}</td>
                  <td className="px-5 py-3">
                    <RenewalStatusBadge status={renewal.renewal_status} />
                  </td>
                </tr>
              ))}
              {renewals.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-sm text-slate-400 dark:text-[#9da5b4]" colSpan={4}>
                    No policies renewing in the next 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Open Service Cases card */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-700 dark:text-[#e8eaf0]">Open Service Cases</h2>
            <p className="text-xs text-slate-400 dark:text-[#9da5b4]">
              {serviceCases.length > 0
                ? `${serviceCases.length} open case${serviceCases.length === 1 ? "" : "s"} assigned to you`
                : "No open service cases"}
            </p>
          </div>
          <Link
            className="text-xs text-slate-400 dark:text-[#9da5b4] transition-colors hover:text-slate-700 dark:hover:text-[#e8eaf0]"
            href="/ams/service-cases"
          >
            View all →
          </Link>
        </div>
        <div className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] backdrop-blur-xl dark:shadow-none">
          {serviceCases.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/30 dark:border-white/[0.08] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4]">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Service Type</th>
                </tr>
              </thead>
              <tbody>
                {serviceCases.map((sc) => (
                  <tr
                    key={sc.id}
                    className="border-t border-slate-200/20 dark:border-white/[0.06] transition-colors hover:bg-white/30 dark:hover:bg-white/[0.06]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        className="font-medium text-slate-700 dark:text-[#e8eaf0] transition-colors hover:text-blue-600 dark:hover:text-[#5a8fcf]"
                        href={`/ams/service-cases/${sc.id}`}
                      >
                        {sc.account_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-[#9da5b4]">{formatCaseType(sc.case_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-slate-400 dark:text-[#9da5b4]">
              No open service cases assigned to you.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
