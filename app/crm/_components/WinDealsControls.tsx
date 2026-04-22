"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type ActiveFilters = {
  producerId?: string;
  dateFrom?: string;
  dateTo?: string;
  revenueMin?: number | "";
  revenueMax?: number | "";
  industry?: string;
  source?: string;
  status?: string;
};

type Props = {
  pipelines: { id: string; name: string }[];
  selectedPipelineId: string | null;
  csrUsers: { id: string; display_name: string }[];
  activeFilters: ActiveFilters;
  onFiltersChange: (filters: ActiveFilters) => void;
};

const STATUSES = ["new", "working", "qualified", "converted", "lost", "archived"];

export function WinDealsControls({
  pipelines,
  selectedPipelineId,
  csrUsers,
  activeFilters,
  onFiltersChange,
}: Props) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Local draft state for the filter panel
  const [draft, setDraft] = useState<ActiveFilters>(activeFilters);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  function openFilter() {
    setDraft(activeFilters);
    setFilterOpen(true);
  }

  function applyFilters() {
    onFiltersChange(draft);
    setFilterOpen(false);
  }

  function resetFilters() {
    const empty: ActiveFilters = {};
    setDraft(empty);
    onFiltersChange(empty);
    setFilterOpen(false);
  }

  const hasFilters = Object.values(activeFilters).some((v) => v !== undefined && v !== "");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgb(41, 41, 41)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "7px 10px",
    color: "hsl(0,0%,100%)",
    fontSize: "12px",
    fontFamily: "var(--font-instrument-sans)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-instrument-sans)",
    fontSize: "11px",
    color: "hsl(0,0%,50%)",
    marginBottom: "3px",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
      {/* Pipeline dropdown */}
      {pipelines.length > 0 ? (
        <div style={{ position: "relative" }}>
          <select
            value={selectedPipelineId ?? ""}
            onChange={(e) => {
              router.push(`/crm/win-deals?pipeline_id=${e.target.value}`);
            }}
            style={{
              background: "rgb(41, 41, 41)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              padding: "7px 32px 7px 12px",
              color: "hsl(0,0%,90%)",
              fontSize: "13px",
              fontFamily: "var(--font-instrument-sans)",
              outline: "none",
              cursor: "pointer",
              appearance: "none",
              minWidth: "160px",
            }}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {/* Chevron icon */}
          <svg
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "hsl(0,0%,50%)",
            }}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : null}

      {/* Filter button + dropdown */}
      <div ref={filterRef} style={{ position: "relative" }}>
        <button
          onClick={openFilter}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: hasFilters ? "#3762e3" : "rgb(41, 41, 41)",
            border: hasFilters
              ? "1px solid rgba(55, 98, 227, 0.6)"
              : "1px solid rgba(255,255,255,0.12)",
            borderRadius: "8px",
            padding: "7px 14px",
            color: "hsl(0,0%,100%)",
            fontSize: "13px",
            fontFamily: "var(--font-instrument-sans)",
            fontWeight: hasFilters ? 600 : 400,
            cursor: "pointer",
            transition: "background 0.12s",
            whiteSpace: "nowrap",
          }}
        >
          {/* Filter icon */}
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M1.5 2.5h10M3.5 6.5h6M5.5 10.5h2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Filter{hasFilters ? " •" : ""}
        </button>

        {filterOpen ? (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              zIndex: 200,
              background: "rgba(31, 31, 31, 0.98)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "16px",
              width: "300px",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: "12px",
                fontWeight: 600,
                color: "hsl(0,0%,80%)",
                marginBottom: "12px",
              }}
            >
              Filter Deals
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Producer */}
              <label>
                <span style={labelStyle}>Producer</span>
                <select
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                  value={draft.producerId ?? ""}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, producerId: e.target.value || undefined }))
                  }
                >
                  <option value="">All producers</option>
                  {csrUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Revenue range */}
              <div>
                <span style={labelStyle}>Revenue Range</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={draft.revenueMin ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        revenueMin: e.target.value ? Number(e.target.value) : "",
                      }))
                    }
                  />
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={draft.revenueMax ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        revenueMax: e.target.value ? Number(e.target.value) : "",
                      }))
                    }
                  />
                </div>
              </div>

              {/* Date range */}
              <div>
                <span style={labelStyle}>Lead Entered Date</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <input
                    style={inputStyle}
                    type="date"
                    value={draft.dateFrom ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, dateFrom: e.target.value || undefined }))
                    }
                  />
                  <input
                    style={inputStyle}
                    type="date"
                    value={draft.dateTo ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, dateTo: e.target.value || undefined }))
                    }
                  />
                </div>
              </div>

              {/* Industry */}
              <label>
                <span style={labelStyle}>Industry</span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. Manufacturing"
                  value={draft.industry ?? ""}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, industry: e.target.value || undefined }))
                  }
                />
              </label>

              {/* Source */}
              <label>
                <span style={labelStyle}>Source</span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. referral"
                  value={draft.source ?? ""}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, source: e.target.value || undefined }))
                  }
                />
              </label>

              {/* Status */}
              <label>
                <span style={labelStyle}>Status</span>
                <select
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                  value={draft.status ?? ""}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, status: e.target.value || undefined }))
                  }
                >
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button
                onClick={applyFilters}
                style={{
                  flex: 1,
                  background: "#3762e3",
                  color: "hsl(0,0%,100%)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
              <button
                onClick={resetFilters}
                style={{
                  background: "transparent",
                  color: "hsl(0,0%,50%)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontFamily: "var(--font-instrument-sans)",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Manage Pipelines */}
      <Link
        href="/crm/settings/pipelines"
        style={{
          background: "rgba(51, 51, 51, 0.60)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "8px",
          padding: "7px 16px",
          color: "hsl(0,0%,80%)",
          fontSize: "13px",
          fontFamily: "var(--font-instrument-sans)",
          whiteSpace: "nowrap",
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        Manage Pipelines
      </Link>
    </div>
  );
}
