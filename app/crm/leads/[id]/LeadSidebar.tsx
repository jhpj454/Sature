"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/ams/_lib/format";
import { ConvertToDealModal } from "./ConvertToDealModal";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  assigned_producer_id: string | null;
  assignment_status: string;
  lead_list_id: string | null;
  created_at: string;
  updated_at: string;
};

type Pipeline = {
  id: string;
  name: string;
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-200",
  working: "bg-amber-50 text-amber-700 ring-amber-200",
  qualified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  converted: "bg-violet-50 text-violet-700 ring-violet-200",
  lost: "bg-rose-50 text-rose-700 ring-rose-200",
  archived: "bg-white/30 dark:bg-white/[0.08] text-slate-400 dark:text-[#9da5b4] ring-zinc-200",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  working: "Working",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
  archived: "Archived",
};

const ASSIGNMENT_STYLES: Record<string, string> = {
  unassigned: "text-slate-400 dark:text-[#9da5b4]",
  assigned: "text-slate-700 dark:text-[#e8eaf0]",
  claimed: "text-blue-700 dark:text-[#5a8fcf]",
};

export function LeadSidebar({
  lead,
  pipelines,
}: {
  lead: Lead;
  pipelines: Pipeline[];
}) {
  const router = useRouter();
  const [showConvert, setShowConvert] = useState(false);
  const [markingStatus, setMarkingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const isConverted = lead.status === "converted";
  const isTerminal =
    lead.status === "converted" || lead.status === "lost" || lead.status === "archived";

  const displayName =
    lead.company_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
    "—";

  const statusStyle = STATUS_STYLES[lead.status] ?? "bg-white/30 dark:bg-white/[0.08] text-slate-700 dark:text-[#e8eaf0] ring-zinc-200";
  const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;

  async function markStatus(status: string) {
    setMarkingStatus(status);
    setStatusError(null);
    try {
      await apiFetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setMarkingStatus(null);
    }
  }

  return (
    <aside className="space-y-4">
      {/* Metadata card */}
      <div className="rounded-xl border border-slate-200/30 dark:border-white/[0.08] bg-white dark:bg-[rgba(255,255,255,0.10)] p-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-[#e8eaf0]">{displayName}</h2>
          {lead.company_name && (lead.first_name || lead.last_name) ? (
            <p className="text-sm text-slate-400 dark:text-[#9da5b4]">
              {[lead.first_name, lead.last_name].filter(Boolean).join(" ")}
            </p>
          ) : null}
        </div>

        <span
          className={`mb-4 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle}`}
        >
          {statusLabel}
        </span>

        <dl className="mt-3 space-y-2 text-sm">
          {lead.email ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400 dark:text-[#9da5b4]">Email</dt>
              <dd>
                <a className="text-blue-700 dark:text-[#5a8fcf] dark:hover:text-[#7aaad9] hover:underline" href={`mailto:${lead.email}`}>
                  {lead.email}
                </a>
              </dd>
            </div>
          ) : null}
          {lead.phone ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400 dark:text-[#9da5b4]">Phone</dt>
              <dd>
                <a className="text-blue-700 dark:text-[#5a8fcf] dark:hover:text-[#7aaad9] hover:underline" href={`tel:${lead.phone}`}>
                  {lead.phone}
                </a>
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 dark:text-[#9da5b4]">Source</dt>
            <dd className="capitalize dark:text-[#e8eaf0]">{lead.source.replace(/_/g, " ")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 dark:text-[#9da5b4]">Assignment</dt>
            <dd className={ASSIGNMENT_STYLES[lead.assignment_status] ?? ""}>
              {lead.assignment_status}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 dark:text-[#9da5b4]">Created</dt>
            <dd className="dark:text-[#e8eaf0]">{formatDate(lead.created_at)}</dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      {!isTerminal ? (
        <div className="rounded-xl border border-slate-200/30 dark:border-white/[0.08] bg-white dark:bg-[rgba(255,255,255,0.10)] p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-700 dark:text-[#e8eaf0]">Actions</h3>
          {statusError ? (
            <p className="mb-2 text-xs text-rose-500">{statusError}</p>
          ) : null}
          <div className="space-y-2">
            <Button
              className="w-full bg-emerald-700 hover:bg-emerald-800"
              disabled={pipelines.length === 0 || markingStatus !== null}
              onClick={() => setShowConvert(true)}
              type="button"
            >
              Convert to Deal
            </Button>
            {lead.status !== "qualified" ? (
              <Button
                className="w-full"
                disabled={markingStatus !== null}
                onClick={() => markStatus("qualified")}
                type="button"
                variant="outline"
              >
                {markingStatus === "qualified" ? "Saving…" : "Mark Qualified"}
              </Button>
            ) : null}
            <Button
              className="w-full"
              disabled={markingStatus !== null}
              onClick={() => markStatus("lost")}
              type="button"
              variant="outline"
            >
              {markingStatus === "lost" ? "Saving…" : "Mark Lost"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Convert modal */}
      {showConvert ? (
        <ConvertToDealModal
          lead={lead}
          onClose={() => setShowConvert(false)}
          pipelines={pipelines}
        />
      ) : null}
    </aside>
  );
}
