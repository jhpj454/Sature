"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../page";

type Props = {
  task: Task;
  onClose: () => void;
  onSaved: (updated: Task) => void;
  onDeleted: (taskId: string) => void;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 12,
  color: "hsl(0,0%,50%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "hsl(0,0%,90%)",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

export function EditTaskModal({ task, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save task.");
        return;
      }
      onSaved({ ...task, ...json.data });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? "Failed to delete task.");
        return;
      }
      onDeleted(task.id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const modal = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "rgba(37,37,40,0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 16,
          padding: 28,
          width: 480,
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: 20,
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            Edit Task
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "hsl(0,0%,50%)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={LABEL_STYLE}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={INPUT_STYLE}
              placeholder="Task title"
              autoFocus
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...INPUT_STYLE, resize: "vertical" }}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                ...INPUT_STYLE,
                colorScheme: "dark",
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              color: "#e05252",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          {/* Delete on left */}
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#e05252",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              padding: "10px 20px",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              cursor: deleting || saving ? "not-allowed" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>

          {/* Cancel + Save on right */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "hsl(0,0%,80%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                cursor: saving || deleting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting || !title.trim()}
              style={{
                background: "#3762e3",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: saving || deleting || !title.trim() ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
