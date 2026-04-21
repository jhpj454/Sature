"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import type { CalendarEvent } from "./CalendarClient";

type Category = "meeting" | "call" | "personal" | "renewal" | "task" | "other";
type RecurrencePreset = "none" | "daily" | "weekly" | "monthly" | "custom";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "personal", label: "Personal" },
  { value: "renewal", label: "Renewal" },
  { value: "task", label: "Task" },
  { value: "other", label: "Other" },
];

const RECURRENCE_PRESETS: { value: RecurrencePreset; label: string; rrule: string | null }[] = [
  { value: "none", label: "None", rrule: null },
  { value: "daily", label: "Daily", rrule: "FREQ=DAILY" },
  { value: "weekly", label: "Weekly", rrule: "FREQ=WEEKLY" },
  { value: "monthly", label: "Monthly", rrule: "FREQ=MONTHLY" },
  { value: "custom", label: "Custom RRULE…", rrule: null },
];

const OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  backdropFilter: "blur(4px)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const MODAL: React.CSSProperties = {
  background: "hsl(226,25%,12%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  width: "100%",
  maxWidth: 520,
  padding: "28px 28px 24px",
  boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 12,
  fontWeight: 500,
  color: "hsl(0,0%,60%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "9px 12px",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,90%)",
  outline: "none",
  boxSizing: "border-box",
};

const SELECT: React.CSSProperties = {
  ...INPUT,
  cursor: "pointer",
};

const FIELD_GAP: React.CSSProperties = {
  marginBottom: 16,
};

