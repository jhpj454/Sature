"use client";

import { useState } from "react";
import { formatDate, formatDateTime, formatCurrency } from "@/app/ams/_lib/format";
import type { AccountDetail, Contact, Policy, Task } from "./page";

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

const POLICY_STATUS_STYLES: Record<string, { background: string; color: string }> = {
  active: { background: "#0d3d2a", color: "#4caf7d" },
  quoted: { background: "#1a3a6b", color: "#5a9ff5" },
  pending: { background: "#3d2e00", color: "#f5c542" },
  expired: { background: "#1e1e1e", color: "hsl(0,0%,50%)" },
  canceled: { background: "#3d0d0d", color: "#e05252" },
};

type TabId = "overview" | "contacts" | "policies" | "tasks";

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: TabId;
  label: string;
  active: boolean;
  onClick: (id: TabId) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        background: active ? "rgba(55,98,227,0.2)" : "transparent",
        border: active ? "1px solid rgba(55,98,227,0.4)" : "1px solid transparent",
        borderRadius: 8,
        padding: "8px 20px",
        fontFamily: "var(--font-instrument-sans)",
        fontSize: 14,
        fontWeight: 500,
        color: active ? "#5a9ff5" : "hsl(0,0%,60%)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(30,35,50,0.70)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "14px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        gap: 16,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-instrument-sans)",
          fontSize: 12,
          color: "hsl(0,0%,50%)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          minWidth: 160,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-instrument-sans)",
          fontSize: 14,
          color: "hsl(0,0%,80%)",
        }}
      >
        {value ?? <span style={{ color: "hsl(0,0%,40%)" }}>—</span>}
      </span>
    </div>
  );
}

