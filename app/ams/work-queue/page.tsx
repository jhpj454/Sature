import Link from "next/link";
import { InlineError } from "@/app/ams/_components/InlineError";
import { requireSession, safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { PriorityBadge } from "@/app/ams/_components/PriorityBadge";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";

type UserOption = {
  id: string;
  display_name: string;
};

type WorkQueueItem = {
  type: "task" | "service_case";
  entity_id: string;
  title: string;
  account_id: string | null;
  account_name: string | null;
  policy_id: string | null;
  policy_number: string | null;
  priority: string;
  status: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  created_at: string;
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

function rowHref(item: WorkQueueItem) {
  if (item.type === "service_case") {
    return `/ams/service-cases/${item.entity_id}`;
  }
  return `/ams/tasks/${item.entity_id}`;
}

export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  const session = await requireSession();

  const filters = {
    status: typeof resolvedSearch.status === "string" ? resolvedSearch.status : undefined,
    priority:
      typeof resolvedSearch.priority === "string" ? resolvedSearch.priority : undefined,
    type: typeof resolvedSearch.type === "string" ? resolvedSearch.type : undefined,
    assigned_to:
      typeof resolvedSearch.assigned_to === "string"
        ? resolvedSearch.assigned_to
        : session.user_id,
  };

  const query = buildQuery({
    status: filters.status,
    priority: filters.priority,
    type: filters.type,
    assigned_to_user_id: filters.assigned_to,
  });

  const retryHref = `/ams/work-queue${query}`;
  const [queueRes, usersRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: WorkQueueItem[] }>(`/api/work-queue${query}`),
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
  ]);

  const userOptions = usersRes.ok ? usersRes.data.data : [];
  const showDebug = process.env.NODE_ENV !== "production";
  const queueRows = queueRes.ok ? queueRes.data.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Queue"
        description="Primary CSR queue across service cases and tasks."
      />

      <FilterBar resetHref="/ams/work-queue">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400 dark:text-[#9da5b4]">Status</span>
          <select className="w-full rounded border border-slate-300/40 px-2 py-1" name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="waiting">waiting</option>
            <option value="done">done</option>
            <option value="closed">closed</option>
            <option value="completed">completed</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400 dark:text-[#9da5b4]">Priority</span>
          <select className="w-full rounded border border-slate-300/40 px-2 py-1" name="priority" defaultValue={filters.priority ?? ""}>
            <option value="">All</option>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400 dark:text-[#9da5b4]">Type</span>
          <select className="w-full rounded border border-slate-300/40 px-2 py-1" name="type" defaultValue={filters.type ?? ""}>
            <option value="">All</option>
            <option value="service_case">service_case</option>
            <option value="task">task</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400 dark:text-[#9da5b4]">Assigned To</span>
          <select
            className="w-full rounded border border-slate-300/40 px-2 py-1"
            defaultValue={filters.assigned_to ?? ""}
            name="assigned_to"
          >
            <option value="">Anyone</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      {!queueRes.ok ? (
        <div className="space-y-3">
          <InlineError
            title="Couldn’t load work queue."
            details={`Status ${queueRes.status || 500}: ${queueRes.errorMessage}`}
            retryHref={retryHref}
          />
          {showDebug ? (
            <div className="rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-4 text-sm text-slate-700 dark:text-[#e8eaf0] backdrop-blur-xl">
              <p>
                <span className="font-medium">Request:</span> {queueRes.requestUrl}
              </p>
              <p>
                <span className="font-medium">Response:</span> {queueRes.status}
              </p>
              {queueRes.responsePreview ? (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/50 dark:border dark:border-white/[0.06] bg-white/45 dark:bg-white/[0.08] p-3 text-xs text-slate-700 dark:text-[#e8eaf0]">
                  {queueRes.responsePreview}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "type",
              header: "Type",
              render: (item) => (
                <span className="rounded bg-blue-50/60 px-2 py-0.5 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-200/50">
                  {item.type}
                </span>
              ),
            },
            {
              key: "title",
              header: "Title",
              render: (item) => (
                <Link className="font-medium text-blue-700 dark:text-[#5a8fcf] dark:hover:text-[#7aaad9] hover:underline" href={rowHref(item)}>
                  {item.title}
                </Link>
              ),
            },
            {
              key: "account",
              header: "Account",
              render: (item) =>
                item.account_name ?? (item.account_id ? item.account_id.slice(0, 8) : "-"),
            },
            {
              key: "policy",
              header: "Policy",
              render: (item) =>
                item.policy_number ?? (item.policy_id ? item.policy_id.slice(0, 8) : "-"),
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
              header: "Assigned To",
              render: (item) => item.assigned_to_name ?? "-",
            },
            {
              key: "due",
              header: "Due Date",
              render: (item) => formatDate(item.due_date),
            },
            {
              key: "created",
              header: "Created At",
              render: (item) => formatDateTime(item.created_at),
            },
          ]}
          emptyMessage="No items in queue for the selected filters."
          rowKey={(item) => `${item.type}:${item.entity_id}`}
          rows={queueRows}
        />
      )}
    </div>
  );
}
