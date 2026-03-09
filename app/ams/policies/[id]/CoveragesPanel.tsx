"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatCurrency, formatDate } from "@/app/ams/_lib/format";

const COVERAGE_TYPES = [
  { value: "commercial_general_liability", label: "Commercial General Liability" },
  { value: "commercial_property", label: "Commercial Property" },
  { value: "business_auto", label: "Business Auto" },
  { value: "workers_comp", label: "Workers Compensation" },
  { value: "umbrella", label: "Umbrella" },
  { value: "cyber", label: "Cyber" },
  { value: "professional_liability", label: "Professional Liability" },
] as const;

const COVERAGE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  COVERAGE_TYPES.map(({ value, label }) => [value, label]),
);

const DEDUCTIBLE_TYPES = [
  { value: "flat", label: "Flat" },
  { value: "percentage", label: "Percentage" },
] as const;

export type PolicyCoverage = {
  id: string;
  coverage_type: string;
  description: string | null;
  deductible: string | number | null;
  deductible_type: string | null;
  effective_date: string | null;
  expiration_date: string | null;
};

type FormState = {
  coverage_type: string;
  description: string;
  deductible: string;
  deductible_type: string;
  effective_date: string;
  expiration_date: string;
};

const DEFAULT_FORM: FormState = {
  coverage_type: "commercial_general_liability",
  description: "",
  deductible: "",
  deductible_type: "",
  effective_date: "",
  expiration_date: "",
};

function coverageToForm(item: PolicyCoverage): FormState {
  return {
    coverage_type: item.coverage_type,
    description: item.description ?? "",
    deductible: item.deductible != null ? String(item.deductible) : "",
    deductible_type: item.deductible_type ?? "",
    effective_date: item.effective_date ?? "",
    expiration_date: item.expiration_date ?? "",
  };
}

type ModalState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; item: PolicyCoverage };

export function CoveragesPanel({
  initialData,
  policyId,
}: {
  initialData: PolicyCoverage[];
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

  function openEdit(item: PolicyCoverage) {
    setForm(coverageToForm(item));
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
      coverage_type: form.coverage_type,
      description: form.description || null,
      deductible: form.deductible ? Number(form.deductible) : null,
      deductible_type: form.deductible_type || null,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
    };

    try {
      if (modal.mode === "create") {
        await apiFetch(`/api/policies/${policyId}/coverages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (modal.mode === "edit") {
        await apiFetch(`/api/policies/${policyId}/coverages/${modal.item.id}`, {
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
      await apiFetch(`/api/policies/${policyId}/coverages/${itemId}`, { method: "DELETE" });
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
        <h2 className="font-medium">Coverage Schedule</h2>
        <Button onClick={openCreate} size="sm">
          Add Coverage
        </Button>
      </div>

      {error && modal.mode === "closed" ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">Coverage</th>
              <th className="px-3 py-2">Deductible</th>
              <th className="px-3 py-2">Effective</th>
              <th className="px-3 py-2">Expiration</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={5}>
                  No coverages recorded.
                </td>
              </tr>
            ) : (
              initialData.map((item) => (
                <tr className="border-t border-zinc-200" key={item.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {COVERAGE_TYPE_LABEL[item.coverage_type] ?? item.coverage_type}
                    </span>
                    {item.description ? (
                      <p className="text-xs text-zinc-500">{item.description}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {item.deductible != null ? (
                      <>
                        {item.deductible_type === "percentage"
                          ? `${item.deductible}%`
                          : formatCurrency(item.deductible)}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{formatDate(item.effective_date)}</td>
                  <td className="px-3 py-2">{formatDate(item.expiration_date)}</td>
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
                {modal.mode === "create" ? "Add Coverage" : "Edit Coverage"}
              </h3>
              <Button onClick={close} size="sm" type="button" variant="outline">
                Close
              </Button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Coverage Type</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  required
                  {...field("coverage_type")}
                >
                  {COVERAGE_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-zinc-600">Description</span>
                <Input placeholder="Coverage description" {...field("description")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Deductible</span>
                <Input min="0" placeholder="1000" step="0.01" type="number" {...field("deductible")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Deductible Type</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  {...field("deductible_type")}
                >
                  <option value="">None</option>
                  {DEDUCTIBLE_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Effective Date</span>
                <Input type="date" {...field("effective_date")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-zinc-600">Expiration Date</span>
                <Input type="date" {...field("expiration_date")} />
              </label>
              {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}
              <div className="flex gap-2 md:col-span-2">
                <Button disabled={saving} type="submit">
                  {saving ? "Saving…" : modal.mode === "create" ? "Add Coverage" : "Save Changes"}
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
