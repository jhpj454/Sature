"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatCurrency } from "@/app/ams/_lib/format";

const SCHEDULE_TYPES = [
  { value: "vehicle", label: "Vehicle" },
  { value: "location", label: "Location" },
  { value: "equipment", label: "Equipment" },
  { value: "employee", label: "Employee" },
] as const;

const SCHEDULE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  SCHEDULE_TYPES.map(({ value, label }) => [value, label]),
);

const IDENTIFIER_PLACEHOLDER: Record<string, string> = {
  vehicle: "VIN: 1HGBH41JXMN109186",
  location: "123 Main St, Springfield, IL 62701",
  equipment: "Serial: SN-12345",
  employee: "EMP-001",
};

export type PolicyScheduleItem = {
  id: string;
  schedule_type: string;
  description: string;
  value: string | number | null;
  identifier: string | null;
};

type FormState = {
  schedule_type: string;
  description: string;
  value: string;
  identifier: string;
};

const DEFAULT_FORM: FormState = {
  schedule_type: "vehicle",
  description: "",
  value: "",
  identifier: "",
};

function itemToForm(item: PolicyScheduleItem): FormState {
  return {
    schedule_type: item.schedule_type,
    description: item.description,
    value: item.value != null ? String(item.value) : "",
    identifier: item.identifier ?? "",
  };
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: PolicyScheduleItem };

export function ScheduleItemsPanel({
  initialData,
  policyId,
}: {
  initialData: PolicyScheduleItem[];
  policyId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setForm(DEFAULT_FORM);
    setError(null);
    setModal({ mode: "create" });
  }

  function openEdit(item: PolicyScheduleItem) {
    setForm(itemToForm(item));
    setError(null);
    setModal({ mode: "edit", item });
  }

  function close() {
    setModal({ mode: "closed" });
    setError(null);
  }

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      schedule_type: form.schedule_type,
      description: form.description,
      value: form.value ? Number(form.value) : null,
      identifier: form.identifier || null,
    };

    try {
      if (modal.mode === "create") {
        await apiFetch(`/api/policies/${policyId}/schedule-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (modal.mode === "edit") {
        await apiFetch(`/api/policies/${policyId}/schedule-items/${modal.item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId: string) {
    setDeletingId(itemId);
    try {
      await apiFetch(`/api/policies/${policyId}/schedule-items/${itemId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Schedule Items</h2>
        <Button onClick={openCreate} size="sm">
          Add Item
        </Button>
      </div>

      {error && modal.mode === "closed" ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Identifier</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={5}>
                  No schedule items recorded.
                </td>
              </tr>
            ) : (
              initialData.map((item) => (
                <tr className="border-t border-zinc-200" key={item.id}>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      {SCHEDULE_TYPE_LABEL[item.schedule_type] ?? item.schedule_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{item.description}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                    {item.identifier ?? "-"}
                  </td>
                  <td className="px-3 py-2">{item.value != null ? formatCurrency(item.value) : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-blue-700 hover:underline"
                        onClick={() => openEdit(item)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item.id)}
                        type="button"
                      >
                        {deletingId === item.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal.mode !== "closed" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900">
                {modal.mode === "create" ? "Add Schedule Item" : "Edit Schedule Item"}
              </h3>
              <Button onClick={close} size="sm" type="button" variant="outline">
                Close
              </Button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Schedule Type</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  required
                  {...field("schedule_type")}
                >
                  {SCHEDULE_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Description</span>
                <Input placeholder="2022 Ford F-150 — Company truck" required {...field("description")} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Identifier</span>
                <Input
                  placeholder={IDENTIFIER_PLACEHOLDER[form.schedule_type] ?? "Identifier"}
                  {...field("identifier")}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Insured Value</span>
                <Input min="0" placeholder="50000" step="0.01" type="number" {...field("value")} />
              </label>
              {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}
              <div className="flex gap-2 md:col-span-2">
                <Button disabled={saving} type="submit">
                  {saving ? "Saving…" : modal.mode === "create" ? "Add Item" : "Save Changes"}
                </Button>
                <Button onClick={close} type="button" variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