function CreateTaskModal({
  accountId,
  accountName,
  onClose,
  onCreated,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [form, setForm] = useState({ title: "", description: "", due_date: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          due_date: form.due_date || null,
          linked_entity_type: "account",
          linked_entity_id: accountId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to create task.");
        return;
      }
      onCreated(data.data);
      onClose();
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
          background: "rgb(18,22,34)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 28,
          width: 440,
          maxWidth: "90vw",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: 20,
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            Create Task
          </h2>
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              color: "hsl(0,0%,50%)",
              margin: "6px 0 0",
            }}
          >
            For: {accountName}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 12,
                color: "hsl(0,0%,50%)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Title *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Task title"
              style={{
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
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 12,
                color: "hsl(0,0%,50%)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              rows={3}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "hsl(0,0%,90%)",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 12,
                color: "hsl(0,0%,50%)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Due Date
            </label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              style={{
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
                colorScheme: "dark",
              }}
            />
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
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "hsl(0,0%,80%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "#3762e3",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
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

export function CustomerDetailClient({
  account,
  contacts,
  policies,
  tasks: initialTasks,
}: {
  account: AccountDetail;
  contacts: Contact[];
  policies: Policy[];
  tasks: Task[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  async function handleCompleteTask(taskId: string) {
    setCompletingTaskId(taskId);
    try {
      const res = await fetch(`/api/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json();
      if (data.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "completed" } : t)),
        );
      }
    } catch {
      // silently fail
    } finally {
      setCompletingTaskId(null);
    }
  }

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TabButton id="overview" label="Overview" active={activeTab === "overview"} onClick={setActiveTab} />
        <TabButton
          id="contacts"
          label={`Contacts${contacts.length > 0 ? ` (${contacts.length})` : ""}`}
          active={activeTab === "contacts"}
          onClick={setActiveTab}
        />
        <TabButton
          id="policies"
          label={`Policies${policies.length > 0 ? ` (${policies.length})` : ""}`}
          active={activeTab === "policies"}
          onClick={setActiveTab}
        />
        <TabButton
          id="tasks"
          label={`Tasks${tasks.length > 0 ? ` (${tasks.length})` : ""}`}
          active={activeTab === "tasks"}
          onClick={setActiveTab}
        />
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <Card>
          <InfoRow label="Account Name" value={account.account_name} />
          <InfoRow label="Type" value={
            <span
              style={{
                display: "inline-block",
                background: account.account_type === "commercial" ? "#1a3a6b" : "#0d3d2a",
                color: account.account_type === "commercial" ? "#5a9ff5" : "#4caf7d",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {account.account_type}
            </span>
          } />
          <InfoRow label="Status" value={
            <span
              style={{
                display: "inline-block",
                background:
                  account.status === "client"
                    ? "#0d3d2a"
                    : account.status === "prospect"
                    ? "#3d2e00"
                    : "#3d0d0d",
                color:
                  account.status === "client"
                    ? "#4caf7d"
                    : account.status === "prospect"
                    ? "#f5c542"
                    : "#e05252",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {account.status}
            </span>
          } />
          <InfoRow label="Industry Segment" value={account.industry_segment} />
          <InfoRow label="Assigned Producer" value={account.producer_display_name} />
          <InfoRow label="Assigned CSR" value={account.csr_display_name} />
          <InfoRow label="Created" value={formatDateTime(account.created_at)} />
          <InfoRow label="Last Updated" value={formatDateTime(account.updated_at)} />
          {account.notes && (
            <div style={{ padding: "14px 20px" }}>
              <div
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 12,
                  color: "hsl(0,0%,50%)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                Notes
              </div>
              <div
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  color: "hsl(0,0%,75%)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {account.notes}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Contacts tab */}
      {activeTab === "contacts" && (
        <Card>
          {contacts.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                color: "hsl(0,0%,50%)",
              }}
            >
              No contacts on this account.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={TH_STYLE}>Name</th>
                  <th style={TH_STYLE}>Email</th>
                  <th style={TH_STYLE}>Phone</th>
                  <th style={TH_STYLE}>Type</th>
                  <th style={TH_STYLE}>Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
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
                        {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || (
                          <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                        )}
                      </span>
                    </td>
                    <td style={TD_STYLE}>
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          style={{ color: "#5a9ff5", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contact.email}
                        </a>
                      ) : (
                        <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                      )}
                    </td>
                    <td style={TD_STYLE}>
                      {contact.phone ?? <span style={{ color: "hsl(0,0%,50%)" }}>—</span>}
                    </td>
                    <td style={TD_STYLE}>
                      <span
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          color: "hsl(0,0%,70%)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                          textTransform: "capitalize",
                        }}
                      >
                        {contact.contact_type}
                      </span>
                    </td>
                    <td style={TD_STYLE}>
                      <span style={{ fontSize: 12, color: "hsl(0,0%,60%)", textTransform: "capitalize" }}>
                        {contact.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Policies tab */}
      {activeTab === "policies" && (
        <Card>
          {policies.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                color: "hsl(0,0%,50%)",
              }}
            >
              No policies on this account.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={TH_STYLE}>Policy Number</th>
                  <th style={TH_STYLE}>LOB</th>
                  <th style={TH_STYLE}>Status</th>
                  <th style={TH_STYLE}>Expiration</th>
                  <th style={TH_STYLE}>Premium</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => {
                  const statusStyle =
                    POLICY_STATUS_STYLES[policy.status] ?? {
                      background: "#1e1e1e",
                      color: "hsl(0,0%,50%)",
                    };
                  return (
                    <tr
                      key={policy.id}
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
                          {policy.policy_number ?? (
                            <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                          )}
                        </span>
                      </td>
                      <td style={TD_STYLE}>
                        {policy.lob ? (
                          <span
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              color: "hsl(0,0%,70%)",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 12,
                            }}
                          >
                            {policy.lob}
                          </span>
                        ) : (
                          <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                        )}
                      </td>
                      <td style={TD_STYLE}>
                        <span
                          style={{
                            display: "inline-block",
                            background: statusStyle.background,
                            color: statusStyle.color,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 12,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        >
                          {policy.status}
                        </span>
                      </td>
                      <td style={TD_STYLE}>
                        {policy.expiration_date ? (
                          <span style={{ fontSize: 13 }}>{formatDate(policy.expiration_date)}</span>
                        ) : (
                          <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                        )}
                      </td>
                      <td style={TD_STYLE}>
                        {policy.premium_amount != null ? (
                          formatCurrency(policy.premium_amount)
                        ) : (
                          <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Tasks tab */}
      {activeTab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowTaskModal(true)}
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
              + Create Task
            </button>
          </div>

          <Card>
            {tasks.length === 0 ? (
              <div
                style={{
                  padding: 48,
                  textAlign: "center",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  color: "hsl(0,0%,50%)",
                }}
              >
                No tasks on this account.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
                      padding: "14px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      opacity: task.status === "completed" ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={task.status === "completed"}
                      disabled={task.status === "completed" || completingTaskId === task.id}
                      onChange={() => {
                        if (task.status !== "completed") {
                          handleCompleteTask(task.id);
                        }
                      }}
                      style={{
                        marginTop: 2,
                        width: 16,
                        height: 16,
                        cursor: task.status === "completed" ? "default" : "pointer",
                        accentColor: "#3762e3",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-instrument-sans)",
                          fontSize: 14,
                          color: "hsl(0,0%,90%)",
                          textDecoration:
                            task.status === "completed" ? "line-through" : "none",
                        }}
                      >
                        {task.title}
                      </div>
                      {task.description && (
                        <div
                          style={{
                            fontFamily: "var(--font-instrument-sans)",
                            fontSize: 13,
                            color: "hsl(0,0%,55%)",
                            marginTop: 4,
                          }}
                        >
                          {task.description}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          marginTop: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {task.due_date && (
                          <span
                            style={{
                              fontFamily: "var(--font-instrument-sans)",
                              fontSize: 12,
                              color: "hsl(0,0%,50%)",
                            }}
                          >
                            Due: {formatDate(task.due_date)}
                          </span>
                        )}
                        {task.assigned_to_display_name && (
                          <span
                            style={{
                              fontFamily: "var(--font-instrument-sans)",
                              fontSize: 12,
                              color: "hsl(0,0%,50%)",
                            }}
                          >
                            Assigned: {task.assigned_to_display_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 12,
                        color:
                          task.status === "completed" ? "#4caf7d" : "hsl(0,0%,40%)",
                        textTransform: "capitalize",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Create Task Modal */}
      {showTaskModal && (
        <CreateTaskModal
          accountId={account.id}
          accountName={account.account_name}
          onClose={() => setShowTaskModal(false)}
          onCreated={(task) => setTasks((prev) => [task, ...prev])}
        />
      )}
    </>
  );
}
