import Link from "next/link";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { formatCurrency, formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Tabs } from "@/app/components/ui/tabs";
import { CreateDealModal } from "@/app/crm/_components/CreateDealModal";
import { KanbanBoard } from "@/app/crm/_components/KanbanBoard";
import { PipelineSwitcher } from "@/app/crm/_components/PipelineSwitcher";
import { buildCrmQuery, requireSession, safeApiFetchJson } from "@/app/crm/_lib/api";

type Pipeline = {
  id: string;
  name: string;
  visibility_type: string;
  owner_user_id: string | null;
  owner_display_name?: string | null;
};

type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  stage_type: string;
  probability_pct: number;
  forecast_category: string;
  sort_order: number;
};

type Deal = {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  pipeline_stage_id: string;
  stage_name: string;
  stage_type: string;
  account_name: string | null;
  producer_display_name: string | null;
  producer_user_id: string;
  name: string;
  estimated_revenue: string | number;
  expected_close_date: string | null;
  next_step: string | null;
  updated_at: string;
};

type UserOption = {
  id: string;
  display_name: string;
  role: string;
};

type AccountOption = {
  id: string;
  account_name: string;
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function buildWinDealsHref(search: Record<string, string | undefined>) {
  const query = buildCrmQuery(search);
  return `/crm/win-deals${query}`;
}

export default async function CrmWinDealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  await requireSession();

  const view = firstString(resolvedSearch.view) === "table" ? "table" : "board";
  const filters = {
    pipeline_id: firstString(resolvedSearch.pipeline_id),
    q: firstString(resolvedSearch.q),
    pipeline_stage_id: firstString(resolvedSearch.pipeline_stage_id),
    producer_user_id: firstString(resolvedSearch.producer_user_id),
    expected_close_from: firstString(resolvedSearch.expected_close_from),
    expected_close_to: firstString(resolvedSearch.expected_close_to),
  };

  const pipelinesRes = await safeApiFetchJson<{ ok: true; data: Pipeline[] }>(
    "/api/crm/pipelines?page_size=100",
  );

  if (!pipelinesRes.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Win Deals"
          description="Producer workspace for pipeline movement and revenue-first deal tracking."
        />
        <InlineError
          details={`Status ${pipelinesRes.status || 500}: ${pipelinesRes.errorMessage}`}
          retryHref="/crm/win-deals"
          title="Couldn’t load pipelines."
        />
      </div>
    );
  }

  const pipelines = pipelinesRes.data.data;
  const selectedPipelineId =
    filters.pipeline_id && pipelines.some((pipeline) => pipeline.id === filters.pipeline_id)
      ? filters.pipeline_id
      : pipelines[0]?.id ?? null;

  const [usersRes, accountsRes, stagesRes, dealsRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: UserOption[] }>("/api/users"),
    safeApiFetchJson<{ ok: true; data: AccountOption[] }>("/api/accounts?page_size=100"),
    selectedPipelineId
      ? safeApiFetchJson<{ ok: true; data: Stage[] }>(
          `/api/crm/pipelines/${selectedPipelineId}/stages`,
        )
      : Promise.resolve({ ok: true as const, status: 200, data: { ok: true as const, data: [] }, requestUrl: "", responsePreview: "" }),
    selectedPipelineId
      ? safeApiFetchJson<{ ok: true; data: Deal[] }>(
          `/api/crm/deals${buildCrmQuery({
            pipeline_id: selectedPipelineId,
            q: filters.q,
            pipeline_stage_id: filters.pipeline_stage_id,
            producer_user_id: filters.producer_user_id,
            expected_close_from: filters.expected_close_from,
            expected_close_to: filters.expected_close_to,
            page_size: "100",
          })}`,
        )
      : Promise.resolve({ ok: true as const, status: 200, data: { ok: true as const, data: [] }, requestUrl: "", responsePreview: "" }),
  ]);

  const stageOptions = stagesRes.ok ? stagesRes.data.data : [];
  const dealRows = dealsRes.ok ? dealsRes.data.data : [];
  const producerOptions = usersRes.ok
    ? usersRes.data.data.filter((user) => user.role === "producer" || user.role === "admin")
    : [];
  const accountOptions = accountsRes.ok ? accountsRes.data.data : [];
  const retryHref = buildWinDealsHref({
    view,
    pipeline_id: selectedPipelineId ?? undefined,
    q: filters.q,
    pipeline_stage_id: filters.pipeline_stage_id,
    producer_user_id: filters.producer_user_id,
    expected_close_from: filters.expected_close_from,
    expected_close_to: filters.expected_close_to,
  });

  const boardColumns = stageOptions.map((stage) => {
    const deals = dealRows.filter((deal) => deal.pipeline_stage_id === stage.id);
    const totalRevenue = deals.reduce((sum, deal) => sum + Number(deal.estimated_revenue || 0), 0);
    return { stage, deals, totalRevenue };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Win Deals"
        description="Manage producer pipelines, move deals forward, and keep revenue expectations visible."
        actions={
          <>
            <CreateDealModal
              accounts={accountOptions}
              pipelineId={selectedPipelineId ?? ""}
              producers={producerOptions}
              stages={stageOptions.map((stage) => ({ id: stage.id, name: stage.name }))}
            />
            <Link href="/crm/settings/pipelines">
              <Button size="sm" variant="outline">
                Manage Pipelines
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4 rounded-lg border border-slate-200/30 bg-white p-4 md:flex-row md:items-center md:justify-between">
        {view === "table" ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Pipeline</p>
            {pipelines.length > 0 ? (
              <PipelineSwitcher
                pipelines={pipelines.map((pipeline) => ({ id: pipeline.id, name: pipeline.name }))}
                selectedPipelineId={selectedPipelineId}
              />
            ) : (
              <p className="text-sm text-slate-400">No visible pipelines yet.</p>
            )}
          </div>
        ) : null}
        <Tabs
          active={view}
          items={[
            {
              label: "Board",
              value: "board",
              href: buildWinDealsHref({
                ...filters,
                pipeline_id: selectedPipelineId ?? undefined,
                view: "board",
              }),
            },
            {
              label: "Table",
              value: "table",
              href: buildWinDealsHref({
                ...filters,
                pipeline_id: selectedPipelineId ?? undefined,
                view: "table",
              }),
            },
          ]}
        />
      </div>

      {pipelines.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No pipelines yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">
              Create your first pipeline to start tracking producer deals in Win Deals.
            </p>
            <Link href="/crm/settings/pipelines">
              <Button size="sm">Create Pipeline</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <FilterBar resetHref={selectedPipelineId ? `/crm/win-deals?pipeline_id=${selectedPipelineId}&view=${view}` : `/crm/win-deals?view=${view}`}>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-slate-400">Search</span>
              <Input defaultValue={filters.q ?? ""} name="q" placeholder="Deal or customer name" />
            </label>
            <input name="pipeline_id" type="hidden" value={selectedPipelineId ?? ""} />
            <input name="view" type="hidden" value={view} />
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Stage</span>
              <Select defaultValue={filters.pipeline_stage_id ?? ""} name="pipeline_stage_id">
                <option value="">All stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Owner</span>
              <Select defaultValue={filters.producer_user_id ?? ""} name="producer_user_id">
                <option value="">All owners</option>
                {producerOptions.map((producer) => (
                  <option key={producer.id} value={producer.id}>
                    {producer.display_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Close from</span>
              <Input defaultValue={filters.expected_close_from ?? ""} name="expected_close_from" type="date" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Close to</span>
              <Input defaultValue={filters.expected_close_to ?? ""} name="expected_close_to" type="date" />
            </label>
          </FilterBar>

          {!stagesRes.ok ? (
            <InlineError
              details={`Status ${stagesRes.status || 500}: ${stagesRes.errorMessage}`}
              retryHref={retryHref}
              title="Couldn’t load pipeline stages."
            />
          ) : !dealsRes.ok ? (
            <InlineError
              details={`Status ${dealsRes.status || 500}: ${dealsRes.errorMessage}`}
              retryHref={retryHref}
              title="Couldn’t load deals."
            />
          ) : dealRows.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No deals match these filters</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">
                  Adjust your filters or create a deal to start tracking revenue in this pipeline.
                </p>
              </CardContent>
            </Card>
          ) : view === "board" ? (
            <KanbanBoard
              initialColumns={boardColumns.map(({ stage, deals }) => ({
                stage: {
                  id: stage.id,
                  name: stage.name,
                  sort_order: stage.sort_order,
                  stage_type: stage.stage_type,
                },
                deals: deals.map((deal) => ({
                  id: deal.id,
                  name: deal.name,
                  estimated_revenue: deal.estimated_revenue,
                  expected_close_date: deal.expected_close_date,
                  account_name: deal.account_name,
                  account_id: null,
                })),
              }))}
              initialPipelineId={selectedPipelineId ?? ""}
              pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (deal) => (
                    <div>
                      <p className="font-medium text-slate-800">{deal.name}</p>
                      <p className="text-xs text-slate-400">{deal.account_name ?? "No linked customer"}</p>
                    </div>
                  ),
                },
                { key: "pipeline", header: "Pipeline", render: (deal) => deal.pipeline_name },
                { key: "stage", header: "Stage", render: (deal) => deal.stage_name },
                {
                  key: "revenue",
                  header: "Estimated Revenue",
                  render: (deal) => <span className="font-medium text-slate-800">{formatCurrency(deal.estimated_revenue)}</span>,
                },
                {
                  key: "close",
                  header: "Expected Close Date",
                  render: (deal) => formatDate(deal.expected_close_date),
                },
                {
                  key: "next",
                  header: "Next Step",
                  render: (deal) => deal.next_step ?? "-",
                },
                {
                  key: "owner",
                  header: "Owner",
                  render: (deal) => deal.producer_display_name ?? "-",
                },
                {
                  key: "updated",
                  header: "Updated At",
                  render: (deal) => formatDateTime(deal.updated_at),
                },
              ]}
              emptyMessage="No deals in this view."
              rowKey={(deal) => deal.id}
              rows={dealRows}
            />
          )}
        </>
      )}
    </div>
  );
}
