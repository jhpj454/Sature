"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import type { KanbanLead } from "@/app/crm/_components/LeadKanbanBoard";

type LeadListItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  estimated_revenue: string | number | null;
  pipeline_id: string | null;
  assigned_producer_display_name: string | null;
  industry: string | null;
  source: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  pipeline_stage_id: string | null;
  assigned_producer_id: string | null;
  created_at: string | null;
};

type Props = {
  pipelineId: string;
  firstOpenStageId: string;
  onSuccess: (leads: KanbanLead[]) => void;
  onClose: () => void;
};

function displayName(lead: LeadListItem): string {
  if (lead.company_name) return lead.company_name;
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unnamed Lead";
}

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

export function ImportFromLeadsModal({ pipelineId, firstOpenStageId, onSuccess, onClose }: Props) {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ ok: boolean; data: LeadListItem[] }>(
          "/api/crm/leads?page_size=100&view=all",
        );
        // Filter out leads already in this pipeline
        const available = res.data.filter((l) => l.pipeline_id !== pipelineId);
        setLeads(available);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load leads.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pipelineId]);

  const filtered = leads.filter((l) =>
    displayName(l).toLowerCase().includes(search.toLowerCase()),
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    if (selected.size === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const toImport = leads.filter((l) => selected.has(l.id));
      await Promise.all(
        toImport.map((lead) =>
          apiFetch(`/api/crm/leads/${lead.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pipeline_id: pipelineId,
              pipeline_stage_id: firstOpenStageId,
            }),
          }),
        ),
      );
      const imported: KanbanLead[] = toImport.map((l) => ({
        id: l.id,
        first_name: l.first_name,
        last_name: l.last_name,
        company_name: l.company_name,
        email: l.email,
        phone: l.phone,
        source: l.source,
        industry: l.industry,
        estimated_revenue: l.estimated_revenue,
        pipeline_stage_id: firstOpenStageId,
        assigned_producer_id: l.assigned_producer_id,
        assigned_producer_display_name: l.assigned_producer_display_name,
        status: l.status,
        created_at: l.created_at,
      }));
      onSuccess(imported);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(20, 25, 40, 0.97)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "16px",
          maxWidth: "520px",
          width: "100%",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "20px",
            fontWeight: 400,
            color: "hsl(0,0%,100%)",
            marginBottom: "4px",
          }}
        >
          Import from Lead List
        </h2>
        <p
          style={{
            fontFamily: "var(--font-instrument-sans)",
            fontSize: "13px",
            color: "hsl(0,0%,50%)",
            marginBottom: "16px",
          }}
        >
          Select existing leads to add to this pipeline.
        </p>

        <input
          style={{ ...inputStyle, marginBottom: "12px" }}
          type="text"
          placeholder="Search leads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Lead list */}
        <div style={{ flex: 1, overflowY: "auto", marginBottom: "16px" }}>
          {loading ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "13px",
                color: "hsl(0,0%,50%)",
                padding: "12px 0",
              }}
            >
              Loading leads…
            </p>
          ) : loadError ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "13px",
                color: "hsl(0, 72%, 60%)",
                padding: "12px 0",
              }}
            >
              {loadError}
            </p>
          ) : filtered.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "13px",
                color: "hsl(0,0%,50%)",
                padding: "12px 0",
              }}
            >
              {search ? "No leads match your search." : "No leads available to import."}
            </p>
          ) : (
            filtered.map((lead) => {
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  onClick={() => toggleSelect(lead.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: isSelected ? "rgba(55, 98, 227, 0.12)" : "transparent",
                    border: isSelected
                      ? "1px solid rgba(55, 98, 227, 0.3)"
                      : "1px solid transparent",
                    cursor: "pointer",
                    marginBottom: "4px",
                    transition: "background 0.1s, border-color 0.1s",
                  }}
                >
                  {/* Checkbox indicator */}
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      border: isSelected
                        ? "2px solid #3762e3"
                        : "2px solid rgba(255,255,255,0.2)",
                      background: isSelected ? "#3762e3" : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected ? (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: "13px",
                        color: "hsl(0,0%,90%)",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {displayName(lead)}
                    </div>
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

                  <div
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: "13px",
                      color: "hsl(0,0%,70%)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatRevenue(lead.estimated_revenue)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {importError ? (
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: "13px",
              color: "hsl(0, 72%, 60%)",
              marginBottom: "12px",
            }}
          >
            {importError}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            disabled={importing || selected.size === 0}
            onClick={() => void handleImport()}
            style={{
              flex: 1,
              background:
                importing || selected.size === 0 ? "hsl(220, 8%, 32%)" : "#3762e3",
              color: "hsl(0,0%,100%)",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              fontWeight: 600,
              cursor: importing || selected.size === 0 ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {importing
              ? "Importing…"
              : selected.size > 0
                ? `Import ${selected.size} Lead${selected.size > 1 ? "s" : ""}`
                : "Select leads to import"}
          </button>
          <button
            disabled={importing}
            onClick={onClose}
            style={{
              background: "transparent",
              color: "hsl(0,0%,50%)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              cursor: importing ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
