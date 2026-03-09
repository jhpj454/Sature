"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/app/lib/apiClient";
import { formatCurrency, formatDate } from "@/app/ams/_lib/format";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type Deal = {
  id: string;
  name: string;
  status: string;
  stage_name: string;
  stage_type: string;
  pipeline_id: string;
  pipeline_stage_id: string;
  pipeline_name: string;
  estimated_revenue: string | number;
  expected_close_date: string | null;
  producer_display_name: string | null;
  account_id: string | null;
  account_name: string | null;
  lead_id: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company_name: string | null;
  next_step: string | null;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 ring-blue-200",
  won: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-rose-50 text-rose-700 ring-rose-200",
  archived: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const STAGE_TYPE_STYLES: Record<string, string> = {
  open: "border-zinc-300 bg-white hover:border-zinc-600 text-zinc-700",
  won: "border-emerald-300 bg-emerald-50 hover:border-emerald-600 text-emerald-700",
  lost: "border-rose-300 bg-rose-50 hover:border-rose-600 text-rose-700",
};

export function DealSidebar({ deal, stages }: { deal: Deal; stages: Stage[] }) {
  const router = useRouter();
  const [confirmStage, setConfirmStage] = useState<Stage | null>(null);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(deal.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function moveToStage(stage: Stage) {
    setMovingTo(stage.id);
    setStageError(null);
    setConfirmStage(null);
    try {
      await apiFetch(`/api/crm/deals/${deal.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage_id: stage.id }),
      });
      router.refresh();
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "Failed to update stage.");
    } finally {
      setMovingTo(null);
    }
  }

  function handleStageClick(stage: Stage) {
    if (stage.id === deal.pipeline_stage_id) return;
    if (stage.stage_type === "won" || stage.stage_type === "lost") {
      setConfirmStage(stage);
      return;
    }
    moveToStage(stage);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError(null);
    try {
      await apiFetch(`/api/crm/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue }),
      });
      setEditingName(false);
      router.refresh();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingName(false);
    }
  }

  const leadName = deal.lead_first_name || deal.lead_last_name
    ? [deal.lead_first_name, deal.lead_last_name].filter(Boolean).join(" ")
    : deal.lead_company_name ?? null;

  const statusStyle = STATUS_STYLES[deal.status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";

  return (
    <aside className="space-y-4">
      {/* Metadata card */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          {editingName ? (
            <form className="flex-1" onSubmit={handleSaveName}>
              <Input
                autoFocus
                className="mb-2"
                onChange={(e) => setNameValue(e.target.value)}
                required
                value={nameValue}
              />
              {nameError ? <p className="mb-1 text-xs text-rose-600">{nameError}</p> : null}
              <div className="flex gap-2">
                <Button disabled={savingName} size="sm" type="submit">
                  {savingName ? "Saving…" : "Save"}
                </Button>
                <Button
                  onClick={() => {
                    setEditingName(false);
                    setNameValue(deal.name);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-zinc-900">{deal.name}</h2>
              <button
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
                onClick={() => setEditingName(true)}
                type="button"
              >
                Edit
              </button>
            </>
          )}
        </div>

        <span
          className={`mb-4 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle}`}
        >
          {deal.status}
        </span>

        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Stage</dt>
            <dd className="font-medium">{deal.stage_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Pipeline</dt>
            <dd>{deal.pipeline_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Estimated Revenue</dt>
            <dd className="font-medium">{formatCurrency(deal.estimated_revenue)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Close Date</dt>
            <dd>{formatDate(deal.expected_close_date)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Producer</dt>
            <dd>{deal.producer_display_name ?? "—"}</dd>
          </div>
          {deal.account_id ? (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Account</dt>
              <dd>
                <Link
                  className="text-blue-700 hover:underline"
                  href={`/crm/accounts/${deal.account_id}`}
                >
                  {deal.account_name ?? deal.account_id.slice(0, 8)}
                </Link>
              </dd>
            </div>
          ) : null}
          {deal.lead_id && leadName ? (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Lead</dt>
              <dd>
                <Link
                  className="text-blue-700 hover:underline"
                  href={`/crm/leads?id=${deal.lead_id}`}
                >
                  {leadName}
                </Link>
              </dd>
            </div>
          ) : null}
          {deal.next_step ? (
            <div className="flex flex-col gap-1">
              <dt className="text-zinc-500">Next Step</dt>
              <dd className="text-zinc-700">{deal.next_step}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Stage selector */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-700">Move Stage</h3>
        {stageError ? <p className="mb-2 text-xs text-rose-600">{stageError}</p> : null}
        <ol className="space-y-1.5">
          {stages.map((stage) => {
            const isCurrent = stage.id === deal.pipeline_stage_id;
            const isMoving = movingTo === stage.id;
            const style = STAGE_TYPE_STYLES[stage.stage_type] ?? STAGE_TYPE_STYLES.open;
            return (
              <li key={stage.id}>
                <button
                  className={`w-full rounded border px-3 py-1.5 text-left text-sm transition-colors ${style} ${
                    isCurrent ? "border-zinc-900 bg-zinc-900 text-white" : ""
                  } disabled:opacity-50`}
                  disabled={isCurrent || isMoving || movingTo !== null}
                  onClick={() => handleStageClick(stage)}
                  type="button"
                >
                  {isMoving ? "Moving…" : stage.name}
                  {isCurrent ? " ✓" : ""}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Confirmation modal for won/lost */}
      {confirmStage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold text-zinc-900">
              Mark as {confirmStage.stage_type === "won" ? "Won" : "Lost"}?
            </h3>
            <p className="mb-5 text-sm text-zinc-600">
              Moving to &quot;{confirmStage.name}&quot; will mark this deal as{" "}
              <strong>{confirmStage.stage_type}</strong>. This action updates the deal status.
            </p>
            <div className="flex gap-2">
              <Button
                className={
                  confirmStage.stage_type === "won"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-rose-700 hover:bg-rose-800"
                }
                disabled={movingTo !== null}
                onClick={() => moveToStage(confirmStage)}
                type="button"
              >
                {movingTo ? "Moving…" : `Confirm — ${confirmStage.name}`}
              </Button>
              <Button
                onClick={() => setConfirmStage(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
