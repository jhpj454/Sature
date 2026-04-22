"use client";

import { useState } from "react";
import type { Task } from "../page";
import { CustomerSearch } from "@/app/crm/_components/CustomerSearch";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,90%)",
  outline: "none",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 12,
  color: "hsl(0,0%,50%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

export function CreateTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          assigned_to_user_id: assignedToUserId.trim() || null,
          linked_entity_type: linkedAccountId ? "account" : null,
          linked_entity_id: linkedAccountId || null,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Unable to create task.");
        return;
      }

      onCreated(json.data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "rgba(20,24,36,0.98)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 20,
          padding: 32,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
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
              fontSize: 22,
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            New Task
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "hsl(0,0%,50%)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(61,13,13,0.7)",
              border: "1px solid rgba(224,82,82,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#e05252",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={LABEL_STYLE}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              style={{
                ...INPUT_STYLE,
                resize: "vertical",
                minHeight: 72,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
            <div>
              <label style={LABEL_STYLE}>Assignee User ID</label>
              <input
                type="text"
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                placeholder="UUID of user"
                style={INPUT_STYLE}
              />
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Link to Customer (optional)</label>
            <CustomerSearch
              value={linkedAccountId}
              onChange={setLinkedAccountId}
              inputStyle={INPUT_STYLE}
              placeholder="Search customer name…"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                color: "hsl(0,0%,70%)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              style={{
                background: submitting ? "rgba(55,98,227,0.5)" : "#3762e3",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
