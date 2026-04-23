"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  assigned_producer_id: string | null;
  assigned_producer_display_name?: string | null;
  industry?: string | null;
  estimated_revenue?: number | string | null;
  pipeline_id?: string | null;
  pipeline_stage_id?: string | null;
  notes?: string | null;
  created_at: string;
};

type Pipeline = {
  id: string;
  name: string;
};

type Stage = {
  id: string;
  name: string;
  pipeline_id: string;
  stage_type: string;
  sort_order: number;
};

type Activity = {
  id: string;
  activity_type: string;
  summary: string;
  occurred_at?: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
};

type Props = {
  lead: Lead;
  pipelines: Pipeline[];
  onClose: () => void;
};

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  new: { background: "#1a3a6b", color: "#5a9ff5" },
  working: { background: "#3d2e00", color: "#f5c542" },
  qualified: { background: "#0d3d2a", color: "#4caf7d" },
  converted: { background: "#1e1e1e", color: "hsl(0,0%,50%)" },
  lost: { background: "#3d0d0d", color: "#e05252" },
  archived: { background: "#1a1a2e", color: "#7070a0" },
};

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  note: "#5a9ff5",
  email: "#4caf7d",
  call: "#f5c542",
  meeting: "#a78bfa",
  task: "#fb923c",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "var(--font-instrument-sans)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "hsl(0,0%,50%)",
  marginBottom: 2,
};

const VALUE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,80%)",
};

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "hsl(220, 8%, 24%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "hsl(0,0%,100%)",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  outline: "none",
  cursor: "pointer",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <span style={LABEL_STYLE}>{label}</span>
      <div style={VALUE_STYLE}>{value}</div>
    </div>
  );
}

function leadDisplayName(lead: Lead) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.company_name || lead.email || lead.phone || lead.id.slice(0, 8);
}

