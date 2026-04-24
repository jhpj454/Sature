"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/app/lib/apiClient";
import type { KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";

type Props = {
  lead: KanbanLead;
  csrUsers: { id: string; display_name: string }[];
  onClose: () => void;
  onSave: (updated: KanbanLead) => void;
  onDelete: (leadId: string) => void;
};

export function EditLeadModal({ lead, csrUsers, onClose, onSave, onDelete }: Props) {
  const [companyName, setCompanyName] = useState(lead.company_name ?? "");
  const [firstName, setFirstName] = useState(lead.first_name ?? "");
  const [lastName, setLastName] = useState(lead.last_name ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [revenue, setRevenue] = useState(
    lead.estimated_revenue !== null && lead.estimated_revenue !== undefined
      ? String(lead.estimated_revenue)
      : "",
  );
  const [source, setSource] = useState(lead.source ?? "");
  const [industry, setIndustry] = useState(lead.industry ?? "");
  const [producerId, setProducerId] = useState(lead.assigned_producer_id ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; data: Record<string, unknown> }>(
        `/api/crm/leads/${lead.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: companyName || null,
            first_name: firstName || null,
            last_name: lastName || null,
            email: email || null,
            phone: phone || null,
            estimated_revenue: revenue !== "" ? Number(revenue) : null,
            source: source || null,
            industry: industry || null,
            assigned_producer_id: producerId || null,
          }),
        },
      );
      const row = result.data;
      const updated: KanbanLead = {
        id: row.id as string,
        first_name: (row.first_name as string | null) ?? null,
        last_name: (row.last_name as string | null) ?? null,
        company_name: (row.company_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        source: (row.source as string | null) ?? null,
        industry: (row.industry as string | null) ?? null,
        estimated_revenue: (row.estimated_revenue as string | number | null) ?? null,
        pipeline_stage_id: (row.pipeline_stage_id as string | null) ?? null,
        assigned_producer_id: (row.assigned_producer_id as string | null) ?? null,
        assigned_producer_display_name: null,
        status: (row.status as string) ?? lead.status,
        created_at: (row.created_at as string | null) ?? lead.created_at,
      };
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await apiFetch<{ ok: boolean }>(`/api/crm/leads/${lead.id}`, {
        method: "DELETE",
      });
      onDelete(lead.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lead.");
      setDeleting(false);
      setConfirmDelete(false);
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
        zIndex: 9999,
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
          maxWidth: "520px",
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
            Edit Deal
          </h2>
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: "13px",
              color: "hsl(0,0%,50%)",
              marginBottom: "20px",
            }}
          >
            Update details for this lead.
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
              disabled={submitting || deleting}
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
                cursor: submitting || deleting ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {submitting ? "Saving…" : "Save Changes"}
            </button>
            <button
              disabled={submitting || deleting}
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
                cursor: submitting || deleting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>

          {/* Delete section */}
          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            {confirmDelete ? (
              <>
                <span
                  style={{
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: "12px",
                    color: "hsl(0,0%,55%)",
                  }}
                >
                  Are you sure? This cannot be undone.
                </span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                  style={{
                    background: "hsl(0, 60%, 42%)",
                    color: "hsl(0,0%,100%)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontSize: "12px",
                    fontFamily: "var(--font-instrument-sans)",
                    fontWeight: 600,
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: "transparent",
                    color: "hsl(0,0%,50%)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontSize: "12px",
                    fontFamily: "var(--font-instrument-sans)",
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={submitting || deleting}
                onClick={() => void handleDelete()}
                style={{
                  background: "transparent",
                  color: "hsl(0, 60%, 60%)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontFamily: "var(--font-instrument-sans)",
                  cursor: submitting || deleting ? "not-allowed" : "pointer",
                }}
              >
                Delete Lead
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
