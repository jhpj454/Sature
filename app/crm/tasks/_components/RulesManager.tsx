"use client";

import { useState } from "react";
import type { TaskRule, TaskTemplate } from "../page";

const TH_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 11,
  color: "hsl(0,0%,50%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "10px 16px",
  textAlign: "left",
  fontWeight: 500,
};

const TD_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,80%)",
  padding: "10px 16px",
  verticalAlign: "middle",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "8px 12px",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 13,
  color: "hsl(0,0%,90%)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "hsl(0,0%,50%)",
  fontFamily: "var(--font-instrument-sans)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const TRIGGER_TYPES = [
  { value: "policy_expiration", label: "Days before policy expires" },
  { value: "account_created", label: "Days after account created" },
  { value: "deal_won", label: "Days after deal won" },
  { value: "deal_stage_changed", label: "Deal stage changed" },
  { value: "recurring_schedule", label: "Recurring schedule" },
];

const RRULE_PRESETS = [
  { label: "Daily", value: "FREQ=DAILY" },
  { label: "Weekly Monday", value: "FREQ=WEEKLY;BYDAY=MO" },
  { label: "Monthly 1st", value: "FREQ=MONTHLY;BYMONTHDAY=1" },
  { label: "Custom", value: "" },
];

const SEGMENT_FILTER_KEYS = ["policy_type", "line_of_business", "account_type"];

type SegmentFilter = { key: string; value: string };

type FormState = {
  name: string;
  template_id: string;
  trigger_type: string;
  trigger_offset_days: string;
  recurrence_rule: string;
  rrule_preset: string;
  is_active: boolean;
  segment_filters: SegmentFilter[];
};

const emptyForm = (): FormState => ({
  name: "",
  template_id: "",
  trigger_type: "policy_expiration",
  trigger_offset_days: "",
  recurrence_rule: "",
  rrule_preset: "FREQ=DAILY",
  is_active: true,
  segment_filters: [],
});

function formToPayload(form: FormState) {
  const segmentFiltersObj: Record<string, string> = {};
  for (const sf of form.segment_filters) {
    if (sf.key && sf.value) {
      segmentFiltersObj[sf.key] = sf.value;
    }
  }

  return {
    name: form.name.trim(),
    template_id: form.template_id,
    trigger_type: form.trigger_type,
    trigger_offset_days:
      form.trigger_type !== "recurring_schedule" && form.trigger_offset_days !== ""
        ? Number(form.trigger_offset_days)
        : null,
    recurrence_rule:
      form.trigger_type === "recurring_schedule"
        ? (form.rrule_preset || form.recurrence_rule || null)
        : null,
    is_active: form.is_active,
    segment_filters: segmentFiltersObj,
  };
}

