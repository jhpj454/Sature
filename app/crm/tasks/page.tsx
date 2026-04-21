import { safeApiFetchJson, requireSession } from "@/app/crm/_lib/api";
import { TasksPageClient } from "./_components/TasksPageClient";

export type Task = {
  id: string;
  agency_id: string;
  title: string;
  description: string | null;
  status: "open" | "completed";
  due_date: string | null;
  assigned_to_user_id: string | null;
  assignee_display_name: string | null;
  created_by_user_id: string | null;
  creator_display_name: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  recurrence_rule: string | null;
  template_id: string | null;
  rule_id: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskTemplate = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  default_offset_days: number | null;
  default_assignee_role: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRule = {
  id: string;
  agency_id: string;
  name: string;
  template_id: string;
  template_name: string | null;
  trigger_type: string;
  trigger_offset_days: number | null;
  segment_filters: Record<string, unknown>;
  recurrence_rule: string | null;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export default async function CrmTasksPage() {
  await requireSession();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().slice(0, 10);

  const [myTasksRes, upcomingRes, overdueRes, templatesRes, rulesRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Task[] }>(
      "/api/crm/tasks?view=mine&status=open&page_size=100",
    ),
    safeApiFetchJson<{ ok: true; data: Task[] }>(
      `/api/crm/tasks?status=open&due_after=${todayStr}&due_before=${in14DaysStr}&page_size=100`,
    ),
    safeApiFetchJson<{ ok: true; data: Task[] }>(
      `/api/crm/tasks?status=open&due_before=${todayStr}&page_size=100`,
    ),
    safeApiFetchJson<{ ok: true; data: TaskTemplate[] }>("/api/crm/task-templates"),
    safeApiFetchJson<{ ok: true; data: TaskRule[] }>("/api/crm/task-rules"),
  ]);

  const myTasks = myTasksRes.ok ? myTasksRes.data.data : [];
  const upcomingTasks = upcomingRes.ok ? upcomingRes.data.data : [];
  const overdueTasks = overdueRes.ok ? overdueRes.data.data : [];
  const templates = templatesRes.ok ? templatesRes.data.data : [];
  const rules = rulesRes.ok ? rulesRes.data.data : [];

  return (
    <div className="space-y-6 p-6">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "3.5rem",
            color: "hsl(0,0%,100%)",
            margin: 0,
          }}
        >
          Tasks
        </h1>
      </div>

      <TasksPageClient
        myTasks={myTasks}
        upcomingTasks={upcomingTasks}
        overdueTasks={overdueTasks}
        templates={templates}
        rules={rules}
        today={todayStr}
      />
    </div>
  );
}
