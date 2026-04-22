"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/app/lib/apiClient";
import type { KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";

type Props = {
  lead: KanbanLead;
  wonStageId: string;
  fromStageId: string;
  csrUsers: { id: string; display_name: string }[];
  onSuccess: (leadId: string) => void;
  onCancel: () => void;
};

export function ConvertToCustomerModal({
  lead,
  wonStageId,
  csrUsers,
  onSuccess,
  onCancel,
}: Props) {
  const leadFullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");

  const [accountName, setAccountName] = useState(lead.company_name ?? leadFullName);
  const [primaryContactName, setPrimaryContactName] = useState(leadFullName);
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [businessType, setBusinessType] = useState("");
  const [accountManagerUserId, setAccountManagerUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiFetch<{ ok: boolean; data: { account_id: string } }>(
        `/api/crm/leads/${lead.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_name: accountName,
            primary_contact_name: primaryContactName,
            email: email || null,
            phone: phone || null,
            business_type: businessType || null,
            account_manager_user_id: accountManagerUserId || null,
            pipeline_stage_id: wonStageId,
          }),
        },
      );

      setSuccess(true);
      setTimeout(() => {
        onSuccess(lead.id);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert lead.");
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
    fontSize: "14px",
    fontFamily: "var(--font-instrument-sans)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-instrument-sans)",
    fontSize: "12px",
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
    >
      <div
        style={{
          background: "rgba(37, 37, 40, 0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "16px",
          maxWidth: "480px",
          width: "100%",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.7)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: "24px",
              }}
            >
              ✓
            </div>
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "16px",
                color: "hsl(160, 60%, 70%)",
              }}
            >
              Customer created successfully
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            {/* Title */}
            <h2
              style={{
                fontFamily: "var(--font-lora)",
                fontSize: "20px",
                fontWeight: 400,
                color: "hsl(0,0%,100%)",
                marginBottom: "6px",
              }}
            >
              Convert to Customer
            </h2>
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "13px",
                color: "hsl(0,0%,50%)",
                marginBottom: "20px",
              }}
            >
              Set up the customer account for{" "}
              <strong style={{ color: "hsl(0,0%,80%)" }}>
                {lead.company_name ?? leadFullName}
              </strong>
            </p>

            {/* Info banner */}
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "12px",
                color: "hsl(0,0%,65%)",
              }}
            >
              Policy details will be set up by your CSR team after account creation.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Account Name */}
              <label>
                <span style={labelStyle}>Account Name</span>
                <input
                  required
                  style={inputStyle}
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </label>

              {/* Primary Contact Name */}
              <label>
                <span style={labelStyle}>Primary Contact Name</span>
                <input
                  required
                  style={inputStyle}
                  type="text"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                />
              </label>

              {/* Email */}
              <label>
                <span style={labelStyle}>Email</span>
                <input
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              {/* Phone */}
              <label>
                <span style={labelStyle}>Phone</span>
                <input
                  style={inputStyle}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              {/* Business Type */}
              <label>
                <span style={labelStyle}>Business Type</span>
                <input
                  style={inputStyle}
                  type="text"
                  value={businessType}
                  placeholder="e.g. LLC, S-Corp, Sole Proprietor"
                  onChange={(e) => setBusinessType(e.target.value)}
                />
              </label>

              {/* Account Manager */}
              <label>
                <span style={labelStyle}>Account Manager (CSR)</span>
                <select
                  style={{
                    ...inputStyle,
                    appearance: "none" as const,
                    cursor: "pointer",
                  }}
                  value={accountManagerUserId}
                  onChange={(e) => setAccountManagerUserId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {csrUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? (
              <p
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: "13px",
                  color: "hsl(0, 72%, 60%)",
                  marginTop: "14px",
                }}
              >
                {error}
              </p>
            ) : null}

            {/* Buttons */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "24px",
              }}
            >
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
                  fontSize: "14px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {submitting ? "Creating…" : "Create Customer"}
              </button>
              <button
                disabled={submitting}
                type="button"
                onClick={onCancel}
                style={{
                  background: "transparent",
                  color: "hsl(0,0%,50%)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontFamily: "var(--font-instrument-sans)",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
