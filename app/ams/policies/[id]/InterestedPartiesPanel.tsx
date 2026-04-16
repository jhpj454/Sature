"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatDate } from "@/app/ams/_lib/format";

const PARTY_TYPES = [
  { value: "named_insured", label: "Named Insured" },
  { value: "additional_insured", label: "Additional Insured" },
  { value: "loss_payee", label: "Loss Payee" },
  { value: "mortgagee", label: "Mortgagee" },
  { value: "lessor", label: "Lessor" },
  { value: "certificate_holder", label: "Certificate Holder" },
] as const;

const PARTY_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PARTY_TYPES.map(({ value, label }) => [value, label]),
);

export type InterestedParty = {
  id: string;
  party_type: string;
  name: string;
  address: string | null;
  description: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  account_id: string | null;
};

type FormState = {
  party_type: string;
  name: string;
  address: string;
  description: string;
  effective_date: string;
  expiration_date: string;
};

const DEFAULT_FORM: FormState = {
  party_type: "named_insured",
  name: "",
  address: "",
  description: "",
  effective_date: "",
  expiration_date: "",
};

function partyToForm(party: InterestedParty): FormState {
  return {
    party_type: party.party_type,
    name: party.name,
    address: party.address ?? "",
    description: party.description ?? "",
    effective_date: party.effective_date ?? "",
    expiration_date: party.expiration_date ?? "",
  };
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: InterestedParty };

export function InterestedPartiesPanel({
  initialData,
  policyId,
}: {
  initialData: InterestedParty[];
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

  function openEdit(item: InterestedParty) {
    setForm(partyToForm(item));
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
      party_type: form.party_type,
      name: form.name,
      address: form.address || null,
      description: form.description || null,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
    };

    try {
      if (modal.mode === "create") {
        await apiFetch(`/api/policies/${policyId}/interested-parties`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (modal.mode === "edit") {
        await apiFetch(`/api/policies/${policyId}/interested-parties/${modal.item.id}`, {
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
      await apiFetch(`/api/policies/${policyId}/interested-parties/${itemId}`, {
        method: "DELETE",
      });
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
        <h2 className="font-medium">Interested Parties</h2>
        <Button onClick={openCreate} size="sm">
          Add Party
        </Button>
      </div>

      {error && modal.mode === "closed" ? (
        <p className="text-sm text-rose-500">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200/30 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-white/30 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Effective</th>
              <th className="px-3 py-2">Expiration</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={6}>
                  No interested parties recorded.
                </td>
              </tr>
            ) : (
              initialData.map((item) => (
                <tr className="border-t border-slate-200/30" key={item.id}>
                  <td className="px-3 py-2">
                    {PARTY_TYPE_LABEL[item.party_type] ?? item.party_type}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{item.name}</span>
                    {item.description ? (
                      <p className="text-xs text-slate-400">{item.description}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{item.address ?? "-"}</td>
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
          <div className="w-full max-w-lg rounded-2xl border border-slate-200/30 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                {modal.mode === "create" ? "Add Interested Party" : "Edit Interested Party"}
              </h3>
              <Button onClick={close} size="sm" type="button" variant="outline">
                Close
              </Button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Party Type</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-300/40 bg-white px-3 text-sm"
                  required
                  {...field("party_type")}
                >
                  {PARTY_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Name</span>
                <Input placeholder="ABC Bank N.A." required {...field("name")} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Address</span>
                <Input placeholder="123 Main St, Springfield, IL 62701" {...field("address")} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Description</span>
                <Input placeholder="As their interests may appear" {...field("description")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Effective Date</span>
                <Input type="date" {...field("effective_date")} />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Expiration Date</span>
                <Input type="date" {...field("expiration_date")} />
              </label>
              {error ? <p className="text-sm text-rose-500 md:col-span-2">{error}</p> : null}
              <div className="flex gap-2 md:col-span-2">
                <Button disabled={saving} type="submit">
                  {saving ? "Saving…" : modal.mode === "create" ? "Add Party" : "Save Changes"}
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
