"use client";

import { useState } from "react";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";
import { LeadDetailPanel } from "./LeadDetailPanel";
import { AddLeadPanel } from "./AddLeadPanel";

export type Lead = {
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
  pipeline_name?: string | null;
  pipeline_stage_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type Pipeline = {
  id: string;
  name: string;
};

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  new: { background: "#1a3a6b", color: "#5a9ff5" },
  working: { background: "#3d2e00", color: "#f5c542" },
  qualified: { background: "#0d3d2a", color: "#4caf7d" },
  converted: { background: "#1e1e1e", color: "hsl(0,0%,50%)" },
  lost: { background: "#3d0d0d", color: "#e05252" },
  archived: { background: "#1a1a2e", color: "#7070a0" },
};

const TH_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 11,
  color: "hsl(0,0%,50%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 500,
};

const TD_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,80%)",
  padding: "12px 16px",
  verticalAlign: "middle",
};

function leadDisplayName(lead: Lead) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.company_name || lead.email || lead.phone || lead.id.slice(0, 8);
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { background: "#1a1a2e", color: "#7070a0" };
  return (
    <span
      style={{
        display: "inline-block",
        background: style.background,
        color: style.color,
        borderRadius: 6,
        padding: "3px 10px",
        fontSize: 12,
        fontFamily: "var(--font-instrument-sans)",
        fontWeight: 500,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function LeadRow({
  lead,
  onClick,
}: {
  lead: Lead;
  onClick: (lead: Lead) => void;
}) {
  return (
    <tr
      onClick={() => onClick(lead)}
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background =
          "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
      }}
    >
      {/* Name */}
      <td style={TD_STYLE}>
        <span
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: 14,
            color: "hsl(0,0%,100%)",
          }}
        >
          {leadDisplayName(lead)}
        </span>
      </td>

      {/* Company */}
      <td style={TD_STYLE}>{lead.company_name ?? <span style={{ color: "hsl(0,0%,50%)" }}>—</span>}</td>

      {/* Status */}
      <td style={TD_STYLE}>
        <StatusBadge status={lead.status} />
      </td>

      {/* Source */}
      <td style={TD_STYLE}>
        <span
          style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.06)",
            color: "hsl(0,0%,70%)",
            borderRadius: 6,
            padding: "2px 9px",
            fontSize: 12,
            fontFamily: "var(--font-instrument-sans)",
          }}
        >
          {lead.source}
        </span>
      </td>

      {/* Est. Revenue */}
      <td style={TD_STYLE}>
        {lead.estimated_revenue != null
          ? formatCurrency(lead.estimated_revenue)
          : <span style={{ color: "hsl(0,0%,50%)" }}>—</span>}
      </td>

      {/* Pipeline Stage */}
      <td style={TD_STYLE}>
        {lead.pipeline_stage_name ?? lead.pipeline_name
          ? (
            <span style={{ color: "hsl(0,0%,80%)" }}>
              {lead.pipeline_stage_name ?? lead.pipeline_name}
            </span>
          )
          : <span style={{ color: "hsl(0,0%,50%)" }}>—</span>}
      </td>

      {/* Assigned */}
      <td style={TD_STYLE}>
        {lead.assigned_producer_display_name ?? (
          <span style={{ color: "hsl(0,0%,50%)" }}>Unassigned</span>
        )}
      </td>

      {/* Created */}
      <td style={TD_STYLE}>
        <span style={{ fontSize: 12, color: "hsl(0,0%,50%)" }}>
          {formatDateTime(lead.created_at)}
        </span>
      </td>
    </tr>
  );
}

export function LeadsTable({
  leads,
  pipelines,
}: {
  leads: Lead[];
  pipelines: Pipeline[];
}) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  return (
    <>
      {/* Add Lead button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 0 }}>
        <button
          onClick={() => setShowAddPanel(true)}
          style={{
            background: "#3762e3",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + Add Lead
        </button>
      </div>

      {/* Table card */}
      <div
        style={{
          background: "rgba(30,35,50,0.70)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {leads.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              color: "hsl(0,0%,50%)",
            }}
          >
            No leads yet. Add your first lead to get started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={TH_STYLE}>Name</th>
                <th style={TH_STYLE}>Company</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Source</th>
                <th style={TH_STYLE}>Est. Revenue</th>
                <th style={TH_STYLE}>Pipeline Stage</th>
                <th style={TH_STYLE}>Assigned</th>
                <th style={TH_STYLE}>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onClick={setSelectedLead}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          pipelines={pipelines}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {/* Add lead panel */}
      {showAddPanel && (
        <AddLeadPanel
          pipelines={pipelines}
          onClose={() => setShowAddPanel(false)}
        />
      )}
    </>
  );
}
