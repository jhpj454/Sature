"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatCurrency } from "@/app/ams/_lib/format";
import type { Customer } from "../page";

const ACCOUNT_TYPE_STYLES: Record<string, { background: string; color: string }> = {
  commercial: { background: "#1a3a6b", color: "#5a9ff5" },
  personal: { background: "#0d3d2a", color: "#4caf7d" },
};

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  prospect: { background: "#3d2e00", color: "#f5c542" },
  client: { background: "#0d3d2a", color: "#4caf7d" },
  lost: { background: "#3d0d0d", color: "#e05252" },
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

type TaskModalState = {
  open: boolean;
  accountId: string | null;
  accountName: string | null;
};

type TaskFormData = {
  title: string;
  description: string;
  due_date: string;
};

function TypeBadge({ type }: { type: string }) {
  const style = ACCOUNT_TYPE_STYLES[type] ?? { background: "#1a1a2e", color: "#7070a0" };
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
      {type}
    </span>
  );
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

function CreateTaskModal({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TaskFormData>({
    title: "",
    description: "",
    due_date: "",
  });
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
          {accountName && (
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
          )}
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

export function CustomersTable({ customers: initialCustomers }: { customers: Customer[] }) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [accountType, setAccountType] = useState("");
  const [hasActivePolicies, setHasActivePolicies] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskModal, setTaskModal] = useState<TaskModalState>({
    open: false,
    accountId: null,
    accountName: null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCustomers = useCallback(
    async (q: string, type: string, policies: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page_size: "100" });
        if (q) params.set("q", q);
        if (type) params.set("account_type", type);
        if (policies) params.set("has_active_policies", policies);
        const res = await fetch(`/api/crm/customers?${params.toString()}`);
        const data = await res.json();
        if (data.ok) {
          setCustomers(data.data);
        }
      } catch {
        // silently fail — keep existing data
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCustomers(search, accountType, hasActivePolicies);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, accountType, hasActivePolicies, fetchCustomers]);

  return (
    <>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 0 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers..."
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px 16px",
            color: "hsl(0,0%,90%)",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            outline: "none",
            minWidth: 240,
          }}
        />

        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px 16px",
            color: accountType ? "hsl(0,0%,90%)" : "hsl(0,0%,50%)",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">All Types</option>
          <option value="commercial">Commercial</option>
          <option value="personal">Personal</option>
        </select>

        <select
          value={hasActivePolicies}
          onChange={(e) => setHasActivePolicies(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px 16px",
            color: hasActivePolicies ? "hsl(0,0%,90%)" : "hsl(0,0%,50%)",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">All Customers</option>
          <option value="true">With Active Policies</option>
          <option value="false">No Active Policies</option>
        </select>

        {loading && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 13,
              color: "hsl(0,0%,50%)",
            }}
          >
            Loading...
          </span>
        )}
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
        {customers.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              color: "hsl(0,0%,50%)",
            }}
          >
            No customers found.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={TH_STYLE}>Name</th>
                <th style={TH_STYLE}>Type</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Primary Contact</th>
                <th style={TH_STYLE}>Active Policies</th>
                <th style={TH_STYLE}>Next Renewal</th>
                <th style={TH_STYLE}>Producer</th>
                <th style={{ ...TH_STYLE, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => router.push(`/crm/customers/${customer.id}`)}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "rgba(255,255,255,0.04)";
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
                      {customer.account_name}
                    </span>
                  </td>

                  {/* Type */}
                  <td style={TD_STYLE}>
                    <TypeBadge type={customer.account_type} />
                  </td>

                  {/* Status */}
                  <td style={TD_STYLE}>
                    <StatusBadge status={customer.status} />
                  </td>

                  {/* Primary Contact */}
                  <td style={TD_STYLE}>
                    {customer.primary_contact_first_name || customer.primary_contact_last_name ? (
                      <div>
                        <div style={{ color: "hsl(0,0%,80%)" }}>
                          {[customer.primary_contact_first_name, customer.primary_contact_last_name]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                        {customer.primary_contact_email && (
                          <div style={{ fontSize: 12, color: "hsl(0,0%,50%)" }}>
                            {customer.primary_contact_email}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                    )}
                  </td>

                  {/* Active Policies */}
                  <td style={TD_STYLE}>
                    <span
                      style={{
                        display: "inline-block",
                        background:
                          Number(customer.active_policy_count) > 0
                            ? "rgba(76,175,125,0.15)"
                            : "rgba(255,255,255,0.06)",
                        color:
                          Number(customer.active_policy_count) > 0
                            ? "#4caf7d"
                            : "hsl(0,0%,50%)",
                        borderRadius: 6,
                        padding: "2px 9px",
                        fontSize: 12,
                        fontFamily: "var(--font-instrument-sans)",
                        fontWeight: 500,
                      }}
                    >
                      {customer.active_policy_count}
                    </span>
                  </td>

                  {/* Next Renewal */}
                  <td style={TD_STYLE}>
                    {customer.next_renewal_date ? (
                      <span
                        style={{
                          fontSize: 13,
                          color: "hsl(0,0%,70%)",
                        }}
                      >
                        {formatDate(customer.next_renewal_date)}
                      </span>
                    ) : (
                      <span style={{ color: "hsl(0,0%,50%)" }}>—</span>
                    )}
                  </td>

                  {/* Producer */}
                  <td style={TD_STYLE}>
                    {customer.producer_display_name ?? (
                      <span style={{ color: "hsl(0,0%,50%)" }}>Unassigned</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ ...TD_STYLE, textAlign: "right" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaskModal({
                          open: true,
                          accountId: customer.id,
                          accountName: customer.account_name,
                        });
                      }}
                      style={{
                        background: "rgba(55,98,227,0.15)",
                        color: "#5a9ff5",
                        border: "1px solid rgba(55,98,227,0.3)",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + Task
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Task Create Modal */}
      {taskModal.open && taskModal.accountId && (
        <CreateTaskModal
          accountId={taskModal.accountId}
          accountName={taskModal.accountName}
          onClose={() => setTaskModal({ open: false, accountId: null, accountName: null })}
        />
      )}
    </>
  );
}
