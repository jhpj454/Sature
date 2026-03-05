import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatDateTime } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { PriorityBadge } from "@/app/ams/_components/PriorityBadge";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { Select } from "@/app/components/ui/select";

type ServiceCase = {
  id: string;
  case_type: string;
  status: string;
  priority: string;
  account_id: string | null;
  policy_id: string | null;
  assigned_to_user_id: string | null;
  title: string;
  created_at: string;
};

type Account = {
  id: string;
  account_name: string;
};

type Policy = {
  id: string;
  policy_number: string;
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

export default async function ServiceCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  const filters = {
    status: typeof resolvedSearch.status === "string" ? resolvedSearch.status : undefined,
    priority:
      typeof resolvedSearch.priority === "string" ? resolvedSearch.priority : undefined,
  };

  const query = buildQuery({
    status: filters.status,
    priority: filters.priority,
    page_size: "100",
  });

  const casesRequest = await safeApiFetchJson<{ ok: true; data: ServiceCase[] }>(
    `/api/service-cases${query}`,
  );
  if (!casesRequest.ok) {
    return (
      <InlineError
        details={casesRequest.errorMessage}
        retryHref="/ams/service-cases"
      />
    );
  }

  const [accountsRequest, policiesRequest, usersRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Account[] }>("/api/accounts?page_size=100"),
    safeApiFetchJson<{ ok: true; data: Policy[] }>("/api/policies?page_size=100"),
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
  ]);

  const casesRes = casesRequest.data;
  const accountsData = accountsRequest.ok ? accountsRequest.data.data : [];
  const policiesData = policiesRequest.ok ? policiesRequest.data.data : [];
  const usersData = usersRequest.ok ? usersRequest.data.data : [];

  const accountById = new Map(accountsData.map((row) => [row.id, row.account_name]));
  const policyById = new Map(policiesData.map((row) => [row.id, row.policy_number]));
  const userById = new Map(usersData.map((row) => [row.id, row.display_name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Service Cases" description="CSR case management and follow-ups." />

      <FilterBar resetHref="/ams/service-cases">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <Select className="w-full" defaultValue={filters.status ?? ""} name="status">
            <option value="">All</option>
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="waiting">waiting</option>
            <option value="done">done</option>
            <option value="closed">closed</option>
          </Select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Priority</span>
          <Select className="w-full" defaultValue={filters.priority ?? ""} name="priority">
            <option value="">All</option>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </Select>
        </label>
      </FilterBar>

      <DataTable
        columns={[
          {
            key: "title",
            header: "Title",
            render: (item) => (
              <Link className="font-medium text-blue-700 hover:underline" href={`/ams/service-cases/${item.id}`}>
                {item.title}
              </Link>
            ),
          },
          {
            key: "account",
            header: "Account",
            render: (item) =>
              item.account_id ? accountById.get(item.account_id) ?? item.account_id.slice(0, 8) : "-",
          },
          {
            key: "policy",
            header: "Policy",
            render: (item) =>
              item.policy_id ? policyById.get(item.policy_id) ?? item.policy_id.slice(0, 8) : "-",
          },
          {
            key: "case_type",
            header: "Case Type",
            render: (item) => item.case_type,
          },
          {
            key: "priority",
            header: "Priority",
            render: (item) => <PriorityBadge value={item.priority} />,
          },
          {
            key: "status",
            header: "Status",
            render: (item) => <StatusBadge value={item.status} />,
          },
          {
            key: "assigned",
            header: "Assigned CSR",
            render: (item) =>
              item.assigned_to_user_id
                ? userById.get(item.assigned_to_user_id) ?? item.assigned_to_user_id.slice(0, 8)
                : "-",
          },
          {
            key: "created",
            header: "Created At",
            render: (item) => formatDateTime(item.created_at),
          },
        ]}
        emptyMessage="No service cases matched the current filters."
        rowKey={(item) => item.id}
        rows={casesRes.data}
      />
    </div>
  );
}
