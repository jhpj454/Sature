"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";

type Pipeline = {
  id: string;
  name: string;
  visibility_type: string;
  is_active: boolean;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
  probability_pct: number | null;
};

type Props = {
  onClose: () => void;
};

const STAGE_TYPE_LABELS: Record<string, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "hsl(220, 8%, 24%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "7px 12px",
  color: "hsl(0,0%,100%)",
  fontSize: "13px",
  fontFamily: "var(--font-instrument-sans)",
  outline: "none",
  boxSizing: "border-box",
};

export function ManagePipelinesModal({ onClose }: Props) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create pipeline form
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [createPipelineError, setCreatePipelineError] = useState<string | null>(null);

  // Create stage form
  const [newStageName, setNewStageName] = useState("");
  const [newStageType, setNewStageType] = useState<"open" | "won" | "lost">("open");
  const [creatingStage, setCreatingStage] = useState(false);
  const [createStageError, setCreateStageError] = useState<string | null>(null);

  async function loadPipelines() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; data: Pipeline[] }>(
        "/api/crm/pipelines?page_size=100",
      );
      setPipelines(res.data);
      if (res.data.length > 0 && !selectedPipelineId) {
        setSelectedPipelineId(res.data[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipelines.");
    } finally {
      setLoading(false);
    }
  }

  const loadStages = useCallback(async (pipelineId: string) => {
    setStagesLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; data: Stage[] }>(
        `/api/crm/pipelines/${pipelineId}/stages`,
      );
      setStages(res.data);
    } catch {
      setStages([]);
    } finally {
      setStagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPipelineId) {
      void loadStages(selectedPipelineId);
    }
  }, [selectedPipelineId, loadStages]);

  async function handleCreatePipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    setCreatingPipeline(true);
    setCreatePipelineError(null);
    try {
      await apiFetch("/api/crm/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPipelineName.trim(),
          visibility_type: "agency",
          is_active: true,
        }),
      });
      setNewPipelineName("");
      await loadPipelines();
    } catch (err) {
      setCreatePipelineError(err instanceof Error ? err.message : "Failed to create pipeline.");
    } finally {
      setCreatingPipeline(false);
    }
  }

  async function handleCreateStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim() || !selectedPipelineId) return;
    setCreatingStage(true);
    setCreateStageError(null);
    try {
      await apiFetch(`/api/crm/pipelines/${selectedPipelineId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStageName.trim(),
          stage_type: newStageType,
          sort_order: stages.length + 1,
          probability_pct: newStageType === "won" ? 100 : newStageType === "lost" ? 0 : null,
        }),
      });
      setNewStageName("");
      setNewStageType("open");
      await loadStages(selectedPipelineId);
    } catch (err) {
      setCreateStageError(err instanceof Error ? err.message : "Failed to create stage.");
    } finally {
      setCreatingStage(false);
    }
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          height: "100%",
          background: "rgba(20, 25, 40, 0.97)",
          backdropFilter: "blur(20px)",
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: "20px",
              fontWeight: 400,
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            Manage Pipelines
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "hsl(0,0%,50%)",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {error ? (
            <p style={{ color: "hsl(0, 72%, 60%)", fontSize: "13px", fontFamily: "var(--font-instrument-sans)" }}>
              {error}
            </p>
          ) : null}

          {/* Pipeline list */}
          <section>
            <h3
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "11px",
                fontWeight: 600,
                color: "hsl(0,0%,50%)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "10px",
              }}
            >
              Pipelines
            </h3>

            {loading ? (
              <p style={{ color: "hsl(0,0%,50%)", fontSize: "13px", fontFamily: "var(--font-instrument-sans)" }}>
                Loading…
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {pipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid",
                      borderColor:
                        selectedPipelineId === pipeline.id
                          ? "rgba(55, 98, 227, 0.5)"
                          : "rgba(255,255,255,0.06)",
                      background:
                        selectedPipelineId === pipeline.id
                          ? "rgba(55, 98, 227, 0.12)"
                          : "rgba(30, 35, 50, 0.50)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: "13px",
                        color: selectedPipelineId === pipeline.id ? "hsl(0,0%,100%)" : "hsl(0,0%,80%)",
                      }}
                    >
                      {pipeline.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: "11px",
                        color: "hsl(0,0%,50%)",
                      }}
                    >
                      {pipeline.visibility_type}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Create pipeline form */}
            <form
              onSubmit={(e) => void handleCreatePipeline(e)}
              style={{ marginTop: "12px", display: "flex", gap: "8px" }}
            >
              <input
                required
                placeholder="New pipeline name"
                style={{ ...inputStyle, flex: 1 }}
                type="text"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
              />
              <button
                disabled={creatingPipeline}
                type="submit"
                style={{
                  background: "#3762e3",
                  color: "hsl(0,0%,100%)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontWeight: 600,
                  cursor: creatingPipeline ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {creatingPipeline ? "Adding…" : "+ Add"}
              </button>
            </form>
            {createPipelineError ? (
              <p style={{ color: "hsl(0, 72%, 60%)", fontSize: "12px", marginTop: "6px", fontFamily: "var(--font-instrument-sans)" }}>
                {createPipelineError}
              </p>
            ) : null}
          </section>

          {/* Stages for selected pipeline */}
          {selectedPipeline ? (
            <section>
              <h3
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "hsl(0,0%,50%)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "10px",
                }}
              >
                Stages — {selectedPipeline.name}
              </h3>

              {stagesLoading ? (
                <p style={{ color: "hsl(0,0%,50%)", fontSize: "13px", fontFamily: "var(--font-instrument-sans)" }}>
                  Loading stages…
                </p>
              ) : stages.length === 0 ? (
                <p style={{ color: "hsl(0,0%,50%)", fontSize: "13px", fontFamily: "var(--font-instrument-sans)" }}>
                  No stages yet. Add one below.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {stages
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((stage) => {
                      const typeColor =
                        stage.stage_type === "won"
                          ? "hsl(160, 60%, 70%)"
                          : stage.stage_type === "lost"
                            ? "hsl(0, 60%, 70%)"
                            : "hsl(0,0%,50%)";

                      return (
                        <div
                          key={stage.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            background: "rgba(30, 35, 50, 0.50)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-instrument-sans)",
                              fontSize: "13px",
                              color: "hsl(0,0%,80%)",
                            }}
                          >
                            {stage.sort_order}. {stage.name}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-instrument-sans)",
                              fontSize: "11px",
                              color: typeColor,
                            }}
                          >
                            {STAGE_TYPE_LABELS[stage.stage_type] ?? stage.stage_type}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Create stage form */}
              <form
                onSubmit={(e) => void handleCreateStage(e)}
                style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}
              >
                <input
                  required
                  placeholder="Stage name"
                  style={{ ...inputStyle, flex: "1 1 160px" }}
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                />
                <select
                  style={{
                    ...inputStyle,
                    flex: "0 0 auto",
                    width: "auto",
                    cursor: "pointer",
                    appearance: "none" as const,
                    paddingRight: "28px",
                  }}
                  value={newStageType}
                  onChange={(e) => setNewStageType(e.target.value as "open" | "won" | "lost")}
                >
                  <option value="open">Open</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
                <button
                  disabled={creatingStage}
                  type="submit"
                  style={{
                    background: "#3762e3",
                    color: "hsl(0,0%,100%)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontSize: "13px",
                    fontFamily: "var(--font-instrument-sans)",
                    fontWeight: 600,
                    cursor: creatingStage ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {creatingStage ? "Adding…" : "+ Add Stage"}
                </button>
              </form>
              {createStageError ? (
                <p style={{ color: "hsl(0, 72%, 60%)", fontSize: "12px", marginTop: "6px", fontFamily: "var(--font-instrument-sans)" }}>
                  {createStageError}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
