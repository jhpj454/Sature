"use client";

import { useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { formatDateTime } from "@/app/ams/_lib/format";

const ACTIVITY_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "task", label: "Task" },
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

const TYPE_BADGE_STYLES: Record<ActivityType, string> = {
  note: "bg-white/30 text-slate-700 ring-zinc-200",
  call: "bg-blue-50 text-blue-700 ring-blue-200",
  email: "bg-violet-50 text-violet-700 ring-violet-200",
  meeting: "bg-amber-50 text-amber-700 ring-amber-200",
  task: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

type Activity = {
  id: string;
  activity_type: ActivityType;
  summary: string;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export function LeadActivityPanel({
  leadId,
  initialActivities,
}: {
  leadId: string;
  initialActivities: Activity[];
}) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiFetch<{ ok: true; data: Activity }>(
        `/api/crm/leads/${leadId}/activities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_type: activityType, summary }),
        },
      );
      setActivities((prev) => [created.data, ...prev]);
      setSummary("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to log activity.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Log activity form */}
      <div className="rounded-lg border border-slate-200/30 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-800">Log Activity</h2>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="block space-y-1">
              <span className="text-sm text-slate-500">Type</span>
              <select
                className="h-9 w-full rounded-md border border-slate-300/40 bg-white px-3 text-sm"
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
                value={activityType}
              >
                {ACTIVITY_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label className="block space-y-1">
              <span className="text-sm text-slate-500">Summary</span>
              <textarea
                className="w-full rounded-md border border-slate-300/40 px-3 py-2 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none"
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Called lead to discuss coverage needs…"
                required
                rows={3}
                value={summary}
              />
            </label>
          </div>
          {formError ? <p className="text-sm text-rose-500">{formError}</p> : null}
          <Button disabled={submitting} type="submit">
            {submitting ? "Logging…" : "Log Activity"}
          </Button>
        </form>
      </div>

      {/* Activity timeline */}
      <div className="rounded-lg border border-slate-200/30 bg-white">
        <div className="border-b border-slate-200/30 px-4 py-3">
          <h2 className="font-medium text-slate-800">Activity Timeline</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No activities logged yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {activities.map((activity) => {
              const badgeStyle =
                TYPE_BADGE_STYLES[activity.activity_type] ?? TYPE_BADGE_STYLES.note;
              return (
                <li className="px-4 py-3" key={activity.id}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeStyle}`}
                    >
                      {ACTIVITY_TYPES.find((t) => t.value === activity.activity_type)?.label ??
                        activity.activity_type}
                    </span>
                    <time className="text-xs text-slate-400">
                      {formatDateTime(activity.occurred_at ?? activity.created_at)}
                    </time>
                    {activity.created_by_name ? (
                      <span className="text-xs text-slate-400">
                        by {activity.created_by_name}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-800">{activity.summary}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