function toDatetimeLocal(isoStr: string): string {
  // Convert ISO string to "YYYY-MM-DDTHH:mm" for datetime-local input
  try {
    const d = new Date(isoStr);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function toDateInput(isoStr: string): string {
  try {
    return new Date(isoStr).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function CreateEventModal({
  mode,
  event,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  defaultDate?: Date;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const isEdit = mode === "edit" && event != null;

  // Default start: defaultDate at 9:00 AM, or now
  const defaultStartDate = defaultDate ?? new Date();
  const defaultStart = new Date(
    defaultStartDate.getFullYear(),
    defaultStartDate.getMonth(),
    defaultStartDate.getDate(),
    9,
    0,
    0,
  );

  const [summary, setSummary] = useState(isEdit ? (event!.title ?? "") : "");
  const [category, setCategory] = useState<Category>(
    isEdit ? ((event!.category as Category) ?? "meeting") : "meeting",
  );
  const [startDatetime, setStartDatetime] = useState(
    isEdit ? toDatetimeLocal(event!.start_at) : toDatetimeLocal(defaultStart.toISOString()),
  );
  const [endDatetime, setEndDatetime] = useState(
    isEdit && event!.end_at ? toDatetimeLocal(event!.end_at) : "",
  );
  const [allDay, setAllDay] = useState(isEdit ? (event!.all_day ?? false) : false);
  const [location, setLocation] = useState(isEdit ? (event!.location ?? "") : "");
  const [entityId, setEntityId] = useState(
    isEdit && event!.entity_type === "account" ? (event!.entity_id ?? "") : "",
  );

  // Recurrence
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>(() => {
    if (!isEdit || !event?.recurrence_rule) return "none";
    const rule = event.recurrence_rule;
    if (rule === "FREQ=DAILY") return "daily";
    if (rule === "FREQ=WEEKLY") return "weekly";
    if (rule === "FREQ=MONTHLY") return "monthly";
    return "custom";
  });
  const [customRrule, setCustomRrule] = useState(
    isEdit && event?.recurrence_rule ? event.recurrence_rule : "",
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function buildRecurrenceRule(): string | null {
    const preset = RECURRENCE_PRESETS.find((p) => p.value === recurrencePreset);
    if (!preset || preset.value === "none") return null;
    if (preset.value === "custom") return customRrule.trim() || null;
    return preset.rrule;
  }

  async function handleSave() {
    setError(null);
    if (!summary.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      const occurred_at = allDay
        ? new Date(startDatetime + ":00").toISOString()
        : new Date(startDatetime).toISOString();

      const end_at =
        !allDay && endDatetime
          ? new Date(endDatetime).toISOString()
          : null;

      const recurrence_rule = buildRecurrenceRule();

      const payload = {
        summary: summary.trim(),
        category,
        occurred_at,
        end_at,
        all_day: allDay,
        location: location.trim() || null,
        recurrence_rule,
        entity_type: entityId ? "account" : null,
        entity_id: entityId || null,
      };

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/crm/calendar/${event!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/crm/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to save event.");
        return;
      }
      onSave();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/calendar/${event!.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to delete event.");
        return;
      }
      onDelete();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
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
              fontSize: 20,
              fontWeight: 600,
              color: "hsl(0,0%,96%)",
              margin: 0,
            }}
          >
            {isEdit ? "Edit Event" : "New Event"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "hsl(0,0%,50%)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={FIELD_GAP}>
          <label style={LABEL}>Title *</label>
          <input
            style={INPUT}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Event title"
            autoFocus
          />
        </div>

        <div style={FIELD_GAP}>
          <label style={LABEL}>Category</label>
          <select
            style={SELECT}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* All-day toggle */}
        <div style={{ ...FIELD_GAP, display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            id="allday"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#3762e3" }}
          />
          <label
            htmlFor="allday"
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              color: "hsl(0,0%,75%)",
              cursor: "pointer",
            }}
          >
            All-day event
          </label>
        </div>

        {/* Start date/time */}
        <div style={FIELD_GAP}>
          <label style={LABEL}>{allDay ? "Date" : "Start"}</label>
          {allDay ? (
            <input
              type="date"
              style={INPUT}
              value={startDatetime.slice(0, 10)}
              onChange={(e) =>
                setStartDatetime(e.target.value + "T09:00")
              }
            />
          ) : (
            <input
              type="datetime-local"
              style={INPUT}
              value={startDatetime}
              onChange={(e) => setStartDatetime(e.target.value)}
            />
          )}
        </div>

        {/* End time (hidden for all-day) */}
        {!allDay && (
          <div style={FIELD_GAP}>
            <label style={LABEL}>End (optional)</label>
            <input
              type="datetime-local"
              style={INPUT}
              value={endDatetime}
              onChange={(e) => setEndDatetime(e.target.value)}
            />
          </div>
        )}

        {/* Location */}
        <div style={FIELD_GAP}>
          <label style={LABEL}>Location (optional)</label>
          <input
            style={INPUT}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Zoom, 123 Main St"
          />
        </div>

        {/* Link to account */}
        <div style={FIELD_GAP}>
          <label style={LABEL}>Link to Account (optional — enter Account ID)</label>
          <input
            style={INPUT}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Account UUID"
          />
        </div>

        {/* Recurrence */}
        <div style={FIELD_GAP}>
          <label style={LABEL}>Recurrence</label>
          <select
            style={SELECT}
            value={recurrencePreset}
            onChange={(e) => setRecurrencePreset(e.target.value as RecurrencePreset)}
          >
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {recurrencePreset === "custom" && (
          <div style={FIELD_GAP}>
            <label style={LABEL}>Custom RRULE string</label>
            <input
              style={INPUT}
              value={customRrule}
              onChange={(e) => setCustomRrule(e.target.value)}
              placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#3d0d0d",
              color: "#e05252",
              borderRadius: 8,
              padding: "10px 14px",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 8,
            gap: 10,
          }}
        >
          {/* Delete button (edit mode only) */}
          <div>
            {isEdit && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: "none",
                  border: "1px solid rgba(224,82,82,0.4)",
                  color: "#e05252",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            )}
            {isEdit && confirmDelete && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 12,
                    color: "hsl(0,0%,55%)",
                  }}
                >
                  Confirm delete?
                </span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    background: "#3d0d0d",
                    border: "none",
                    color: "#e05252",
                    borderRadius: 8,
                    padding: "7px 14px",
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 13,
                    cursor: deleting ? "not-allowed" : "pointer",
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: "none",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "hsl(0,0%,60%)",
                    borderRadius: 8,
                    padding: "7px 14px",
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "hsl(0,0%,60%)",
                borderRadius: 8,
                padding: "9px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? "rgba(55,98,227,0.5)" : "#3762e3",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "9px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
