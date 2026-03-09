"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type Pipeline = {
  id: string;
  name: string;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

function buildDefaultDealName(lead: Lead): string {
  const base =
    lead.company_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
    "Lead";
  return `${base} Opportunity`;
}

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
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [stageId, setStageId] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [dealName, setDealName] = useState(buildDefaultDealName(lead));
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [accountName, setAccountName] = useState(
    lead.company_name ||
      [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
      "",
  );
  const [accountType, setAccountType] = useState<"commercial" | "personal">(
    lead.company_name ? "commercial" : "personal",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelineId) return;
    setStages([]);
    setStageId("");
    setStagesLoading(true);
    apiFetch<{ ok: true; data: Stage[] }>(`/api/crm/pipelines/${pipelineId}/stages`)
      .then((res) => {
        const sorted = [...res.data].sort((a, b) => a.sort_order - b.sort_order);
        setStages(sorted);
        setStageId(sorted[0]?.id ?? "");
      })
      .catch(() => {
        setStages([]);
      })
      .finally(() => setStagesLoading(false));
  }, [pipelineId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stageId) {
      setError("Select a pipeline stage.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        pipeline_id: pipelineId,
        pipeline_stage_id: stageId,
        deal_name: dealName.trim() || undefined,
        estimated_revenue: estimatedRevenue ? Number(estimatedRevenue) : 0,
        expected_close_date: expectedCloseDate || undefined,
        next_step: nextStep.trim() || undefined,
        create_account: createAccount,
      };
      if (createAccount) {
        payload.account_name = accountName.trim() || undefined;
        payload.account_type = accountType;
      }

      const res = await apiFetch<{ ok: true; data: { deal: { id: string } } }>(
        `/api/crm/leads/${lead.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      router.push(`/crm/deals/${res.data.deal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">Convert to Deal</h2>
        <p className="mb-5 text-sm text-zinc-500">
          A deal will be created and this lead will be marked as converted.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Deal name */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Deal Name</span>
            <Input
              onChange={(e) => setDealName(e.target.value)}
              placeholder="Acme Corp Opportunity"
              required
              value={dealName}
            />
          </label>

          {/* Pipeline */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Pipeline</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              disabled={pipelines.length === 0}
              onChange={(e) => setPipelineId(e.target.value)}
              required
              value={pipelineId}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* Stage */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Starting Stage</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm disabled:opacity-50"
              disabled={stagesLoading || stages.length === 0}
              onChange={(e) => setStageId(e.target.value)}
              required
              value={stageId}
            >
              {stagesLoading ? (
                <option>Loading…</option>
              ) : (
                stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Estimated revenue */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Estimated Revenue</span>
            <Input
              min="0"
              onChange={(e) => setEstimatedRevenue(e.target.value)}
              placeholder="0"
              step="0.01"
              type="number"
              value={estimatedRevenue}
            />
          </label>

          {/* Expected close date */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Expected Close Date</span>
            <Input
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              type="date"
              value={expectedCloseDate}
            />
          </label>

          {/* Next step */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Next Step</span>
            <Input
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Schedule follow-up call…"
              value={nextStep}
            />
          </label>

          {/* Create account */}
          <div>
            <label className="flex items-center gap-2">
              <input
                checked={createAccount}
                className="h-4 w-4 rounded border-zinc-300"
                onChange={(e) => setCreateAccount(e.target.checked)}
                type="checkbox"
              />
              <span className="text-sm font-medium text-zinc-700">Create Customer Account</span>
            </label>
            {createAccount ? (
              <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <label className="block space-y-1">
                  <span className="text-sm text-zinc-600">Account Name</span>
                  <Input
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Acme Corp"
                    required={createAccount}
                    value={accountName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm text-zinc-600">Account Type</span>
                  <select
                    className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    onChange={(e) => setAccountType(e.target.value as "commercial" | "personal")}
                    value={accountType}
                  >
                    <option value="commercial">Commercial</option>
                    <option value="personal">Personal</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button disabled={submitting || stagesLoading} type="submit">
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
