"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type Pipeline = {
  id: string;
  name: string;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

export function ConvertToDealModal({
  lead,
  pipelines,
  onClose,
}: {
  lead: Lead;
  pipelines: Pipeline[];
  onClose: () => void;
}) {
  const router = useRouter();
  const defaultTitle =
    lead.company_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
    "";
  const [title, setTitle] = useState(defaultTitle);
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [closeDate, setCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [createAccount, setCreateAccount] = useState(!!lead.company_name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pipelineId) {
      setError("Select a pipeline.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: true; data: { deal_id: string; account_id: string | null } }>(
        `/api/crm/leads/${lead.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            estimated_revenue: Number(estimatedRevenue) || 0,
            pipeline_id: pipelineId,
            close_date: closeDate || undefined,
            notes: notes.trim() || undefined,
            create_account: createAccount,
          }),
        },
      );
      router.push(`/crm/deals/${res.data.deal_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">Convert to Deal</h2>
        <p className="mb-5 text-sm text-zinc-500">
          A deal will be created and this lead will be marked as converted.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Deal Title</span>
            <Input
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Acme Corp Opportunity"
              required
              value={title}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Estimated Revenue</span>
            <Input
              min="0"
              onChange={(e) => setEstimatedRevenue(e.target.value)}
              placeholder="0"
              required
              step="0.01"
              type="number"
              value={estimatedRevenue}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Pipeline</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              disabled={pipelines.length === 0}
              onChange={(e) => setPipelineId(e.target.value)}
              required
              value={pipelineId}
            >
              {pipelines.length === 0 ? (
                <option value="">No pipelines available</option>
              ) : (
                pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Close Date</span>
            <Input
              onChange={(e) => setCloseDate(e.target.value)}
              type="date"
              value={closeDate}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Notes</span>
            <textarea
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Next steps, context, or anything relevant…"
              rows={3}
              value={notes}
            />
          </label>

          <label className="flex items-start gap-2">
            <input
              checked={createAccount}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              onChange={(e) => setCreateAccount(e.target.checked)}
              type="checkbox"
            />
            <span className="text-sm text-zinc-700">
              Create a new Customer record from this lead
            </span>
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button disabled={submitting || pipelines.length === 0} type="submit">
              {submitting ? "Converting…" : "Convert to Deal"}
            </Button>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
