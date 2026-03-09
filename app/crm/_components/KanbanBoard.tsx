"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { formatCurrency, formatDate } from "@/app/ams/_lib/format";

type KanbanDeal = {
  id: string;
  name: string;
  estimated_revenue: string | number;
  expected_close_date: string | null;
  account_id?: string | null;
  account_name: string | null;
};

type KanbanStage = {
  id: string;
  name: string;
  sort_order: number;
  stage_type: string;
};

type KanbanColumn = {
  stage: KanbanStage;
  deals: KanbanDeal[];
};

type BoardApiData = {
  pipelines: { id: string; name: string }[];
  selected_pipeline_id: string;
  stages: Array<KanbanStage & { deals: KanbanDeal[] }>;
};

const COLUMN_HEADER_STYLES: Record<string, string> = {
  open: "border-b border-zinc-200 bg-zinc-50",
  won: "border-b border-emerald-200 bg-emerald-50",
  lost: "border-b border-rose-200 bg-rose-50",
};

const COLUMN_BORDER_STYLES: Record<string, string> = {
  open: "border-zinc-200",
  won: "border-emerald-200",
  lost: "border-rose-200",
};

const COLUMN_TITLE_STYLES: Record<string, string> = {
  open: "text-zinc-700",
  won: "text-emerald-800",
  lost: "text-rose-800",
};

