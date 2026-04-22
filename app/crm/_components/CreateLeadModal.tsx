"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/app/lib/apiClient";
import type { KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";

type Stage = { id: string; name: string; stage_type: string };

type Props = {
  pipelineId: string;
  stages: Stage[];
  csrUsers: { id: string; display_name: string }[];
  onSuccess: (lead: KanbanLead, stageId: string) => void;
  onClose: () => void;
};

export function CreateLeadModal({ pipelineId, stages, csrUsers, onSuccess, onClose }: Props) {
  const firstOpenId = stages.find((s) => s.stage_type === "open")?.id ?? stages[0]?.id ?? "";

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [revenue, setRevenue] = useState("");
  const [stageId, setStageId] = useState(firstOpenId);
  const [producerId, setProducerId] = useState("");
  const [source, setSource] = useState("");
  const [industry, setIndustry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName && !firstName && !lastName && !email && !phone) {
      setError("At least one of company name, name, email, or phone is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; data: KanbanLead }>("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName || null,
          first_name: firstName || null,
          last_name: lastName || null,
          email: email || null,
          phone: phone || null,
          estimated_revenue: revenue ? Number(revenue) : null,
          pipeline_id: pipelineId,
          pipeline_stage_id: stageId || null,
          assigned_producer_id: producerId || null,
          source: source || "manual",
          industry: industry || null,
        }),
      });
      onSuccess(result.data, stageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "hsl(220, 8%, 24%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "hsl(0,0%,100%)",
    fontSize: "13px",
    fontFamily: "var(--font-instrument-sans)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-instrument-sans)",
    fontSize: "11px",
    color: "hsl(0,0%,50%)",
    marginBottom: "4px",
  };

  const modal = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(37, 37, 40, 0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "16px",
          maxWidth: "480px",
          width: "100%",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <h2
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: "20px",
              fontWeight: 400,
              color: "hsl(0,0%,100%)",
              marginBottom: "4px",
            }}
          >
            Create New Deal
          </h2>
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: "13px",
              color: "hsl(0,0%,50%)",
              marginBottom: "20px",
            }}
          >
            Add a new lead to this pipeline.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label>
              <span style={labelStyle}>Company Name</span>
              <input
                style={inputStyle}
                type="text"
                placeholder="ACME Corp."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label>
                <span style={labelStyle}>First Name</span>
                <input
                  style={inputStyle}
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label>
                <span style={labelStyle}>Last Name</span>
                <input
                  style={inputStyle}
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
            </div>

            <label>
              <span style={labelStyle}>Estimated Revenue ($)</span>
              <input
                style={inputStyle}
                type="number"
                min="0"
                placeholder="0"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </label>

            <label>
              <span style={labelStyle}>Pipeline Stage</span>
              <select
                style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>Assigned Producer</span>
              <select
                style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                value={producerId}
                onChange={(e) => setProducerId(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {csrUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label>
                <span style={labelStyle}>Industry</span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Manufacturing"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </label>
              <label>
                <span style={labelStyle}>Source</span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="referral"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label>
                <span style={labelStyle}>Email</span>
                <input
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                <span style={labelStyle}>Phone</span>
                <input
                  style={inputStyle}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>
          </div>

          {error ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "13px",
                color: "hsl(0, 72%, 60%)",
                marginTop: "12px",
              }}
            >
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <button
              disabled={submitting}
              type="submit"
              style={{
                flex: 1,
                background: submitting ? "hsl(220, 8%, 32%)" : "#3762e3",
                color: "hsl(0,0%,100%)",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "13px",
                fontFamily: "var(--font-instrument-sans)",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {submitting ? "Creating…" : "Create Deal"}
            </button>
            <button
              disabled={submitting}
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                color: "hsl(0,0%,50%)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "13px",
                fontFamily: "var(--font-instrument-sans)",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