function formatLastRun(dateStr: string | null) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RulesManager({
  rules,
  templates,
  onRulesChange,
}: {
  rules: TaskRule[];
  templates: TaskTemplate[];
  onRulesChange: (rules: TaskRule[]) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [running, setRunning] = useState(false);

  function startAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowAddForm(true);
    setError(null);
  }

  function startEdit(rule: TaskRule) {
    const segmentFilters: SegmentFilter[] = [];
    if (rule.segment_filters) {
      for (const [key, value] of Object.entries(rule.segment_filters)) {
        segmentFilters.push({ key, value: String(value) });
      }
    }

    // Determine rrule_preset
    const knownPresets = RRULE_PRESETS.filter((p) => p.value).map((p) => p.value);
    const rrulePreset =
      rule.recurrence_rule && knownPresets.includes(rule.recurrence_rule)
        ? rule.recurrence_rule
        : "";

    setForm({
      name: rule.name,
      template_id: rule.template_id,
      trigger_type: rule.trigger_type,
      trigger_offset_days:
        rule.trigger_offset_days != null ? String(rule.trigger_offset_days) : "",
      recurrence_rule: rule.recurrence_rule ?? "",
      rrule_preset: rrulePreset,
      is_active: rule.is_active,
      segment_filters: segmentFilters,
    });
    setEditingId(rule.id);
    setShowAddForm(true);
    setError(null);
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.template_id) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload = formToPayload(form);

      if (editingId) {
        const res = await fetch(`/api/crm/task-rules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Unable to update rule.");
          return;
        }
        onRulesChange(rules.map((r) => (r.id === editingId ? json.data : r)));
      } else {
        const res = await fetch("/api/crm/task-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Unable to create rule.");
          return;
        }
        onRulesChange([...rules, json.data]);
      }

      setShowAddForm(false);
      setEditingId(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this automation rule?")) return;
    try {
      const res = await fetch(`/api/crm/task-rules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        onRulesChange(rules.filter((r) => r.id !== id));
      }
    } catch {
      // silently fail
    }
  }

  async function handleRunRules() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/crm/task-rules/run", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setRunResult(json.data);
      } else {
        setRunResult({ created: 0, skipped: 0, errors: [json.error ?? "Unknown error"] });
      }
    } catch {
      setRunResult({ created: 0, skipped: 0, errors: ["Network error."] });
    } finally {
      setRunning(false);
    }
  }

  const showOffsetField = form.trigger_type !== "recurring_schedule";
  const showRruleField = form.trigger_type === "recurring_schedule";

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          gap: 12,
        }}
      >
        {/* Run result toast */}
        {runResult && (
          <div
            style={{
              flex: 1,
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              color:
                runResult.errors.length > 0 ? "#e05252" : "#4caf7d",
              background:
                runResult.errors.length > 0
                  ? "rgba(61,13,13,0.5)"
                  : "rgba(13,61,42,0.5)",
              borderRadius: 8,
              padding: "8px 14px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Rules ran: {runResult.created} created, {runResult.skipped} skipped
            {runResult.errors.length > 0 && (
              <span style={{ marginLeft: 8, color: "#e05252" }}>
                — {runResult.errors.length} error(s)
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <button
            onClick={handleRunRules}
            disabled={running}
            style={{
              background: running ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "8px 18px",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              color: running ? "hsl(0,0%,40%)" : "hsl(0,0%,80%)",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Running..." : "Run Rules Now"}
          </button>
          <button
            onClick={startAdd}
            style={{
              background: "#3762e3",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Add Rule
          </button>
        </div>
      </div>

      {/* Inline form */}
      {showAddForm && (
        <div
          style={{
            background: "rgba(55,98,227,0.06)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: 16,
              color: "hsl(0,0%,100%)",
              marginBottom: 16,
            }}
          >
            {editingId ? "Edit Rule" : "New Automation Rule"}
          </div>

          {error && (
            <div
              style={{
                background: "rgba(61,13,13,0.7)",
                border: "1px solid rgba(224,82,82,0.3)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#e05252",
                fontSize: 13,
                fontFamily: "var(--font-instrument-sans)",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Row 1: Name, Template, Trigger Type */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 2fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={LABEL_STYLE}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Rule name"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Template *</label>
                <select
                  value={form.template_id}
                  onChange={(e) => setForm({ ...form, template_id: e.target.value })}
                  required
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="">Select template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Trigger Type</label>
                <select
                  value={form.trigger_type}
                  onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Offset Days / RRULE + Active */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showRruleField ? "2fr 2fr 1fr" : "1fr 5fr 1fr",
                gap: 14,
                marginBottom: 14,
                alignItems: "end",
              }}
            >
              {showOffsetField && (
                <div>
                  <label style={LABEL_STYLE}>Offset Days</label>
                  <input
                    type="number"
                    value={form.trigger_offset_days}
                    onChange={(e) => setForm({ ...form, trigger_offset_days: e.target.value })}
                    placeholder="0"
                    style={INPUT_STYLE}
                  />
                </div>
              )}

              {showRruleField && (
                <>
                  <div>
                    <label style={LABEL_STYLE}>Schedule Preset</label>
                    <select
                      value={form.rrule_preset}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({
                          ...form,
                          rrule_preset: val,
                          recurrence_rule: val || form.recurrence_rule,
                        });
                      }}
                      style={{ ...INPUT_STYLE, cursor: "pointer" }}
                    >
                      {RRULE_PRESETS.map((p) => (
                        <option key={p.label} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!form.rrule_preset && (
                    <div>
                      <label style={LABEL_STYLE}>Custom RRULE</label>
                      <input
                        type="text"
                        value={form.recurrence_rule}
                        onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })}
                        placeholder="FREQ=WEEKLY;BYDAY=TU"
                        style={INPUT_STYLE}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Spacer for layout when not recurring */}
              {showOffsetField && <div />}

              <div>
                <label style={LABEL_STYLE}>Active</label>
                <div style={{ display: "flex", alignItems: "center", height: 36, gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    style={{ accentColor: "#3762e3", width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: 13,
                      color: "hsl(0,0%,70%)",
                    }}
                  >
                    {form.is_active ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            {/* Segment Filters */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>Segment Filters</label>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      segment_filters: [
                        ...form.segment_filters,
                        { key: SEGMENT_FILTER_KEYS[0], value: "" },
                      ],
                    })
                  }
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6,
                    padding: "4px 12px",
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 12,
                    color: "hsl(0,0%,60%)",
                    cursor: "pointer",
                  }}
                >
                  + Add Filter
                </button>
              </div>

              {form.segment_filters.map((sf, idx) => (
                <div
                  key={idx}
                  style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}
                >
                  <select
                    value={sf.key}
                    onChange={(e) => {
                      const updated = [...form.segment_filters];
                      updated[idx] = { ...updated[idx], key: e.target.value };
                      setForm({ ...form, segment_filters: updated });
                    }}
                    style={{ ...INPUT_STYLE, width: 180, cursor: "pointer" }}
                  >
                    {SEGMENT_FILTER_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={sf.value}
                    onChange={(e) => {
                      const updated = [...form.segment_filters];
                      updated[idx] = { ...updated[idx], value: e.target.value };
                      setForm({ ...form, segment_filters: updated });
                    }}
                    placeholder="Value"
                    style={{ ...INPUT_STYLE, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        ...form,
                        segment_filters: form.segment_filters.filter((_, i) => i !== idx),
                      });
                    }}
                    style={{
                      background: "rgba(224,82,82,0.1)",
                      border: "none",
                      borderRadius: 6,
                      padding: "5px 10px",
                      color: "#e05252",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "var(--font-instrument-sans)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}

              {form.segment_filters.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "hsl(0,0%,40%)",
                    fontFamily: "var(--font-instrument-sans)",
                  }}
                >
                  No segment filters — rule applies to all entities.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={cancelForm}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  color: "hsl(0,0%,70%)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: submitting ? "rgba(55,98,227,0.5)" : "#3762e3",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 20px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#fff",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Saving..." : editingId ? "Save Changes" : "Add Rule"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <th style={TH_STYLE}>Name</th>
            <th style={TH_STYLE}>Trigger</th>
            <th style={TH_STYLE}>Offset Days</th>
            <th style={TH_STYLE}>Template</th>
            <th style={TH_STYLE}>Active</th>
            <th style={TH_STYLE}>Last Run</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: 32,
                  textAlign: "center",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  color: "hsl(0,0%,40%)",
                }}
              >
                No automation rules yet. Add your first rule to automate task creation.
              </td>
            </tr>
          ) : (
            rules.map((rule) => {
              const triggerLabel =
                TRIGGER_TYPES.find((t) => t.value === rule.trigger_type)?.label ??
                rule.trigger_type;

              return (
                <tr
                  key={rule.id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <td style={TD_STYLE}>
                    <span
                      style={{
                        fontFamily: "var(--font-lora)",
                        fontSize: 14,
                        color: "hsl(0,0%,100%)",
                      }}
                    >
                      {rule.name}
                    </span>
                  </td>
                  <td style={TD_STYLE}>
                    <span
                      style={{
                        display: "inline-block",
                        background: "rgba(55,98,227,0.15)",
                        color: "#7ba3ff",
                        borderRadius: 6,
                        padding: "2px 9px",
                        fontSize: 11,
                        fontFamily: "var(--font-instrument-sans)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {triggerLabel}
                    </span>
                  </td>
                  <td style={TD_STYLE}>
                    {rule.trigger_offset_days != null ? (
                      `${rule.trigger_offset_days}d`
                    ) : rule.recurrence_rule ? (
                      <span style={{ fontSize: 11, color: "hsl(0,0%,50%)" }}>
                        {rule.recurrence_rule}
                      </span>
                    ) : (
                      <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
                    )}
                  </td>
                  <td style={TD_STYLE}>
                    {rule.template_name ?? (
                      <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
                    )}
                  </td>
                  <td style={TD_STYLE}>
                    <span
                      style={{
                        display: "inline-block",
                        background: rule.is_active
                          ? "rgba(13,61,42,0.8)"
                          : "rgba(30,30,30,0.8)",
                        color: rule.is_active ? "#4caf7d" : "hsl(0,0%,40%)",
                        borderRadius: 6,
                        padding: "2px 9px",
                        fontSize: 12,
                        fontFamily: "var(--font-instrument-sans)",
                      }}
                    >
                      {rule.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={TD_STYLE}>
                    <span style={{ fontSize: 12, color: "hsl(0,0%,50%)" }}>
                      {formatLastRun(rule.last_run_at)}
                    </span>
                  </td>
                  <td style={TD_STYLE}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEdit(rule)}
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "none",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontFamily: "var(--font-instrument-sans)",
                          fontSize: 12,
                          color: "hsl(0,0%,70%)",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        style={{
                          background: "rgba(224,82,82,0.1)",
                          border: "none",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontFamily: "var(--font-instrument-sans)",
                          fontSize: 12,
                          color: "#e05252",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
