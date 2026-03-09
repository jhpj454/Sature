import Link from "next/link";
import { notFound } from "next/navigation";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatCurrency, formatDate } from "@/app/ams/_lib/format";
import { DataTable } from "@/app/ams/_components/DataTable";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PriorityBadge } from "@/app/ams/_components/PriorityBadge";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { InterestedPartiesPanel } from "./InterestedPartiesPanel";
import { LimitsPanel } from "./LimitsPanel";
import { CoveragesPanel } from "./CoveragesPanel";
import { EndorsementsPanel } from "./EndorsementsPanel";
import { ScheduleItemsPanel } from "./ScheduleItemsPanel";
import type { InterestedParty } from "./InterestedPartiesPanel";
import type { PolicyLimit } from "./LimitsPanel";
import type { PolicyCoverage } from "./CoveragesPanel";
import type { PolicyEndorsement } from "./EndorsementsPanel";
import type { PolicyScheduleItem } from "./ScheduleItemsPanel";

type Policy = {
  id: string;
  account_id: string;
  carrier_id: string | null;
  lob: string;
  policy_number: string;
  effective_date: string;
  expiration_date: string;
  status: string;
  premium_amount: string | number;
  commission_estimate_amount: string | number;
  agency_revenue_estimate_amount: string | number;
  assigned_csr_id: string | null;
  renewal_status: string | null;
  renewal_assigned_to: string | null;
  renewal_last_touch_at: string | null;
  renewal_next_action_at: string | null;
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

type PolicyExposure = {
  id: string;
  exposure_type: string;
  data_json: Record<string, unknown>;
  created_at: string;
};

type PolicyTransaction = {
  id: string;
  transaction_type: string;
  status: string;
  effective_date: string | null;
  premium_delta: string | number | null;
  commission_delta: string | number;
  assigned_to_user_id?: string | null;
  created_by?: string | null;
};

type ServiceCase = {
  id: string;
  case_type: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  due_date: string | null;
};

type RenewalRule = {
  id: string;
  is_enabled: boolean;
  days_before_expiration: number;
  create_case: boolean;
  case_priority: string;
};

const TABS = ["overview", "exposures", "transactions", "renewal", "parties", "limits", "coverages", "endorsements", "schedule"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  exposures: "Exposures",
  transactions: "Transactions",
  renewal: "Renewal",
  parties: "Interested Parties",
  limits: "Limits",
  coverages: "Coverages",
  endorsements: "Endorsements",
  schedule: "Schedule",
};
const RENEWAL_OFFSETS = [120, 90, 60, 30, 14, 7, 1] as const;

function normalizeTab(value: string | undefined): Tab {
  if (value && (TABS as readonly string[]).includes(value)) {
    return value as Tab;
  }
  return "overview";
}

function daysUntil(dateValue: string) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = new Date(`${dateValue}T00:00:00Z`);
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function formatJsonBlock(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export default async function PolicyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const tab = normalizeTab(typeof resolvedSearch.tab === "string" ? resolvedSearch.tab : undefined);

  const policyRequest = await safeApiFetchJson<{ ok: true; data: Policy }>(`/api/policies/${id}`);
  if (!policyRequest.ok) {
    return (
      <InlineError
        details={policyRequest.errorMessage}
        retryHref="/ams/policies"
      />
    );
  }

  const [accountsRequest, carriersRequest, usersRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Account[] }>("/api/accounts?page_size=100"),
    safeApiFetchJson<{ ok: true; data: Carrier[] }>("/api/ams/carriers?page_size=100"),
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
  ]);

  const policy = policyRequest.data.data;
  if (!policy) {
    notFound();
  }

  const accountById = new Map(
    (accountsRequest.ok ? accountsRequest.data.data : []).map((row) => [row.id, row.account_name]),
  );
  const carrierById = new Map(
    (carriersRequest.ok ? carriersRequest.data.data : []).map((row) => [row.id, row.name]),
  );
  const userById = new Map(
    (usersRequest.ok ? usersRequest.data.data : []).map((row) => [row.id, row.display_name]),
  );

  const [
    exposuresRes,
    transactionsRes,
    rulesRes,
    serviceCasesRes,
    partiesRes,
    limitsRes,
    coveragesRes,
    endorsementsRes,
    scheduleRes,
  ] = await Promise.all([
    tab === "exposures"
      ? safeApiFetchJson<{ ok: true; data: PolicyExposure[] }>(`/api/policies/${id}/exposures`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyExposure[] },
        }),
    tab === "transactions"
      ? safeApiFetchJson<{ ok: true; data: PolicyTransaction[] }>(`/api/policies/${id}/transactions`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyTransaction[] },
        }),
    tab === "renewal"
      ? safeApiFetchJson<{ ok: true; data: RenewalRule[] }>("/api/renewal-rules")
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as RenewalRule[] },
        }),
    tab === "renewal"
      ? safeApiFetchJson<{ ok: true; data: ServiceCase[] }>(
          `/api/service-cases?policy_id=${id}&page_size=100`,
        )
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as ServiceCase[] },
        }),
    tab === "parties"
      ? safeApiFetchJson<{ ok: true; data: InterestedParty[] }>(`/api/policies/${id}/interested-parties`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as InterestedParty[] },
        }),
    tab === "limits"
      ? safeApiFetchJson<{ ok: true; data: PolicyLimit[] }>(`/api/policies/${id}/limits`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyLimit[] },
        }),
    tab === "coverages"
      ? safeApiFetchJson<{ ok: true; data: PolicyCoverage[] }>(`/api/policies/${id}/coverages`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyCoverage[] },
        }),
    tab === "endorsements"
      ? safeApiFetchJson<{ ok: true; data: PolicyEndorsement[] }>(`/api/policies/${id}/endorsements`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyEndorsement[] },
        }),
    tab === "schedule"
      ? safeApiFetchJson<{ ok: true; data: PolicyScheduleItem[] }>(`/api/policies/${id}/schedule-items`)
      : Promise.resolve({
          ok: true as const,
          status: 200,
          data: { ok: true as const, data: [] as PolicyScheduleItem[] },
        }),
  ]);

  const exposuresData = exposuresRes.ok ? exposuresRes.data.data : [];
  const transactionsData = transactionsRes.ok ? transactionsRes.data.data : [];
  const rulesData = rulesRes.ok ? rulesRes.data.data : [];
  const serviceCasesData = serviceCasesRes.ok ? serviceCasesRes.data.data : [];
  const partiesData = partiesRes.ok ? partiesRes.data.data : [];
  const limitsData = limitsRes.ok ? limitsRes.data.data : [];
  const coveragesData = coveragesRes.ok ? coveragesRes.data.data : [];
  const endorsementsData = endorsementsRes.ok ? endorsementsRes.data.data : [];
  const scheduleData = scheduleRes.ok ? scheduleRes.data.data : [];

  const ruleByOffset = new Map(
    rulesData
      .filter((rule) => rule.is_enabled && rule.create_case)
      .map((rule) => [Number(rule.days_before_expiration), rule]),
  );

  const renewalCases = serviceCasesData.filter((item) => item.case_type === "renewal");
  const daysRemaining = daysUntil(policy.expiration_date);

  return (
    <div className="space-y-6">
      <DetailHeader
        title={`Policy ${policy.policy_number}`}
        subtitle={`${policy.lob} policy`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={policy.status} />
            <span>Account: {accountById.get(policy.account_id) ?? policy.account_id.slice(0, 8)}</span>
            <span>Carrier: {policy.carrier_id ? carrierById.get(policy.carrier_id) ?? policy.carrier_id.slice(0, 8) : "-"}</span>
          </div>
        }
        actions={
          <Link className="text-sm text-blue-700 hover:underline" href="/ams/policies">
            Back to Policies
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tabKey) => (
          <Link
            className={`rounded border px-3 py-1.5 text-sm ${
              tab === tabKey
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
            href={`/ams/policies/${id}?tab=${tabKey}`}
            key={tabKey}
          >
            {TAB_LABELS[tabKey]}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-medium">Overview</h2>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Effective Date</dt>
              <dd>{formatDate(policy.effective_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Expiration Date</dt>
              <dd>{formatDate(policy.expiration_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Premium</dt>
              <dd>{formatCurrency(policy.premium_amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Commission Estimate</dt>
              <dd>{formatCurrency(policy.commission_estimate_amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Agency Revenue</dt>
              <dd>{formatCurrency(policy.agency_revenue_estimate_amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Assigned CSR</dt>
              <dd>
                {policy.assigned_csr_id
                  ? userById.get(policy.assigned_csr_id) ?? policy.assigned_csr_id.slice(0, 8)
                  : "-"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {tab === "exposures" ? (
        <section className="space-y-3">
          {!exposuresRes.ok ? (
            <InlineError
              details={exposuresRes.errorMessage}
              retryHref={`/ams/policies/${id}?tab=exposures`}
            />
          ) : exposuresData.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
              No exposures recorded.
            </div>
          ) : (
            exposuresData.map((exposure) => (
              <article className="rounded-lg border border-zinc-200 bg-white p-4" key={exposure.id}>
                <h3 className="font-medium">{exposure.exposure_type}</h3>
                <p className="mb-2 text-xs text-zinc-500">Created {formatDate(exposure.created_at)}</p>
                <pre className="overflow-x-auto rounded bg-zinc-950/95 p-3 text-xs text-zinc-100">
                  {formatJsonBlock(exposure.data_json)}
                </pre>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === "transactions" ? (
        transactionsRes.ok ? (
          <DataTable
            columns={[
              {
                key: "type",
                header: "Transaction Type",
                render: (item) => item.transaction_type,
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
                key: "premium_delta",
                header: "Premium Delta",
                render: (item) => formatCurrency(item.premium_delta),
              },
              {
                key: "revenue_delta",
                header: "Revenue Delta",
                render: (item) => formatCurrency(item.commission_delta),
              },
              {
                key: "csr",
                header: "Assigned CSR",
                render: (item) =>
                  item.assigned_to_user_id
                    ? userById.get(item.assigned_to_user_id) ?? item.assigned_to_user_id.slice(0, 8)
                    : "-",
              },
            ]}
            emptyMessage="No transactions for this policy."
            rowKey={(item) => item.id}
            rows={transactionsData}
          />
        ) : (
          <InlineError
            details={transactionsRes.errorMessage}
            retryHref={`/ams/policies/${id}?tab=transactions`}
          />
        )
      ) : null}

      {tab === "parties" ? (
        partiesRes.ok ? (
          <InterestedPartiesPanel initialData={partiesData} policyId={id} />
        ) : (
          <InlineError details={partiesRes.errorMessage} retryHref={`/ams/policies/${id}?tab=parties`} />
        )
      ) : null}

      {tab === "limits" ? (
        limitsRes.ok ? (
          <LimitsPanel initialData={limitsData} policyId={id} />
        ) : (
          <InlineError details={limitsRes.errorMessage} retryHref={`/ams/policies/${id}?tab=limits`} />
        )
      ) : null}

      {tab === "coverages" ? (
        coveragesRes.ok ? (
          <CoveragesPanel initialData={coveragesData} policyId={id} />
        ) : (
          <InlineError details={coveragesRes.errorMessage} retryHref={`/ams/policies/${id}?tab=coverages`} />
        )
      ) : null}

      {tab === "endorsements" ? (
        endorsementsRes.ok ? (
          <EndorsementsPanel initialData={endorsementsData} policyId={id} />
        ) : (
          <InlineError details={endorsementsRes.errorMessage} retryHref={`/ams/policies/${id}?tab=endorsements`} />
        )
      ) : null}

      {tab === "schedule" ? (
        scheduleRes.ok ? (
          <ScheduleItemsPanel initialData={scheduleData} policyId={id} />
        ) : (
          <InlineError details={scheduleRes.errorMessage} retryHref={`/ams/policies/${id}?tab=schedule`} />
        )
      ) : null}

      {tab === "renewal" ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 font-medium">Renewal Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Expiration Date</dt>
                <dd>{formatDate(policy.expiration_date)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Days Until Expiration</dt>
                <dd>{daysRemaining}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Renewal Status</dt>
                <dd>{policy.renewal_status ?? "-"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 font-medium">Renewal Rules Triggered</h3>
            {!rulesRes.ok ? (
              <InlineError details={rulesRes.errorMessage} retryHref={`/ams/policies/${id}?tab=renewal`} />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {RENEWAL_OFFSETS.map((offset) => {
                  const rule = ruleByOffset.get(offset);
                  const isTodayTrigger = daysRemaining === offset;
                  return (
                    <div className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm" key={offset}>
                      <span>{offset} days</span>
                      <div className="flex items-center gap-2">
                        {rule ? <PriorityBadge value={rule.case_priority} /> : <span className="text-zinc-400">no rule</span>}
                        <span className={isTodayTrigger ? "font-medium text-emerald-700" : "text-zinc-500"}>
                          {isTodayTrigger ? "triggered today" : "pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {serviceCasesRes.ok ? (
            <DataTable
              columns={[
                {
                  key: "title",
                  header: "Renewal Service Cases",
                  render: (item) => (
                    <Link className="font-medium text-blue-700 hover:underline" href={`/ams/service-cases/${item.id}`}>
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
                  key: "priority",
                  header: "Priority",
                  render: (item) => <PriorityBadge value={item.priority} />,
                },
                {
                  key: "due",
                  header: "Due Date",
                  render: (item) => formatDate(item.due_date),
                },
                {
                  key: "created",
                  header: "Created At",
                  render: (item) => formatDate(item.created_at),
                },
              ]}
              emptyMessage="No renewal service cases found for this policy."
              rowKey={(item) => item.id}
              rows={renewalCases}
            />
          ) : (
            <InlineError details={serviceCasesRes.errorMessage} retryHref={`/ams/policies/${id}?tab=renewal`} />
          )}
        </section>
      ) : null}
    </div>
  );
}
