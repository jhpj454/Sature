"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatCurrency } from "@/app/ams/_lib/format";

export type PolicyLimit = {
  id: string;
  limit_type: string;
  limit_amount: string | number;
  applies_to: string | null;
};

type FormState = {
  limit_type: string;
  limit_amount: string;
  applies_to: string;
};

const DEFAULT_FORM: FormState = {
  limit_type: "",
  limit_amount: "",
  applies_to: "",
};

function limitToForm(item: PolicyLimit): FormState {
  return {
    limit_type: item.limit_type,
    limit_amount: String(item.limit_amount),
    applies_to: item.applies_to ?? "",
  };
}

const SUGGESTED_LIMIT_TYPES = [
  "per_occurrence",
  "general_aggregate",
  "products_completed_ops",
  "personal_advertising_injury",
  "damage_rented_premises",
  "medical_expense",
  "each_occurrence",
  "csl",
];

type ModalState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; item: PolicyLimit };

export function LimitsPanel({
  initialData,
  policyId,
}: {
  initialData: PolicyLimit[];
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

  function openEdit(item: PolicyLimit) {
    setForm(limitToForm(item));
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
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      limit_type: form.limit_type,
      limit_amount: Number(form.limit_amount),
      applies_to: form.applies_to || null,
    };

    try {
      if (modal.mode === "create") {
        await apiFetch(`/api/policies/${policyId}/limits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (modal.mode === "edit") {
        await apiFetch(`/api/policies/${policyId}/limits/${modal.item.id}`, {
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
      await apiFetch(`/api/policies/${policyId}/limits/${itemId}`, { method: "DELETE" });
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
        <h2 className="font-medium">Coverage Limits</h2>
        <Button onClick={openCreate} size="sm">
          Add Limit
        </Button>
      </div>

      {error && modal.mode === "closed" ? (
        <p className="text-sm text-rose-500">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200/30 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-white/30 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Limit Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Applies To</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={4}>
                  No limits recorded.
                </td>
              </tr>
            ) : (
              initialData.map((item) => (
                <tr className="border-t border-slate-200/30" key={item.id}>
                  <td className="px-3 py-2 font-medium">{item.limit_type}</td>
                  <td className="px-3 py-2">{formatCurrency(item.limit_amount)}</td>
                  <td className="px-3 py-2 text-slate-500">{item.applies_to ?? "-"}</td>
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
                        className="text-xs text-rose-500 hover:underline disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200/30 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                {modal.mode === "create" ? "Add Limit" : "Edit Limit"}
              </h3>
              <Button onClick={close} size="sm" type="button" variant="outline">
                Close
              </Button>
            </div>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Limit Type</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-300/40 bg-white px-3 text-sm"
                  list="limit-type-suggestions"
                  placeholder="per_occurrence"
                  required
                  {...field("limit_type")}
                />
                <datalist id="limit-type-suggestions">
                  {SUGGESTED_LIMIT_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Limit Amount</span>
                <Input min="0" placeholder="1000000" required step="0.01" type="number" {...field("limit_amount")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Applies To</span>
                <Input placeholder="Bodily injury and property damage" {...field("applies_to")} />
              </label>
              {error ? <p className="text-sm text-rose-500">{error}</p> : null}
              <div className="flex gap-2">
                <Button disabled={saving} type="submit">
                  {saving ? "Saving…" : modal.mode === "create" ? "Add Limit" : "Save Changes"}
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
