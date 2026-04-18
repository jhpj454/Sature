import { buildCrmQuery, requireSession, safeApiFetchJson } from "@/app/crm/_lib/api";
import { InlineError } from "@/app/ams/_components/InlineError";
import { LeadKanbanBoard, type KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";
import { ManagePipelinesModalTrigger } from "@/app/crm/_components/ManagePipelinesModalTrigger";

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
            fontSize: "28px",
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
          fontSize: "28px",
          fontWeight: 400,
          color: "hsl(0,0%,100%)",
          margin: 0,
        }}
      >
        Win Deals
      </h1>

      {/* Top controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {/* Pipeline selector */}
        {pipelines.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "12px",
                color: "hsl(0,0%,50%)",
                whiteSpace: "nowrap",
              }}
            >
              Pipeline
            </span>
            <div
              style={{
                display: "flex",
                gap: "4px",
                background: "rgba(30, 35, 50, 0.70)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                padding: "4px",
              }}
            >
              {pipelines.map((p) => {
                const isSelected = p.id === selectedPipelineId;
                const href = `/crm/win-deals?pipeline_id=${p.id}`;
                return (
                  <a
                    key={p.id}
                    href={href}
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: "13px",
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "hsl(0,0%,100%)" : "hsl(0,0%,50%)",
                      background: isSelected ? "rgba(55, 98, 227, 0.25)" : "transparent",
                      border: isSelected ? "1px solid rgba(55, 98, 227, 0.4)" : "1px solid transparent",
                      borderRadius: "7px",
                      padding: "5px 12px",
                      textDecoration: "none",
                      transition: "background 0.12s, color 0.12s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Manage Pipelines button */}
        <ManagePipelinesModalTrigger />
      </div>

      {/* No pipelines state */}
      {pipelines.length === 0 ? (
        <div
          style={{
            background: "rgba(30, 35, 50, 0.70)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "16px",
            padding: "40px 32px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: "18px",
              color: "hsl(0,0%,80%)",
              marginBottom: "8px",
            }}
          >
            No pipelines yet
          </p>
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: "13px",
              color: "hsl(0,0%,50%)",
              marginBottom: "20px",
            }}
          >
            Create your first pipeline to start tracking leads through Win Deals.
          </p>
          <ManagePipelinesModalTrigger label="Create Pipeline" />
        </div>
      ) : (
        <>
          {/* Stage or lead load errors */}
          {!stagesRes.ok ? (
            <InlineError
              details={`Status ${stagesRes.status || 500}: ${stagesRes.errorMessage}`}
              retryHref={selectedPipelineId ? `/crm/win-deals?pipeline_id=${selectedPipelineId}` : "/crm/win-deals"}
              title="Couldn't load pipeline stages."
            />
          ) : !leadsRes.ok ? (
            <InlineError
              details={`Status ${leadsRes.status || 500}: ${leadsRes.errorMessage}`}
              retryHref={selectedPipelineId ? `/crm/win-deals?pipeline_id=${selectedPipelineId}` : "/crm/win-deals"}
              title="Couldn't load leads."
            />
          ) : (
            <LeadKanbanBoard
              csrUsers={csrUsers}
              initialColumns={boardColumns}
              initialPipelineId={selectedPipelineId ?? ""}
              pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
            />
          )}
        </>
      )}
    </div>
  );
}
