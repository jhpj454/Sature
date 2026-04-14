import Link from "next/link";
import { apiFetch } from "@/app/ams/_lib/api";
import {
  buildRenewalsSnapshotQueryString,
  parseCanonicalPolicyFilters,
} from "@/app/ams/_lib/policyQueries";
import { formatCurrency, formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

type RenewalRow = {
  id: string;
  policy_number: string;
  lob: string;
  expiration_date: string;
  renewal_status: string;
  renewal_assigned_to: string | null;
  renewal_last_touch_at: string | null;
  renewal_next_action_at: string | null;
  carrier_name: string | null;
  open_service_cases_count: number;
  latest_transaction_type: string | null;
  latest_transaction_date: string | null;
  agency_revenue_estimate_amount: string | number | null;
};

export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const filters = parseCanonicalPolicyFilters(resolved);

  const snapshot = await apiFetch<{ ok: true; data: RenewalRow[] }>(
    `/api/ams/renewals/snapshot${buildRenewalsSnapshotQueryString(filters)}`,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Renewals Dashboard</h1>
        <p className="text-sm text-zinc-500">Expiring policies with renewal workflow context.</p>
      </div>

      <form className="grid gap-3 rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm md:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">From</span>
          <Input
            className="w-full"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">To</span>
          <Input
            className="w-full"
            name="to"
            type="date"
            defaultValue={filters.to}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <Select className="w-full" name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            <option value="not_started">not_started</option>
            <option value="in_progress">in_progress</option>
            <option value="quoted">quoted</option>
            <option value="bound">bound</option>
            <option value="lost">lost</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Assigned To (User ID)</span>
          <Input
            className="w-full"
            name="assigned_to"
            type="text"
            defaultValue={filters.assigned_to}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            type="submit"
          >
            Apply
          </button>
          <Link className="rounded-lg border border-white/60 bg-white/50 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-white/80" href="/ams/renewals">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-white/40 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Policy</th>
              <th className="px-3 py-2">Carrier</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Renewal</th>
              <th className="px-3 py-2">Last Touch</th>
              <th className="px-3 py-2">Next Action</th>
              <th className="px-3 py-2">Open Cases</th>
              <th className="px-3 py-2">Latest Tx</th>
              <th className="px-3 py-2">Revenue Est.</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.data.map((policy) => (
              <tr key={policy.id} className="border-t border-zinc-200/40 transition-colors hover:bg-white/40">
                <td className="px-3 py-2">
                  <Link className="font-medium text-blue-700 hover:underline" href={`/ams/policies/${policy.id}`}>
                    {policy.policy_number}
                  </Link>
                  <div className="text-xs text-zinc-500">{policy.lob}</div>
                </td>
                <td className="px-3 py-2">{policy.carrier_name ?? "-"}</td>
                <td className="px-3 py-2">{formatDate(policy.expiration_date)}</td>
                <td className="px-3 py-2">{policy.renewal_status}</td>
                <td className="px-3 py-2">{formatDateTime(policy.renewal_last_touch_at)}</td>
                <td className="px-3 py-2">{formatDateTime(policy.renewal_next_action_at)}</td>
                <td className="px-3 py-2">{policy.open_service_cases_count}</td>
                <td className="px-3 py-2">
                  {policy.latest_transaction_type ?? "-"}
                  {policy.latest_transaction_date ? (
                    <div className="text-xs text-zinc-500">{formatDate(policy.latest_transaction_date)}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {formatCurrency(policy.agency_revenue_estimate_amount)}
                </td>
              </tr>
            ))}
            {snapshot.data.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={9}>
                  No expiring policies matched the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
