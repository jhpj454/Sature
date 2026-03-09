"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatDate } from "@/app/ams/_lib/format";

const ENDORSEMENT_TYPES = [
  { value: "addition", label: "Addition" },
  { value: "removal", label: "Removal" },
  { value: "change", label: "Change" },
] as const;

const ENDORSEMENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ENDORSEMENT_TYPES.map(({ value, label }) => [value, label]),
);

export type PolicyEndorsement = {
  id: string;
  endorsement_number: string | null;
  effective_date: string;
  endorsement_type: string;
  description: string | null;
  premium_change: string | number | null;
};

type FormState = {
  endorsement_number: string;
  effective_date: string;
  endorsement_type: string;
  description: string;
  premium_change: string;
};

const DEFAULT_FORM: FormState = {
  endorsement_number: "",
  effective_date: "",
  endorsement_type: "change",
  description: "",
  premium_change: "",
};

function endorsementToForm(item: PolicyEndorsement): FormState {
  return {
    endorsement_number: item.endorsement_number ?? "",
    effective_date: item.effective_date,
    endorsement_type: item.endorsement_type,
    description: item.description ?? "",
    premium_change: item.premium_change != null ? String(item.premium_change) : "",
  };
}

function formatPremiumChange(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  const abs = Math.abs(numeric).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  if (numeric > 0) return <span className="text-emerald-700">+{abs}</span>;
  if (numeric < 0) return <span className="text-rose-600">-{abs}</span>;
  return abs;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: PolicyEndorsement };

export function EndorsementsPanel({
  initialData,
  policyId,
}: {
  initialData: PolicyEndorsement[];
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

  function openEdit(item: PolicyEndorsement) {
    setForm(endorsementToForm(item));
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
      endorsement_number: form.endorsement_number || null,
      effective_date: form.effective_date,
      endorsement_type: form.endorsement_type,
      description: form.description || null,
      premium_change: form.premium_change ? Number(form.premium_change) : null,
    };

    try {
      if (modal.mode === "create") {
        await apiFetch(`/api/policies/${policyId}/endorsements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (modal.mode === "edit") {
        await apiFetch(`/api/policies/${policyId}/endorsements/${modal.item.id}`, {
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
      await apiFetch(`/api/policies/${policyId}/endorsements/${itemId}`, { method: "DELETE" });
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
        <h2 className="font-medium">Endorsements</h2>
        <Button onClick={openCreate} size="sm">
          Add Endorsement
        </Button>
      </div>

      {error && modal.mode === "closed" ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">Endorsement #</th>
              <th className="px-3 py-2">Effective</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Premium Change</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={6}>
                  No endorsements recorded.
                </td>
              </tr>
            ) : (
              initialData.map((item) => (
                <tr className="border-t border-zinc-200" key={item.id}>
                  <td className="px-3 py-2 font-medium">
                    {item.endorsement_number ?? "-"}
                  </td>
                  <td className="px-3 py-2">{formatDate(item.effective_date)}</td>
                  <td className="px-3 py-2">
                    {ENDORSEMENT_TYPE_LABEL[item.endorsement_type] ?? item.endorsement_type}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{item.description ?? "-"}</td>
                  <td className="px-3 py-2">{formatPremiumChange(item.premium_change)}</td>
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
                {modal.mode === "create" ? "Add Endorsement" : "Edit Endorsement"}
              </h3>
              <Button onClick={close} size="sm" type="button" variant="outline">
                Close
              </Button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Endorsement Number</span>
                <Input placeholder="END-001" {...field("endorsement_number")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Effective Date</span>
                <Input required type="date" {...field("effective_date")} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Endorsement Type</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  required
                  {...field("endorsement_type")}
                >
                  {ENDORSEMENT_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Description</span>
                <Input placeholder="Add additional insured — landlord" {...field("description")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">
                  Premium Change{" "}
                  <span className="text-zinc-400">(positive = additional, negative = return)</span>
                </span>
                <Input placeholder="250.00" step="0.01" type="number" {...field("premium_change")} />
              </label>
              {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}
              <div className="flex gap-2 md:col-span-2">
                <Button disabled={saving} type="submit">
                  {saving
                    ? "Saving…"
                    : modal.mode === "create"
                      ? "Add Endorsement"
                      : "Save Changes"}
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
