import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { buildRenewalsSnapshotQueryString } from "@/app/ams/_lib/policyQueries";
import type { AmsDashboardData } from "@/app/api/ams/dashboard/route";

type RenewalRow = {
  id: string;
  policy_number: string;
  expiration_date: string;
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function AmsDashboardPage() {
  const today = new Date();
  const endOfWindow = new Date(today);
  endOfWindow.setDate(today.getDate() + 6);

  const renewalsQuery = buildRenewalsSnapshotQueryString({
    from: toIsoDate(today),
    to: toIsoDate(endOfWindow),
  });

  const [renewalsRequest, dashboardRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: RenewalRow[] }>(
      `/api/ams/renewals/snapshot${renewalsQuery}`,
    ),
    safeApiFetchJson<{ ok: true; data: AmsDashboardData }>("/api/ams/dashboard"),
  ]);

  const renewalsCount =
    renewalsRequest.ok && Array.isArray(renewalsRequest.data.data)
      ? renewalsRequest.data.data.length
      : null;
  const nextRenewal =
    renewalsRequest.ok && renewalsRequest.data.data.length > 0
      ? renewalsRequest.data.data[0]
      : null;

  const dashboard = dashboardRequest.ok ? dashboardRequest.data.data : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">AMS Dashboard</h1>
          <p className="text-sm text-zinc-500">Role: csr</p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            href="/ams/work-queue"
          >
            Open Work Queue
          </Link>
          <Link className="rounded border border-zinc-300 px-3 py-2 text-sm" href="/ams/service-cases">
            Service Cases
          </Link>
        </div>
      </div>

      {!dashboardRequest.ok && (
        <p className="text-sm text-rose-600">{dashboardRequest.errorMessage}</p>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Cases Open</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard?.open_cases_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Tasks Due Today</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard?.tasks_due_today_mine ?? "—"}
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-700">Renewals This Week</h2>
              {renewalsRequest.ok ? (
                <>
                  <p className="mt-3 text-2xl font-semibold text-zinc-900">{renewalsCount}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {nextRenewal
                      ? `Next: ${nextRenewal.policy_number}`
                      : "No policies expiring in the next 7 days."}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-2xl font-semibold text-zinc-900">—</p>
                  <p className="mt-2 text-xs text-rose-600">{renewalsRequest.errorMessage}</p>
                </>
              )}
            </div>
            <Link
              className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
              href={`/ams/renewals${renewalsQuery}`}
            >
              View
            </Link>
          </div>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Policies Expiring (30 days)</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {dashboard?.policies_expiring_30_days ?? "—"}
          </p>
        </article>
      </section>
    </div>
  );
}
