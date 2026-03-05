import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { InlineError } from "@/app/ams/_components/InlineError";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { formatDate } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";

type Policy = {
  id: string;
  account_id: string;
  carrier_id: string | null;
  lob: string;
  policy_number: string;
  status: string;
  effective_date: string;
  expiration_date: string;
  assigned_csr_id: string | null;
};

type Account = {
  id: string;
  account_name: string;
};

type Carrier = {
  id: string;
  name: string;
};

type UserOption = {
  id: string;
  display_name: string;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  const filters = {
    status: typeof resolvedSearch.status === "string" ? resolvedSearch.status : undefined,
    expiring_before:
      typeof resolvedSearch.expiring_before === "string"
        ? resolvedSearch.expiring_before
        : undefined,
    expiring_after:
      typeof resolvedSearch.expiring_after === "string"
        ? resolvedSearch.expiring_after
        : undefined,
  };

  const query = buildQuery({
    status: filters.status,
    expiring_before: filters.expiring_before,
    expiring_after: filters.expiring_after,
    page_size: "100",
  });

  const policiesRequest = await safeApiFetchJson<{ ok: true; data: Policy[] }>(
    `/api/policies${query}`,
  );
  if (!policiesRequest.ok) {
    return (
      <InlineError
        details={policiesRequest.errorMessage}
        retryHref="/ams/policies"
      />
    );
  }

  const [accountsRequest, carriersRequest, usersRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Account[] }>("/api/accounts?page_size=100"),
    safeApiFetchJson<{ ok: true; data: Carrier[] }>("/api/ams/carriers?page_size=100"),
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
  ]);

  const policiesRes = policiesRequest.data;
  const accountsData = accountsRequest.ok ? accountsRequest.data.data : [];
  const carriersData = carriersRequest.ok ? carriersRequest.data.data : [];
  const usersData = usersRequest.ok ? usersRequest.data.data : [];

  const accountById = new Map(accountsData.map((row) => [row.id, row.account_name]));
  const carrierById = new Map(carriersData.map((row) => [row.id, row.name]));
  const userById = new Map(usersData.map((row) => [row.id, row.display_name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Policies" description="Active policy workspace for CSRs." />

      <FilterBar resetHref="/ams/policies">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <Select className="w-full" defaultValue={filters.status ?? ""} name="status">
            <option value="">All</option>
            <option value="quoted">quoted</option>
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="canceled">canceled</option>
            <option value="expired">expired</option>
          </Select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Expiring After</span>
          <Input
            className="w-full"
            defaultValue={filters.expiring_after}
            name="expiring_after"
            type="date"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Expiring Before</span>
          <Input
            className="w-full"
            defaultValue={filters.expiring_before}
            name="expiring_before"
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
            render: (item) => accountById.get(item.account_id) ?? item.account_id.slice(0, 8),
          },
          {
            key: "carrier",
            header: "Carrier",
            render: (item) => (item.carrier_id ? carrierById.get(item.carrier_id) ?? item.carrier_id.slice(0, 8) : "-"),
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
        rows={policiesRes.data}
      />
    </div>
  );
}
