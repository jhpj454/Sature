import { buildCrmQuery, requireSession, safeApiFetchJson } from "@/app/crm/_lib/api";
import { InlineError } from "@/app/ams/_components/InlineError";
import { type KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";
import { WinDealsPageClient } from "@/app/crm/_components/WinDealsPageClient";

type Pipeline = {
  id: string;
  name: string;
  visibility_type: string;
  owner_user_id: string | null;
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

type CsrUser = {
  id: string;
  display_name: string;
  role: string;
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function CrmWinDealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearch = await searchParams;
  await requireSession();

  const filters = {
    pipeline_id: firstString(resolvedSearch.pipeline_id),
  };

  // 1. Fetch pipelines
  const pipelinesRes = await safeApiFetchJson<{ ok: true; data: Pipeline[] }>(
    "/api/crm/pipelines?page_size=100",
  );

  if (!pipelinesRes.ok) {
    return (
      <div className="space-y-6 p-6">
        <h1
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "3.5rem",
            fontWeight: 400,
            color: "hsl(0,0%,100%)",
            margin: 0,
          }}
        >
          Win Deals
        </h1>
        <InlineError
          details={`Status ${pipelinesRes.status || 500}: ${pipelinesRes.errorMessage}`}
          retryHref="/crm/win-deals"
          title="Couldn't load pipelines."
        />
      </div>
    );
  }

  const pipelines = pipelinesRes.data.data;
  const selectedPipelineId =
    filters.pipeline_id && pipelines.some((p) => p.id === filters.pipeline_id)
      ? filters.pipeline_id
      : (pipelines[0]?.id ?? null);

  // 2. Fetch stages, leads, and CSR users in parallel
  const emptyResult = {
    ok: true as const,
    status: 200,
    data: { ok: true as const, data: [] as never[] },
    requestUrl: "",
    responsePreview: "",
  };

  const [stagesRes, leadsRes, usersRes] = await Promise.all([
    selectedPipelineId
      ? safeApiFetchJson<{ ok: true; data: Stage[] }>(
          `/api/crm/pipelines/${selectedPipelineId}/stages`,
        )
      : Promise.resolve(emptyResult),
    selectedPipelineId
      ? safeApiFetchJson<{ ok: true; data: KanbanLead[] }>(
          `/api/crm/leads/pipeline${buildCrmQuery({ pipeline_id: selectedPipelineId, page_size: "200" })}`,
        )
      : Promise.resolve(emptyResult),
    safeApiFetchJson<{ ok: true; data: CsrUser[] }>("/api/users"),
  ]);

  const stages = stagesRes.ok ? stagesRes.data.data : [];
  const leads = leadsRes.ok ? leadsRes.data.data : [];
  const csrUsers = usersRes.ok
    ? usersRes.data.data.filter((u) => u.role === "csr" || u.role === "admin")
    : [];

  const boardColumns = stages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((stage) => ({
      stage: {
        id: stage.id,
        name: stage.name,
        stage_type: stage.stage_type,
        sort_order: stage.sort_order,
      },
      leads: leads.filter((l) => l.pipeline_stage_id === stage.id),
    }));

  const kanbanStages = stages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      name: s.name,
      stage_type: s.stage_type,
      sort_order: s.sort_order,
    }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "24px",
      }}
    >
      {/* Page heading */}
      <h1
        style={{
          fontFamily: "var(--font-lora)",
          fontSize: "3.5rem",
          fontWeight: 400,
          color: "hsl(0,0%,100%)",
          margin: 0,
        }}
      >
        Win Deals
      </h1>

      {/* Load errors */}
      {pipelines.length > 0 && !stagesRes.ok ? (
        <InlineError
          details={`Status ${stagesRes.status || 500}: ${stagesRes.errorMessage}`}
          retryHref={selectedPipelineId ? `/crm/win-deals?pipeline_id=${selectedPipelineId}` : "/crm/win-deals"}
          title="Couldn't load pipeline stages."
        />
      ) : pipelines.length > 0 && !leadsRes.ok ? (
        <InlineError
          details={`Status ${leadsRes.status || 500}: ${leadsRes.errorMessage}`}
          retryHref={selectedPipelineId ? `/crm/win-deals?pipeline_id=${selectedPipelineId}` : "/crm/win-deals"}
          title="Couldn't load leads."
        />
      ) : (
        <WinDealsPageClient
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          selectedPipelineId={selectedPipelineId}
          initialColumns={boardColumns}
          csrUsers={csrUsers}
          stages={kanbanStages}
          pipelineId={selectedPipelineId ?? ""}
        />
      )}
    </div>
  );
}