export function LeadDetailPanel({ lead, pipelines, onClose }: Props) {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const [pipelineId, setPipelineId] = useState<string>(lead.pipeline_id ?? "");
  const [stageId, setStageId] = useState<string>(lead.pipeline_stage_id ?? "");
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [assigningPipeline, setAssigningPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineSuccess, setPipelineSuccess] = useState(false);

  const currentPipeline = pipelines.find((p) => p.id === (lead.pipeline_id ?? pipelineId));
  const currentStage = stages.find((s) => s.id === (lead.pipeline_stage_id ?? stageId));

  useEffect(() => {
    void loadActivities();
    if (lead.pipeline_id) {
      void loadStages(lead.pipeline_id);
    }
  }, [lead.id]);

  async function loadActivities() {
    setActivitiesLoading(true);
    setActivitiesError(null);
    try {
      const result = await apiFetch<{ ok: boolean; data: Activity[] }>(
        `/api/crm/leads/${lead.id}/activities`,
      );
      setActivities(result.data ?? []);
    } catch (err) {
      setActivitiesError(err instanceof Error ? err.message : "Unable to load activities.");
    } finally {
      setActivitiesLoading(false);
    }
  }

  async function loadStages(pid: string) {
    if (!pid) {
      setStages([]);
      return;
    }
    setLoadingStages(true);
    try {
      const result = await apiFetch<{ ok: boolean; data: Stage[] }>(
        `/api/crm/pipelines/${pid}/stages`,
      );
      setStages(result.data ?? []);
    } catch {
      setStages([]);
    } finally {
      setLoadingStages(false);
    }
  }

  async function handleAssignPipeline() {
    if (!pipelineId) return;
    setAssigningPipeline(true);
    setPipelineError(null);
    setPipelineSuccess(false);
    try {
      await apiFetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId || null,
          pipeline_stage_id: stageId || null,
        }),
      });
      setPipelineSuccess(true);
      router.refresh();
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : "Unable to assign pipeline.");
    } finally {
      setAssigningPipeline(false);
    }
  }

  const statusStyle = STATUS_STYLES[lead.status] ?? { background: "#1a1a2e", color: "#7070a0" };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 49,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          background: "rgba(30,30,32,0.98)",
          backdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          zIndex: 50,
          overflowY: "auto",
          padding: 24,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
            gap: 12,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-lora)",
                fontSize: "1.4rem",
                color: "hsl(0,0%,100%)",
                margin: 0,
                marginBottom: 8,
              }}
            >
              {leadDisplayName(lead)}
            </h2>
            <span
              style={{
                display: "inline-block",
                background: statusStyle.background,
                color: statusStyle.color,
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 12,
                fontFamily: "var(--font-instrument-sans)",
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {lead.status}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "hsl(0,0%,50%)",
              cursor: "pointer",
              fontSize: 20,
              padding: 4,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Details */}
        <div
          style={{
            background: "hsl(220, 8%, 24%)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <Field
            label="Name"
            value={[lead.first_name, lead.last_name].filter(Boolean).join(" ") || null}
          />
          <Field label="Company" value={lead.company_name} />
          <Field label="Email" value={lead.email} />
          <Field label="Phone" value={lead.phone} />
          <Field label="Source" value={lead.source} />
          <Field label="Industry" value={lead.industry} />
          <Field
            label="Estimated Revenue"
            value={
              lead.estimated_revenue != null
                ? formatCurrency(lead.estimated_revenue)
                : null
            }
          />
          <Field label="Pipeline" value={currentPipeline?.name} />
          <Field label="Stage" value={currentStage?.name} />
          <Field
            label="Assigned To"
            value={lead.assigned_producer_display_name}
          />
          <Field label="Notes" value={lead.notes} />
          <Field label="Created" value={formatDateTime(lead.created_at)} />
        </div>

        {/* Pipeline assignment */}
        <div
          style={{
            background: "hsl(220, 8%, 24%)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "hsl(0,0%,50%)",
              marginBottom: 12,
            }}
          >
            {lead.pipeline_id ? "Pipeline Assignment" : "Add to Pipeline"}
          </div>

          {pipelines.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                color: "hsl(0,0%,50%)",
              }}
            >
              No pipelines available.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label
                  style={{
                    ...LABEL_STYLE,
                    marginBottom: 6,
                  }}
                >
                  Pipeline
                </label>
                <select
                  value={pipelineId}
                  style={SELECT_STYLE}
                  onChange={(e) => {
                    setPipelineId(e.target.value);
                    setStageId("");
                    void loadStages(e.target.value);
                  }}
                >
                  <option value="">No pipeline</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {pipelineId && (
                <div>
                  <label style={{ ...LABEL_STYLE, marginBottom: 6 }}>Stage</label>
                  {loadingStages ? (
                    <div
                      style={{
                        ...SELECT_STYLE,
                        color: "hsl(0,0%,50%)",
                        cursor: "default",
                      }}
                    >
                      Loading stages...
                    </div>
                  ) : (
                    <select
                      value={stageId}
                      style={SELECT_STYLE}
                      onChange={(e) => setStageId(e.target.value)}
                    >
                      <option value="">No stage</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {pipelineError && (
                <p
                  style={{
                    color: "#e05252",
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  {pipelineError}
                </p>
              )}

              {pipelineSuccess && (
                <p
                  style={{
                    color: "#4caf7d",
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  Pipeline updated.
                </p>
              )}

              <button
                onClick={handleAssignPipeline}
                disabled={assigningPipeline || !pipelineId}
                style={{
                  background: "#3762e3",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: assigningPipeline || !pipelineId ? "not-allowed" : "pointer",
                  opacity: assigningPipeline || !pipelineId ? 0.6 : 1,
                  alignSelf: "flex-start",
                }}
              >
                {assigningPipeline
                  ? "Saving..."
                  : lead.pipeline_id
                    ? "Move Stage"
                    : "Assign to Pipeline"}
              </button>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div>
          <div
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "hsl(0,0%,50%)",
              marginBottom: 12,
            }}
          >
            Activity
          </div>

          {activitiesLoading ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                color: "hsl(0,0%,50%)",
              }}
            >
              Loading...
            </p>
          ) : activitiesError ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                color: "#e05252",
              }}
            >
              {activitiesError}
            </p>
          ) : activities.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                color: "hsl(0,0%,50%)",
              }}
            >
              No activity logged yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  style={{
                    background: "hsl(220, 8%, 24%)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        color:
                          ACTIVITY_TYPE_COLORS[activity.activity_type] ?? "#7070a0",
                        borderRadius: 5,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontFamily: "var(--font-instrument-sans)",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {activity.activity_type}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 11,
                        color: "hsl(0,0%,50%)",
                        marginLeft: "auto",
                      }}
                    >
                      {formatDateTime(activity.occurred_at ?? activity.created_at)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: 13,
                      color: "hsl(0,0%,80%)",
                      margin: 0,
                    }}
                  >
                    {activity.summary}
                  </p>
                  {activity.created_by_name && (
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 11,
                        color: "hsl(0,0%,50%)",
                      }}
                    >
                      by {activity.created_by_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
