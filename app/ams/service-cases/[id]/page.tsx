import Link from "next/link";
import { notFound } from "next/navigation";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PriorityBadge } from "@/app/ams/_components/PriorityBadge";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { TimelineFeed } from "@/app/ams/_components/TimelineFeed";
import { ServiceCaseOverviewEditor } from "@/app/ams/service-cases/[id]/ServiceCaseOverviewEditor";

type ServiceCase = {
  id: string;
  case_type: string;
  status: "open" | "in_progress" | "waiting" | "done" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  account_id: string | null;
  policy_id: string | null;
  assigned_to_user_id: string | null;
  due_date: string | null;
  title: string;
  created_at: string;
};

type UserOption = {
  id: string;
  display_name: string;
};

type Account = {
  id: string;
  account_name: string;
};

type Policy = {
  id: string;
  policy_number: string;
};

type TimelineItem = {
  id: string;
  type: string;
  entity_id: string;
  summary: string;
  content: string | null;
  created_at: string;
  created_by: string | null;
};

type TaskRow = {
  id: string;
  status: string;
  title: string;
  due_date: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
};

const TABS = ["overview", "timeline", "tasks"] as const;
type Tab = (typeof TABS)[number];

function normalizeTab(value: string | undefined): Tab {
  if (value && (TABS as readonly string[]).includes(value)) {
    return value as Tab;
  }
  return "overview";
}

export default async function ServiceCaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const tab = normalizeTab(typeof resolvedSearch.tab === "string" ? resolvedSearch.tab : undefined);

  const serviceCaseRequest = await safeApiFetchJson<{ ok: true; data: ServiceCase }>(
    `/api/service-cases/${id}`,
  );
  if (!serviceCaseRequest.ok) {
    return (
      <InlineError
        details={serviceCaseRequest.errorMessage}
        retryHref="/ams/service-cases"
      />
    );
  }

  const [usersRequest, accountsRequest, policiesRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
    safeApiFetchJson<{ ok: true; data: Account[] }>("/api/accounts?page_size=100"),
    safeApiFetchJson<{ ok: true; data: Policy[] }>("/api/policies?page_size=100"),
  ]);

  const serviceCase = serviceCaseRequest.data.data;
  if (!serviceCase) {
    notFound();
  }

  const accountById = new Map(
    (accountsRequest.ok ? accountsRequest.data.data : []).map((row) => [row.id, row.account_name]),
  );
  const policyById = new Map(
    (policiesRequest.ok ? policiesRequest.data.data : []).map((row) => [row.id, row.policy_number]),
  );
  const userById = new Map(
    (usersRequest.ok ? usersRequest.data.data : []).map((row) => [row.id, row.display_name]),
  );

  const [timelineRes, tasksRes] = await Promise.all([
    tab === "timeline"
      ? safeApiFetchJson<{ ok: true; data: TimelineItem[] }>(`/api/service-cases/${id}/timeline`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as TimelineItem[] },
        }),
    tab === "tasks"
      ? safeApiFetchJson<{ ok: true; data: TaskRow[] }>(
          `/api/tasks?linked_entity_type=service_case&linked_entity_id=${id}&page_size=100`,
        )
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as TaskRow[] },
        }),
  ]);

  return (
    <div className="space-y-6">
      <DetailHeader
        title={serviceCase.title}
        subtitle={`${serviceCase.case_type} service case`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={serviceCase.status} />
            <PriorityBadge value={serviceCase.priority} />
            <span>Created {formatDateTime(serviceCase.created_at)}</span>
          </div>
        }
        actions={
          <Link className="text-sm text-blue-700 hover:underline" href="/ams/service-cases">
            Back to Service Cases
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tabKey) => (
          <Link
            className={`rounded border px-3 py-1.5 text-sm ${
              tab === tabKey
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-300/40 bg-white text-slate-700"
            }`}
            href={`/ams/service-cases/${id}?tab=${tabKey}`}
            key={tabKey}
          >
            {tabKey}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200/30 bg-white p-4">
            <h2 className="mb-3 font-medium">Overview</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Account</dt>
                <dd>{serviceCase.account_id ? accountById.get(serviceCase.account_id) ?? serviceCase.account_id.slice(0, 8) : "-"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Policy</dt>
                <dd>
                  {serviceCase.policy_id ? (
                    <Link className="text-blue-700 hover:underline" href={`/ams/policies/${serviceCase.policy_id}`}>
                      {policyById.get(serviceCase.policy_id) ?? serviceCase.policy_id.slice(0, 8)}
                    </Link>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Assigned CSR</dt>
                <dd>
                  {serviceCase.assigned_to_user_id
                    ? userById.get(serviceCase.assigned_to_user_id) ?? serviceCase.assigned_to_user_id.slice(0, 8)
                    : "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Due Date</dt>
                <dd>{formatDate(serviceCase.due_date)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200/30 bg-white p-4">
            <h2 className="mb-3 font-medium">Update Case</h2>
            <ServiceCaseOverviewEditor
              serviceCase={serviceCase}
              users={usersRequest.ok ? usersRequest.data.data : []}
            />
          </div>
        </section>
      ) : null}

      {tab === "timeline" ? (
        timelineRes.ok ? (
          <TimelineFeed items={timelineRes.data.data} />
        ) : (
          <InlineError
            details={timelineRes.errorMessage}
            retryHref={`/ams/service-cases/${id}?tab=timeline`}
          />
        )
      ) : null}

      {tab === "tasks" ? (
        tasksRes.ok ? (
          <DataTable
            columns={[
              {
                key: "title",
                header: "Task",
                render: (item) => (
                  <Link className="font-medium text-blue-700 hover:underline" href={`/ams/tasks/${item.id}`}>
                    {item.title}
                  </Link>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (item) => <StatusBadge value={item.status} />,
              },
              {
                key: "assigned",
                header: "Assigned To",
                render: (item) =>
                  item.assigned_to_user_id
                    ? userById.get(item.assigned_to_user_id) ?? item.assigned_to_user_id.slice(0, 8)
                    : "-",
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
            emptyMessage="No tasks linked to this service case."
            rowKey={(item) => item.id}
            rows={tasksRes.data.data}
          />
        ) : (
          <InlineError
            details={tasksRes.errorMessage}
            retryHref={`/ams/service-cases/${id}?tab=tasks`}
          />
        )
      ) : null}
    </div>
  );
}
