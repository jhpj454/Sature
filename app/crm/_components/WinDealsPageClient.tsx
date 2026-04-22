"use client";

import { useState } from "react";
import { LeadKanbanBoard, type KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";
import { WinDealsControls, type ActiveFilters } from "@/app/crm/_components/WinDealsControls";
import { ManagePipelinesModalTrigger } from "@/app/crm/_components/ManagePipelinesModalTrigger";

type KanbanStage = {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
};

type KanbanColumn = {
  stage: KanbanStage;
  leads: KanbanLead[];
};

type Props = {
  pipelines: { id: string; name: string }[];
  selectedPipelineId: string | null;
  initialColumns: KanbanColumn[];
  csrUsers: { id: string; display_name: string }[];
  stages: KanbanStage[];
  pipelineId: string;
};

export function WinDealsPageClient({
  pipelines,
  selectedPipelineId,
  initialColumns,
  csrUsers,
  stages,
  pipelineId,
}: Props) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Pipeline control card — position:relative + zIndex ensures filter dropdown paints above the kanban */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          background: "rgba(31, 31, 31, 0.28)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "20px 24px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "20px",
            fontWeight: 400,
            color: "hsl(0,0%,100%)",
            margin: "0 0 14px 0",
          }}
        >
          Pipeline
        </h2>

        {pipelines.length > 0 ? (
          <WinDealsControls
            pipelines={pipelines}
            selectedPipelineId={selectedPipelineId}
            csrUsers={csrUsers}
            activeFilters={activeFilters}
            onFiltersChange={setActiveFilters}
          />
        ) : (
          <ManagePipelinesModalTrigger label="Create Pipeline" />
        )}
      </div>

      {/* Kanban board */}
      {pipelines.length > 0 ? (
        <LeadKanbanBoard
          initialColumns={initialColumns}
          pipelines={pipelines}
          initialPipelineId={pipelineId}
          csrUsers={csrUsers}
          stages={stages}
          pipelineId={pipelineId}
          activeFilters={activeFilters}
        />
      ) : null}
    </div>
  );
}
