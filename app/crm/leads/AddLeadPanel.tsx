"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";

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

type Props = {
  pipelines: Pipeline[];
  onClose: () => void;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "var(--font-instrument-sans)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "hsl(0,0%,50%)",
  marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "hsl(220, 8%, 24%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "hsl(0,0%,100%)",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  outline: "none",
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: "pointer",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  resize: "vertical",
  minHeight: 80,
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social" },
  { value: "cold_call", label: "Cold Call" },
  { value: "other", label: "Other" },
];

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

export function AddLeadPanel({ pipelines, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  async function loadStages(pipelineId: string) {
    if (!pipelineId) {
      setStages([]);
      return;
    }
    setLoadingStages(true);
    try {
      const result = await apiFetch<{ ok: boolean; data: Stage[] }>(
        `/api/crm/pipelines/${pipelineId}/stages`,
      );
      setStages(result.data ?? []);
    } catch {
      setStages([]);
    } finally {
      setLoadingStages(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    function emptyToNull(val: string) {
      const t = val.trim();
      return t || null;
    }

    const estimatedRevenueRaw = String(formData.get("estimated_revenue") ?? "").trim();

    const payload: Record<string, unknown> = {
      first_name: emptyToNull(String(formData.get("first_name") ?? "")),
      last_name: emptyToNull(String(formData.get("last_name") ?? "")),
      email: emptyToNull(String(formData.get("email") ?? "")),
      phone: emptyToNull(String(formData.get("phone") ?? "")),
      company_name: emptyToNull(String(formData.get("company_name") ?? "")),
      industry: emptyToNull(String(formData.get("industry") ?? "")),
      source: String(formData.get("source") ?? "manual"),
      estimated_revenue: estimatedRevenueRaw ? Number(estimatedRevenueRaw) : null,
      notes: emptyToNull(String(formData.get("notes") ?? "")),
      pipeline_id: emptyToNull(String(formData.get("pipeline_id") ?? "")),
      pipeline_stage_id: emptyToNull(String(formData.get("pipeline_stage_id") ?? "")),
    };

    try {
      await apiFetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create lead.");
    } finally {
      setLoading(false);
    }
  }

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
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: "1.5rem",
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            Add Lead
          </h2>
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
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="First Name">
              <input name="first_name" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Last Name">
              <input name="last_name" style={INPUT_STYLE} />
            </FormField>
          </div>

          <FormField label="Email">
            <input name="email" type="email" style={INPUT_STYLE} />
          </FormField>

          <FormField label="Phone">
            <input name="phone" style={INPUT_STYLE} />
          </FormField>

          <FormField label="Company Name">
            <input name="company_name" style={INPUT_STYLE} />
          </FormField>

          <FormField label="Industry">
            <input name="industry" style={INPUT_STYLE} />
          </FormField>

          <FormField label="Source">
            <select name="source" defaultValue="manual" style={SELECT_STYLE}>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Estimated Revenue">
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "hsl(0,0%,50%)",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  pointerEvents: "none",
                }}
              >
                $
              </span>
              <input
                name="estimated_revenue"
                type="number"
                min="0"
                step="0.01"
                style={{ ...INPUT_STYLE, paddingLeft: 24 }}
              />
            </div>
          </FormField>

          <FormField label="Notes">
            <textarea name="notes" style={TEXTAREA_STYLE} />
          </FormField>

          {pipelines.length > 0 && (
            <>
              <FormField label="Pipeline (optional)">
                <select
                  name="pipeline_id"
                  defaultValue=""
                  style={SELECT_STYLE}
                  onChange={(e) => {
                    setSelectedPipelineId(e.target.value);
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
              </FormField>

              {selectedPipelineId && (
                <FormField label="Stage (optional)">
                  {loadingStages ? (
                    <div
                      style={{
                        ...INPUT_STYLE,
                        color: "hsl(0,0%,50%)",
                        pointerEvents: "none",
                      }}
                    >
                      Loading stages...
                    </div>
                  ) : (
                    <select name="pipeline_stage_id" defaultValue="" style={SELECT_STYLE}>
                      <option value="">No stage</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              )}
            </>
          )}

          {error && (
            <p
              style={{
                color: "#e05252",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: "#3762e3",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Saving..." : "Save Lead"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "hsl(0,0%,80%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
