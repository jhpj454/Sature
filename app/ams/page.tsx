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
    not_started: "bg-slate-100/60 text-slate-500",
    in_progress: "bg-blue-50/60 text-blue-600",
    quoted: "bg-amber-50/60 text-amber-600",
    bound: "bg-emerald-50/60 text-emerald-600",
    lost: "bg-rose-50/60 text-rose-500",
  };
  const labels: Record<string, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    quoted: "Quoted",
    bound: "Bound",
    lost: "Lost",
  };

  const cls = styles[status] ?? "bg-slate-100/60 text-slate-500";
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">AMS Dashboard</h1>
          <p className="text-sm text-slate-400">Your agency at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-lg bg-slate-800 px-3 py-2 text-[13px] font-medium text-white shadow-sm transition-all duration-200 hover:bg-slate-700"
            href="/ams/work-queue"
          >
            Open Work Queue
          </Link>
          <Link
            className="rounded-lg border border-white/50 bg-white/30 px-3 py-2 text-[13px] text-slate-500 backdrop-blur-sm transition-all duration-200 hover:bg-white/50 hover:text-slate-700"
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
        <article
          className="rounded-2xl border border-white/50 bg-white/45 p-5 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cases Open</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800">
            {dashboard?.open_cases_mine ?? "—"}
          </p>
        </article>
        <article
          className="rounded-2xl border border-white/50 bg-white/45 p-5 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tasks Due Today</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800">
            {dashboard?.tasks_due_today_mine ?? "—"}
          </p>
        </article>
        <article
          className="rounded-2xl border border-white/50 bg-white/45 p-5 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Renewals Next 30 Days</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800">
            {dashboard?.policies_expiring_30_days ?? "—"}
          </p>
        </article>
        <article
          className="rounded-2xl border border-white/50 bg-white/45 p-5 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">In Progress</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800">
            {dashboard?.renewals_in_progress_mine ?? "—"}
          </p>
        </article>
      </section>

      {/* Upcoming Renewals table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-700">Upcoming Renewals</h2>
            <p className="text-xs text-slate-400">
              {renewals.length > 0
                ? `${renewals.length} polic${renewals.length === 1 ? "y" : "ies"} renewing in the next 30 days`
                : "No renewals in the next 30 days"}
            </p>
          </div>
          <Link
            className="text-xs text-slate-400 transition-colors hover:text-slate-700"
            href="/ams/renewals"
          >
            View all →
          </Link>
        </div>
        <div
          className="overflow-x-auto rounded-2xl border border-white/50 bg-white/45 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/30 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                  className="border-t border-slate-200/20 transition-colors hover:bg-white/30"
                >
                  <td className="px-5 py-3">
                    <Link
                      className="font-medium text-slate-700 transition-colors hover:text-blue-600"
                      href={`/ams/policies/${renewal.id}`}
                    >
                      {renewal.client_name ?? renewal.policy_number}
                    </Link>
                    {renewal.client_name && (
                      <div className="text-xs text-slate-400">{renewal.policy_number}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatLob(renewal.lob)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(renewal.expiration_date)}</td>
                  <td className="px-5 py-3">
                    <RenewalStatusBadge status={renewal.renewal_status} />
                  </td>
                </tr>
              ))}
              {renewals.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-sm text-slate-400" colSpan={4}>
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
            <h2 className="text-base font-semibold text-slate-700">Open Service Cases</h2>
            <p className="text-xs text-slate-400">
              {serviceCases.length > 0
                ? `${serviceCases.length} open case${serviceCases.length === 1 ? "" : "s"} assigned to you`
                : "No open service cases"}
            </p>
          </div>
          <Link
            className="text-xs text-slate-400 transition-colors hover:text-slate-700"
            href="/ams/service-cases"
          >
            View all →
          </Link>
        </div>
        <div
          className="rounded-2xl border border-white/50 bg-white/45 backdrop-blur-xl"
          style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
        >
          {serviceCases.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/30 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Service Type</th>
                </tr>
              </thead>
              <tbody>
                {serviceCases.map((sc) => (
                  <tr
                    key={sc.id}
                    className="border-t border-slate-200/20 transition-colors hover:bg-white/30"
                  >
                    <td className="px-5 py-3">
                      <Link
                        className="font-medium text-slate-700 transition-colors hover:text-blue-600"
                        href={`/ams/service-cases/${sc.id}`}
                      >
                        {sc.account_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatCaseType(sc.case_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-slate-400">
              No open service cases assigned to you.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