export function KanbanBoard({
  initialColumns,
  pipelines: initialPipelines,
  initialPipelineId,
}: {
  initialColumns: KanbanColumn[];
  pipelines: { id: string; name: string }[];
  initialPipelineId: string;
}) {
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns);
  const [pipelines] = useState(initialPipelines);
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialPipelineId);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [movingDealId, setMovingDealId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    deal: KanbanDeal;
    fromStageId: string;
    toStage: KanbanStage;
  } | null>(null);

  const draggingRef = useRef<{ dealId: string; fromStageId: string } | null>(null);
  const today = new Date().toISOString().split("T")[0];

  async function switchPipeline(pipelineId: string) {
    setLoadingPipeline(true);
    setPipelineError(null);
    try {
      const res = await apiFetch<{ ok: true; data: BoardApiData }>(
        `/api/crm/boards?pipeline_id=${pipelineId}`,
      );
      setSelectedPipelineId(res.data.selected_pipeline_id);
      setColumns(
        res.data.stages.map((stage) => ({
          stage: {
            id: stage.id,
            name: stage.name,
            sort_order: stage.sort_order,
            stage_type: stage.stage_type,
          },
          deals: stage.deals,
        })),
      );
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : "Failed to load pipeline.");
    } finally {
      setLoadingPipeline(false);
    }
  }

  async function executeMoveStage(deal: KanbanDeal, fromStageId: string, toStage: KanbanStage) {
    // Optimistic update: move card to target column immediately
    setColumns((prev) =>
      prev.map((col) => {
        if (col.stage.id === fromStageId) {
          return { ...col, deals: col.deals.filter((d) => d.id !== deal.id) };
        }
        if (col.stage.id === toStage.id) {
          return { ...col, deals: [...col.deals, deal] };
        }
        return col;
      }),
    );

    setMovingDealId(deal.id);
    setMoveError(null);

    try {
      await apiFetch(`/api/crm/deals/${deal.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage_id: toStage.id }),
      });
    } catch (err) {
      // Revert on failure
      setColumns((prev) =>
        prev.map((col) => {
          if (col.stage.id === fromStageId) {
            return { ...col, deals: [...col.deals, deal] };
          }
          if (col.stage.id === toStage.id) {
            return { ...col, deals: col.deals.filter((d) => d.id !== deal.id) };
          }
          return col;
        }),
      );
      setMoveError(err instanceof Error ? err.message : "Failed to move deal.");
    } finally {
      setMovingDealId(null);
    }
  }

  function handleDrop(toStage: KanbanStage) {
    const dragging = draggingRef.current;
    if (!dragging) return;

    const { dealId, fromStageId } = dragging;
    if (fromStageId === toStage.id) return;

    const fromCol = columns.find((c) => c.stage.id === fromStageId);
    const deal = fromCol?.deals.find((d) => d.id === dealId);
    if (!deal) return;

    if (toStage.stage_type === "won" || toStage.stage_type === "lost") {
      setConfirmMove({ deal, fromStageId, toStage });
    } else {
      void executeMoveStage(deal, fromStageId, toStage);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pipeline switcher — only shown when there are multiple pipelines */}
      {pipelines.length > 1 ? (
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-zinc-600">Pipeline</span>
          <Select
            className="min-w-[220px]"
            disabled={loadingPipeline}
            onChange={(e) => void switchPipeline(e.target.value)}
            value={selectedPipelineId}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {loadingPipeline ? (
            <span className="text-sm text-zinc-400">Loading…</span>
          ) : null}
        </div>
      ) : null}

      {pipelineError ? <p className="text-sm text-rose-600">{pipelineError}</p> : null}
      {moveError ? <p className="text-sm text-rose-600">{moveError}</p> : null}

      {/* Horizontal scrolling board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.length === 0 ? (
          <p className="text-sm text-zinc-400">No stages configured for this pipeline.</p>
        ) : (
          columns.map((col) => {
            const stageType = col.stage.stage_type;
            const headerStyle = COLUMN_HEADER_STYLES[stageType] ?? COLUMN_HEADER_STYLES.open;
            const borderStyle = COLUMN_BORDER_STYLES[stageType] ?? COLUMN_BORDER_STYLES.open;
            const titleStyle = COLUMN_TITLE_STYLES[stageType] ?? COLUMN_TITLE_STYLES.open;
            const totalRevenue = col.deals.reduce(
              (sum, d) => sum + Number(d.estimated_revenue || 0),
              0,
            );
            const isDragOver = dragOverStageId === col.stage.id;

            return (
              <div
                key={col.stage.id}
                className={`flex w-72 flex-none flex-col rounded-lg border transition-all ${
                  isDragOver
                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                    : `${borderStyle} bg-white`
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverStageId(col.stage.id);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column boundary (not entering a child element)
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
              >
                {/* Column header */}
                <div className={`rounded-t-lg px-4 py-3 ${headerStyle}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${titleStyle}`}>
                      {col.stage.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {col.deals.length} · {formatCurrency(totalRevenue)}
                    </span>
                  </div>
                </div>

                {/* Deal cards */}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {col.deals.length === 0 ? (
                    <div className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-zinc-200 text-xs text-zinc-400">
                      No deals in this stage
                    </div>
                  ) : (
                    col.deals.map((deal) => {
                      const isMoving = movingDealId === deal.id;
                      const isOverdue =
                        deal.expected_close_date && deal.expected_close_date < today;

                      return (
                        <div
                          key={deal.id}
                          className={`cursor-grab select-none rounded-md border border-zinc-200 bg-white p-3 shadow-sm transition-opacity active:cursor-grabbing ${
                            isMoving ? "animate-pulse opacity-50" : "opacity-100"
                          }`}
                          draggable={!isMoving}
                          onDragEnd={() => {
                            draggingRef.current = null;
                            setDragOverStageId(null);
                          }}
                          onDragStart={(e) => {
                            draggingRef.current = {
                              dealId: deal.id,
                              fromStageId: col.stage.id,
                            };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", deal.id);
                          }}
                        >
                          <Link
                            className="block"
                            href={`/crm/deals/${deal.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-sm font-medium text-zinc-900 hover:text-blue-700 hover:underline">
                              {deal.account_name ?? deal.name}
                            </p>
                            {deal.account_name ? (
                              <p className="mt-0.5 text-xs text-zinc-500">{deal.name}</p>
                            ) : null}
                          </Link>

                          <p className="mt-2 text-sm font-semibold text-zinc-800">
                            {formatCurrency(deal.estimated_revenue)}
                          </p>

                          {deal.expected_close_date ? (
                            <p
                              className={`mt-1 text-xs ${
                                isOverdue
                                  ? "font-medium text-rose-600"
                                  : "text-zinc-400"
                              }`}
                            >
                              Close: {formatDate(deal.expected_close_date)}
                              {isOverdue ? " — overdue" : ""}
                            </p>
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

      {/* Won / Lost confirmation dialog */}
      {confirmMove ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold text-zinc-900">
              Mark as {confirmMove.toStage.stage_type === "won" ? "Won" : "Lost"}?
            </h3>
            <p className="mb-5 text-sm text-zinc-600">
              Moving &ldquo;{confirmMove.deal.account_name ?? confirmMove.deal.name}&rdquo; to{" "}
              <strong>{confirmMove.toStage.name}</strong> will mark this deal as{" "}
              <strong>{confirmMove.toStage.stage_type}</strong>. This action updates the deal
              status.
            </p>
            <div className="flex gap-2">
              <Button
                className={
                  confirmMove.toStage.stage_type === "won"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-rose-700 hover:bg-rose-800"
                }
                disabled={movingDealId !== null}
                onClick={() => {
                  const { deal, fromStageId, toStage } = confirmMove;
                  setConfirmMove(null);
                  void executeMoveStage(deal, fromStageId, toStage);
                }}
                type="button"
              >
                {movingDealId ? "Moving…" : `Confirm — ${confirmMove.toStage.name}`}
              </Button>
              <Button
                onClick={() => setConfirmMove(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
