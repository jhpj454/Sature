"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ServiceCase = {
  id: string;
  status: "open" | "in_progress" | "waiting" | "done" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to_user_id: string | null;
};

type UserOption = {
  id: string;
  display_name: string;
};

type Props = {
  serviceCase: ServiceCase;
  users: UserOption[];
};

export function ServiceCaseOverviewEditor({ serviceCase, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(serviceCase.status);
  const [priority, setPriority] = useState(serviceCase.priority);
  const [assignedTo, setAssignedTo] = useState(serviceCase.assigned_to_user_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDirty = useMemo(
    () =>
      status !== serviceCase.status ||
      priority !== serviceCase.priority ||
      assignedTo !== (serviceCase.assigned_to_user_id ?? ""),
    [assignedTo, priority, serviceCase.assigned_to_user_id, serviceCase.priority, serviceCase.status, status],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      status,
      priority,
      assigned_to_user_id: assignedTo ? assignedTo : null,
    };

    startTransition(async () => {
      const response = await fetch(`/api/service-cases/${serviceCase.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to update service case.");
        return;
      }

      setSuccess("Service case updated.");
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <select
            className="w-full rounded border border-slate-300/40 px-2 py-1"
            onChange={(event) => setStatus(event.target.value as ServiceCase["status"])}
            value={status}
          >
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="waiting">waiting</option>
            <option value="done">done</option>
            <option value="closed">closed</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Priority</span>
          <select
            className="w-full rounded border border-slate-300/40 px-2 py-1"
            onChange={(event) => setPriority(event.target.value as ServiceCase["priority"])}
            value={priority}
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Assigned CSR</span>
          <select
            className="w-full rounded border border-slate-300/40 px-2 py-1"
            onChange={(event) => setAssignedTo(event.target.value)}
            value={assignedTo}
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isDirty || isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
      </div>
    </form>
  );
}
