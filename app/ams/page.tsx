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
    not_started: "bg-zinc-100 text-zinc-600",
    in_progress: "bg-blue-50 text-blue-700",
    quoted: "bg-amber-50 text-amber-700",
    bound: "bg-emerald-50 text-emerald-700",
    lost: "bg-rose-50 text-rose-700",
  };
  const labels: Record<string, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    quoted: "Quoted",
    bound: "Bound",
    lost: "Lost",
  };

  const cls = styles[status] ?? "bg-zinc-100 text-zinc-600";
  const label = labels[status] ?? status;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
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
          <h1 className="text-2xl font-semibold text-zinc-900">AMS Dashboard</h1>
          <p className="text-sm text-zinc-500">Your agency at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            href="/ams/work-queue"
          >
            Open Work Queue
          </Link>
          <Link
            className="rounded-lg border border-white/60 bg-white/50 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-white/80"
            href="/ams/service-cases"
          >
            Service Cases
          </Link>
        </div>
      </div>

      {!dashboardRequest.ok && (
        <p className="text-sm text-rose-600">{dashboardRequest.errorMessage}</p>
      )}

      {/* Summary stats */}
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cases Open</h2>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {dashboard?.open_cases_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tasks Due Today</h2>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {dashboard?.tasks_due_today_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Renewals Next 30 Days</h2>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {dashboard?.policies_expiring_30_days ?? "—"}
          </p>
        </article>
        <article className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">In Progress</h2>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {dashboard?.renewals_in_progress_mine ?? "—"}
          </p>
        </article>
      </section>

      {/* Upcoming Renewals table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Upcoming Renewals</h2>
            <p className="text-xs text-zinc-500">
              {renewals.length > 0
                ? `${renewals.length} polic${renewals.length === 1 ? "y" : "ies"} renewing in the next 30 days`
                : "No renewals in the next 30 days"}
            </p>
          </div>
          <Link
            className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
            href="/ams/renewals"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 bg-white/40 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Policy Type</th>
                <th className="px-4 py-3">Renews</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((renewal) => (
                <tr
                  key={renewal.id}
                  className="border-t border-zinc-200/40 transition-colors hover:bg-white/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-zinc-900 hover:text-blue-700 hover:underline"
                      href={`/ams/policies/${renewal.id}`}
                    >
                      {renewal.client_name ?? renewal.policy_number}
                    </Link>
                    {renewal.client_name && (
                      <div className="text-xs text-zinc-400">{renewal.policy_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{formatLob(renewal.lob)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDate(renewal.expiration_date)}</td>
                  <td className="px-4 py-3">
                    <RenewalStatusBadge status={renewal.renewal_status} />
                  </td>
                </tr>
              ))}
              {renewals.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-zinc-400" colSpan={4}>
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
            <h2 className="text-base font-semibold text-zinc-900">Open Service Cases</h2>
            <p className="text-xs text-zinc-500">
              {serviceCases.length > 0
                ? `${serviceCases.length} open case${serviceCases.length === 1 ? "" : "s"} assigned to you`
                : "No open service cases"}
            </p>
          </div>
          <Link
            className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
            href="/ams/service-cases"
          >
            View all →
          </Link>
        </div>
        <div className="rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
          {serviceCases.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 bg-white/40 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Service Type</th>
                </tr>
              </thead>
              <tbody>
                {serviceCases.map((sc) => (
                  <tr
                    key={sc.id}
                    className="border-t border-zinc-200/40 transition-colors hover:bg-white/40"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        className="font-medium text-zinc-900 hover:text-blue-700 hover:underline"
                        href={`/ams/service-cases/${sc.id}`}
                      >
                        {sc.account_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{formatCaseType(sc.case_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              No open service cases assigned to you.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
