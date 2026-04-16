import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/app/ams/_lib/api";
import { formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";

type Task = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
};

type UserOption = {
  id: string;
  display_name: string;
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [taskRes, usersRes] = await Promise.all([
    apiFetch<{ ok: true; data: Task }>(`/api/tasks/${id}`),
    apiFetch<{ ok: true; data: UserOption[] }>("/api/users"),
  ]);

  const task = taskRes.data;
  if (!task) {
    notFound();
  }

  const userById = new Map(usersRes.data.map((row) => [row.id, row.display_name]));

  return (
    <div className="space-y-6">
      <DetailHeader
        title={task.title}
        subtitle="Task"
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={task.status} />
            <span>Created {formatDateTime(task.created_at)}</span>
          </div>
        }
        actions={
          <Link className="text-sm text-blue-700 hover:underline" href="/ams/work-queue">
            Back to Work Queue
          </Link>
        }
      />

      <section className="rounded-xl border border-slate-200/30 bg-white p-4">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Assigned To</dt>
            <dd>
              {task.assigned_to_user_id
                ? userById.get(task.assigned_to_user_id) ?? task.assigned_to_user_id.slice(0, 8)
                : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Due Date</dt>
            <dd>{formatDate(task.due_date)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Linked Entity</dt>
            <dd>
              {task.linked_entity_type && task.linked_entity_id
                ? `${task.linked_entity_type}:${task.linked_entity_id.slice(0, 8)}`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-slate-400">Description</dt>
            <dd>{task.description ?? "-"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
