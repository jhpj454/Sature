"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { ConvertToCustomerModal } from "@/app/crm/_components/ConvertToCustomerModal";
import { CreateLeadModal } from "@/app/crm/_components/CreateLeadModal";
import { ImportFromLeadsModal } from "@/app/crm/_components/ImportFromLeadsModal";
import type { ActiveFilters } from "@/app/crm/_components/WinDealsControls";

export type KanbanLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  industry: string | null;
  estimated_revenue: string | number | null;
  pipeline_stage_id: string | null;
  assigned_producer_id: string | null;
  assigned_producer_display_name: string | null;
  status: string;
  created_at: string | null;
};

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
  initialColumns: KanbanColumn[];
  pipelines: { id: string; name: string }[];
  initialPipelineId: string;
  csrUsers: { id: string; display_name: string }[];
  stages?: KanbanStage[];
  pipelineId?: string;
  activeFilters?: ActiveFilters;
};

function formatRevenue(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function leadDisplayName(lead: KanbanLead): string {
  if (lead.company_name) return lead.company_name;
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unnamed Lead";
}

function totalRevenue(leads: KanbanLead[]): number {
  return leads.reduce((sum, l) => sum + Number(l.estimated_revenue ?? 0), 0);
}

function applyFilters(
  leads: KanbanLead[],
  search: string,
  filters: ActiveFilters,
): KanbanLead[] {
  return leads.filter((lead) => {
    if (
      search &&
      !leadDisplayName(lead).toLowerCase().includes(search.toLowerCase()) &&
      !(lead.email ?? "").toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (filters.producerId && lead.assigned_producer_id !== filters.producerId) return false;
    if (filters.revenueMin !== "" && filters.revenueMin !== undefined) {
      if (Number(lead.estimated_revenue ?? 0) < Number(filters.revenueMin)) return false;
    }
    if (filters.revenueMax !== "" && filters.revenueMax !== undefined) {
      if (Number(lead.estimated_revenue ?? 0) > Number(filters.revenueMax)) return false;
    }
    if (filters.industry) {
      if (!lead.industry?.toLowerCase().includes(filters.industry.toLowerCase())) return false;
    }
    if (filters.source) {
      if (!lead.source?.toLowerCase().includes(filters.source.toLowerCase())) return false;
    }
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.dateFrom && lead.created_at) {
      if (lead.created_at < filters.dateFrom) return false;
    }
    if (filters.dateTo && lead.created_at) {
      if (lead.created_at > filters.dateTo + "T23:59:59") return false;
    }
    return true;
  });
}

export function LeadKanbanBoard({
  initialColumns,
  csrUsers,
  stages = [],
  pipelineId = "",
  activeFilters = {},
}: Props) {
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [convertModal, setConvertModal] = useState<{
    lead: KanbanLead;
    wonStageId: string;
    fromStageId: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const draggingRef = useRef<{ leadId: string; fromStageId: string } | null>(null);

  // First open stage for import
  const firstOpenStageId =
    stages.find((s) => s.stage_type === "open")?.id ?? columns[0]?.stage.id ?? "";

  async function executeMoveStage(
    lead: KanbanLead,
    fromStageId: string,
    toStage: KanbanStage,
  ) {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.stage.id === fromStageId) {
          return { ...col, leads: col.leads.filter((l) => l.id !== lead.id) };
        }
        if (col.stage.id === toStage.id) {
          return {
            ...col,
            leads: [...col.leads, { ...lead, pipeline_stage_id: toStage.id }],
          };
        }
        return col;
      }),
    );

    setMovingLeadId(lead.id);
    setMoveError(null);

    try {
      await apiFetch<{ ok: boolean }>(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage_id: toStage.id }),
      });
    } catch (err) {
      setColumns((prev) =>
        prev.map((col) => {
          if (col.stage.id === fromStageId) {
            return { ...col, leads: [...col.leads, lead] };
          }
          if (col.stage.id === toStage.id) {
            return { ...col, leads: col.leads.filter((l) => l.id !== lead.id) };
          }
          return col;
        }),
      );
      setMoveError(err instanceof Error ? err.message : "Failed to move lead.");
    } finally {
      setMovingLeadId(null);
    }
  }

  function handleDrop(toStage: KanbanStage) {
    const dragging = draggingRef.current;
    if (!dragging) return;

    const { leadId, fromStageId } = dragging;
    if (fromStageId === toStage.id) return;

    const fromCol = columns.find((c) => c.stage.id === fromStageId);
    const lead = fromCol?.leads.find((l) => l.id === leadId);
    if (!lead) return;

    if (toStage.stage_type === "won") {
      setConvertModal({ lead, wonStageId: toStage.id, fromStageId });
    } else {
      void executeMoveStage(lead, fromStageId, toStage);
    }
  }

  function handleConvertSuccess(leadId: string) {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        leads: col.leads.filter((l) => l.id !== leadId),
      })),
    );
    setConvertModal(null);
  }

  function handleConvertCancel() {
    setConvertModal(null);
  }

  function handleCreateSuccess(lead: KanbanLead, stageId: string) {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.stage.id === stageId) {
          return { ...col, leads: [lead, ...col.leads] };
        }
        return col;
      }),
    );
    setShowCreateModal(false);
  }

  function handleImportSuccess(imported: KanbanLead[]) {
    setColumns((prev) =>
      prev.map((col) => {
        const toAdd = imported.filter((l) => l.pipeline_stage_id === col.stage.id);
        if (toAdd.length === 0) return col;
        return { ...col, leads: [...toAdd, ...col.leads] };
      }),
    );
    setShowImportModal(false);
  }

  return (
    <div
      style={{
        background: "rgba(22, 27, 44, 0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "16px",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "16px 16px 0 16px",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "480px" }}>
          <svg
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "hsl(0,0%,40%)",
              pointerEvents: "none",
            }}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search Deals"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "hsl(220, 8%, 18%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "8px 12px 8px 32px",
              color: "hsl(0,0%,100%)",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
          {/* Create New Deal */}
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: "#3762e3",
              color: "hsl(0,0%,100%)",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.12s",
            }}
          >
            Create New Deal
          </button>

          {/* Import */}
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              background: "transparent",
              color: "hsl(0,0%,80%)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            Import
          </button>
        </div>
      </div>

      {moveError ? (
        <p
          className="text-sm"
          style={{ color: "hsl(0, 72%, 60%)", padding: "8px 16px 0", fontSize: "13px", fontFamily: "var(--font-instrument-sans)" }}
        >
          {moveError}
        </p>
      ) : null}

      {/* Kanban columns */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          padding: "16px",
          paddingBottom: "20px",
        }}
      >
        {columns.length === 0 ? (
          <p style={{ color: "hsl(0,0%,50%)", fontSize: "14px", fontFamily: "var(--font-instrument-sans)" }}>
            No stages configured for this pipeline.
          </p>
        ) : (
          columns.map((col) => {
            const stageType = col.stage.stage_type;
            const isDragOver = dragOverStageId === col.stage.id;
            const filteredLeads = applyFilters(col.leads, search, activeFilters);
            const colRevenue = totalRevenue(filteredLeads);

            const stageNameColor =
              stageType === "won"
                ? "hsl(160, 60%, 70%)"
                : stageType === "lost"
                  ? "hsl(0, 60%, 70%)"
                  : "hsl(0,0%,100%)";

            return (
              <div
                key={col.stage.id}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverStageId(col.stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStageId(null);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  handleDrop(col.stage);
                }}
                style={{
                  width: "280px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  background: isDragOver
                    ? "rgba(55, 98, 227, 0.15)"
                    : "rgba(30, 35, 50, 0.50)",
                  border: isDragOver
                    ? "1px solid rgba(55, 98, 227, 0.6)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  minHeight: "400px",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px 12px 0 0",
                    ...(stageType === "won"
                      ? {
                          background: "rgba(16, 185, 129, 0.12)",
                          borderBottom: "1px solid rgba(16, 185, 129, 0.25)",
                        }
                      : stageType === "lost"
                        ? {
                            background: "rgba(239, 68, 68, 0.12)",
                            borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
                          }
                        : {
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }),
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontWeight: 600,
                        fontSize: "13px",
                        color: stageNameColor,
                      }}
                    >
                      {col.stage.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: "11px",
                        color: "hsl(0,0%,50%)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {filteredLeads.length} &middot; {formatRevenue(colRevenue)}
                    </span>
                  </div>
                </div>

                {/* Lead cards */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px",
                    gap: "0",
                  }}
                >
                  {filteredLeads.length === 0 ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "80px",
                        borderRadius: "8px",
                        border: "1px dashed rgba(255,255,255,0.08)",
                        color: "hsl(0,0%,50%)",
                        fontSize: "12px",
                        fontFamily: "var(--font-instrument-sans)",
                      }}
                    >
                      {search || Object.values(activeFilters).some(Boolean)
                        ? "No matching leads"
                        : "No leads in this stage"}
                    </div>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isMoving = movingLeadId === lead.id;
                      const displayName = leadDisplayName(lead);
                      const pill = lead.industry ?? lead.source ?? null;

                      return (
                        <div
                          key={lead.id}
                          draggable={!isMoving}
                          onDragStart={(e) => {
                            draggingRef.current = {
                              leadId: lead.id,
                              fromStageId: col.stage.id,
                            };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", lead.id);
                          }}
                          onDragEnd={() => {
                            draggingRef.current = null;
                            setDragOverStageId(null);
                          }}
                          style={{
                            background: "rgba(30, 35, 50, 0.85)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "8px",
                            margin: "8px 0",
                            padding: "12px",
                            cursor: isMoving ? "default" : "grab",
                            opacity: isMoving ? 0.5 : 1,
                            transition: "opacity 0.15s",
                            userSelect: "none",
                          }}
                        >
                          {/* Top row */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "8px",
                              marginBottom: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-lora)",
                                fontSize: "13px",
                                fontWeight: 400,
                                color: "hsl(0,0%,80%)",
                                lineHeight: 1.3,
                                flex: 1,
                                minWidth: 0,
                                wordBreak: "break-word",
                              }}
                            >
                              {displayName}
                            </span>
                            {pill ? (
                              <span
                                style={{
                                  background: "hsl(220, 8%, 24%)",
                                  color: "hsl(0,0%,50%)",
                                  fontSize: "11px",
                                  fontFamily: "var(--font-instrument-sans)",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                }}
                              >
                                {pill}
                              </span>
                            ) : null}
                          </div>

                          {/* Revenue */}
                          <div
                            style={{
                              fontFamily: "var(--font-lora)",
                              fontSize: "20px",
                              fontWeight: 400,
                              color: "hsl(0,0%,100%)",
                              marginBottom: "8px",
                            }}
                          >
                            {formatRevenue(lead.estimated_revenue)}
                          </div>

                          {/* Producer */}
                          {lead.assigned_producer_display_name ? (
                            <div
                              style={{
                                fontFamily: "var(--font-instrument-sans)",
                                fontSize: "11px",
                                color: "hsl(0,0%,50%)",
                              }}
                            >
                              {lead.assigned_producer_display_name}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {convertModal ? (
        <ConvertToCustomerModal
          csrUsers={csrUsers}
          fromStageId={convertModal.fromStageId}
          lead={convertModal.lead}
          wonStageId={convertModal.wonStageId}
          onCancel={handleConvertCancel}
          onSuccess={handleConvertSuccess}
        />
      ) : null}

      {showCreateModal && pipelineId && stages.length > 0 ? (
        <CreateLeadModal
          pipelineId={pipelineId}
          stages={stages}
          csrUsers={csrUsers}
          onSuccess={handleCreateSuccess}
          onClose={() => setShowCreateModal(false)}
        />
      ) : null}

      {showImportModal && pipelineId ? (
        <ImportFromLeadsModal
          pipelineId={pipelineId}
          firstOpenStageId={firstOpenStageId}
          onSuccess={handleImportSuccess}
          onClose={() => setShowImportModal(false)}
        />
      ) : null}
    </div>
  );
}
