"use client";

import { useState } from "react";
import type { TaskTemplate } from "../page";

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

const ASSIGNEE_ROLES = [
  { value: "", label: "None" },
  { value: "producer", label: "Producer" },
  { value: "csr", label: "CSR" },
  { value: "marketing", label: "Marketing" },
  { value: "admin", label: "Admin" },
];

type FormState = {
  name: string;
  description: string;
  default_offset_days: string;
  default_assignee_role: string;
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  default_offset_days: "",
  default_assignee_role: "",
});

function templateFromForm(form: FormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    default_offset_days: form.default_offset_days !== "" ? Number(form.default_offset_days) : null,
    default_assignee_role: form.default_assignee_role || null,
  };
}

export function TemplatesManager({
  templates,
  onTemplatesChange,
}: {
  templates: TaskTemplate[];
  onTemplatesChange: (templates: TaskTemplate[]) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowAddForm(true);
    setError(null);
  }

  function startEdit(template: TaskTemplate) {
    setForm({
      name: template.name,
      description: template.description ?? "",
      default_offset_days: template.default_offset_days != null ? String(template.default_offset_days) : "",
      default_assignee_role: template.default_assignee_role ?? "",
    });
    setEditingId(template.id);
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
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      if (editingId) {
        const res = await fetch(`/api/crm/task-templates/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateFromForm(form)),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Unable to update template.");
          return;
        }
        onTemplatesChange(templates.map((t) => (t.id === editingId ? json.data : t)));
      } else {
        const res = await fetch("/api/crm/task-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateFromForm(form)),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Unable to create template.");
          return;
        }
        onTemplatesChange([...templates, json.data]);
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
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/crm/task-templates/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        onTemplatesChange(templates.filter((t) => t.id !== id));
      }
    } catch {
      // silently fail
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
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
          + Add Template
        </button>
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
            {editingId ? "Edit Template" : "New Template"}
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
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 12 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "hsl(0,0%,50%)",
                    fontFamily: "var(--font-instrument-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Template name"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "hsl(0,0%,50%)",
                    fontFamily: "var(--font-instrument-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Description
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "hsl(0,0%,50%)",
                    fontFamily: "var(--font-instrument-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Offset Days
                </label>
                <input
                  type="number"
                  value={form.default_offset_days}
                  onChange={(e) => setForm({ ...form, default_offset_days: e.target.value })}
                  placeholder="0"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "hsl(0,0%,50%)",
                    fontFamily: "var(--font-instrument-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Assignee Role
                </label>
                <select
                  value={form.default_assignee_role}
                  onChange={(e) => setForm({ ...form, default_assignee_role: e.target.value })}
                  style={{
                    ...INPUT_STYLE,
                    cursor: "pointer",
                  }}
                >
                  {ASSIGNEE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
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
                {submitting ? "Saving..." : editingId ? "Save Changes" : "Add Template"}
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
            <th style={TH_STYLE}>Description</th>
            <th style={TH_STYLE}>Offset Days</th>
            <th style={TH_STYLE}>Assignee Role</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: 32,
                  textAlign: "center",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  color: "hsl(0,0%,40%)",
                }}
              >
                No templates yet. Add your first task template.
              </td>
            </tr>
          ) : (
            templates.map((template) => (
              <tr
                key={template.id}
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
                    {template.name}
                  </span>
                </td>
                <td style={TD_STYLE}>
                  {template.description ?? (
                    <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
                  )}
                </td>
                <td style={TD_STYLE}>
                  {template.default_offset_days != null ? (
                    `${template.default_offset_days}d`
                  ) : (
                    <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
                  )}
                </td>
                <td style={TD_STYLE}>
                  {template.default_assignee_role ? (
                    <span
                      style={{
                        display: "inline-block",
                        background: "rgba(255,255,255,0.06)",
                        color: "hsl(0,0%,70%)",
                        borderRadius: 6,
                        padding: "2px 9px",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {template.default_assignee_role}
                    </span>
                  ) : (
                    <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
                  )}
                </td>
                <td style={TD_STYLE}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => startEdit(template)}
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
                      onClick={() => handleDelete(template.id)}
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
