import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { InlineError } from "@/app/ams/_components/InlineError";
import {
  buildPoliciesQueryString,
  buildRenewalsSnapshotQueryString,
  parseCanonicalPolicyFilters,
} from "@/app/ams/_lib/policyQueries";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { formatDate } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

type Policy = {
  id: string;
  account_id: string;
  account_name: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  lob: string;
  policy_number: string;
  status: string;
  effective_date: string;
  expiration_date: string;
  assigned_csr_id: string | null;
};

type UserOption = { id: string; display_name: string };

const IS_DEV = process.env.NODE_ENV !== "production";

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  const filters = parseCanonicalPolicyFilters(resolvedSearch);

  const query = buildPoliciesQueryString(filters, { pageSize: 100 });
  const policiesPath = `/api/ams/policies${query}`;
  const renewalsSnapshotPath = `/api/ams/renewals/snapshot${buildRenewalsSnapshotQueryString(
    filters,
  )}`;

  if (IS_DEV) {
    console.info("[ams/policies] canonical filter comparison", {
      policiesParams: { from: filters.from, to: filters.to, status: filters.status, page_size: 100 },
      renewalsParams: {
        from: filters.from,
        to: filters.to,
        status: filters.status,
        assigned_to: filters.assigned_to,
      },
    });
  }

  const policiesRequest = await safeApiFetchJson<{ ok: true; data: Policy[] }>(
    policiesPath,
  );
  const renewalsComparisonRequest = IS_DEV
    ? await safeApiFetchJson<{ ok: true; data: Policy[] }>(renewalsSnapshotPath)
    : null;
  const policyRows =
    policiesRequest.ok && Array.isArray((policiesRequest.data as { data?: unknown }).data)
      ? (policiesRequest.data.data as Policy[])
      : [];
  const responseShapeValid =
    policiesRequest.ok &&
    !!policiesRequest.data &&
    typeof policiesRequest.data === "object" &&
    Array.isArray((policiesRequest.data as { data?: unknown }).data);

  const debugPanel = IS_DEV ? (
    <Card>
      <CardHeader>
        <CardTitle>Policies Debug (DEV only)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p>
          <span className="font-semibold">Request:</span> {policiesRequest.requestUrl}
        </p>
        <p>
          <span className="font-semibold">Response:</span> {policiesRequest.status}
          {policiesRequest.ok
            ? `, count=${policyRows.length}`
            : `, error=${policiesRequest.errorMessage}`}
        </p>
        <p className="break-all whitespace-pre-wrap rounded-lg border border-white/50 bg-white/30 p-2">
          {policiesRequest.responsePreview || "(empty response body)"}
        </p>
        <p>
          <span className="font-semibold">Compare renewals path:</span> {renewalsSnapshotPath}
        </p>
        {renewalsComparisonRequest ? (
          <p>
            <span className="font-semibold">Renewals response:</span>{" "}
            {renewalsComparisonRequest.status}
            {renewalsComparisonRequest.ok
              ? `, count=${Array.isArray(renewalsComparisonRequest.data.data) ? renewalsComparisonRequest.data.data.length : "unknown"}`
              : `, error=${renewalsComparisonRequest.errorMessage}`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  if (!policiesRequest.ok) {
    return (
      <div className="space-y-6">
        {debugPanel}
        <InlineError
          details={`Status ${policiesRequest.status}: ${policiesRequest.errorMessage}`}
          retryHref="/ams/policies"
          title="Couldn't load policies."
        />
      </div>
    );
  }

  if (!responseShapeValid) {
    return (
      <div className="space-y-6">
        {debugPanel}
        <InlineError
          details="Status 200 but unexpected response shape from /api/ams/policies."
          retryHref="/ams/policies"
          title="Couldn't parse policies response."
        />
      </div>
    );
  }

  const usersRequest = await safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users");

  const usersData = usersRequest.ok ? usersRequest.data.data : [];

  const userById = new Map(usersData.map((row) => [row.id, row.display_name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Policies" description="Active policy workspace for CSRs." />
      {debugPanel}

      <FilterBar resetHref="/ams/policies">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <Select className="w-full" defaultValue={filters.status ?? ""} name="status">
            <option value="">All (includes active, pending, quoted)</option>
            <option value="quoted">quoted</option>
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="canceled">canceled</option>
            <option value="expired">expired</option>
          </Select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Expiring After</span>
          <Input
            className="w-full"
            defaultValue={filters.from}
            name="from"
            type="date"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Expiring Before</span>
          <Input
            className="w-full"
            defaultValue={filters.to}
            name="to"
            type="date"
          />
        </label>
      </FilterBar>

      <DataTable
        columns={[
          {
            key: "policy_number",
            header: "Policy Number",
            render: (item) => (
              <Link className="font-medium text-blue-700 hover:underline" href={`/ams/policies/${item.id}`}>
                {item.policy_number}
              </Link>
            ),
          },
          {
            key: "account",
            header: "Account",
            render: (item) => item.account_name ?? item.account_id.slice(0, 8),
          },
          {
            key: "carrier",
            header: "Carrier",
            render: (item) =>
              item.carrier_id
                ? item.carrier_name ?? item.carrier_id.slice(0, 8)
                : "-",
          },
          {
            key: "lob",
            header: "LOB",
            render: (item) => item.lob,
          },
          {
            key: "status",
            header: "Status",
            render: (item) => <StatusBadge value={item.status} />,
          },
          {
            key: "effective",
            header: "Effective Date",
            render: (item) => formatDate(item.effective_date),
          },
          {
            key: "expiration",
            header: "Expiration Date",
            render: (item) => formatDate(item.expiration_date),
          },
          {
            key: "csr",
            header: "CSR",
            render: (item) =>
              item.assigned_csr_id
                ? userById.get(item.assigned_csr_id) ?? item.assigned_csr_id.slice(0, 8)
                : "-",
          },
        ]}
        emptyMessage="No policies matched the selected filters."
        rowKey={(item) => item.id}
        rows={policyRows}
      />
    </div>
  );
}
