"use client";

import { useState } from "react";
import type { Task, TaskTemplate, TaskRule } from "../page";
import { CreateTaskModal } from "./CreateTaskModal";
import { TemplatesManager } from "./TemplatesManager";
import { RulesManager } from "./RulesManager";

const TH_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 11,
  color: "hsl(0,0%,50%)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "10px 16px",
  textAlign: "left",
  fontWeight: 500,
};

const TD_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  color: "hsl(0,0%,80%)",
  padding: "10px 16px",
  verticalAlign: "middle",
};

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(31, 31, 31, 0.28)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16,
  overflow: "hidden",
};

const SECTION_TITLE: React.CSSProperties = {
  fontFamily: "var(--font-lora)",
  fontSize: 20,
  color: "hsl(0,0%,100%)",
  margin: 0,
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td
        colSpan={99}
        style={{
          padding: 32,
          textAlign: "center",
          fontFamily: "var(--font-instrument-sans)",
          fontSize: 14,
          color: "hsl(0,0%,40%)",
        }}
      >
        {message}
      </td>
    </tr>
  );
}

function MyTaskRow({
  task,
  onComplete,
}: {
  task: Task;
  onComplete: (id: string) => void;
}) {
  const [completing, setCompleting] = useState(false);

  async function handleCheck() {
    if (completing) return;
    setCompleting(true);
    try {
      await fetch(`/api/crm/tasks/${task.id}/complete`, { method: "POST" });
      onComplete(task.id);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <tr
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        opacity: completing ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <td style={{ ...TD_STYLE, width: 40 }}>
        <input
          type="checkbox"
          checked={false}
          onChange={handleCheck}
          disabled={completing}
          style={{ accentColor: "#3762e3", width: 16, height: 16, cursor: "pointer" }}
        />
      </td>
      <td style={TD_STYLE}>
        <span style={{ fontFamily: "var(--font-lora)", fontSize: 14, color: "hsl(0,0%,100%)" }}>
          {task.title}
        </span>
        {task.description && (
          <div style={{ fontSize: 12, color: "hsl(0,0%,50%)", marginTop: 2 }}>
            {task.description}
          </div>
        )}
      </td>
      <td style={TD_STYLE}>
        {task.due_date ? (
          <span style={{ fontSize: 12, color: "hsl(0,0%,60%)" }}>{formatDate(task.due_date)}</span>
        ) : (
          <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
        )}
      </td>
      <td style={TD_STYLE}>
        {task.linked_entity_type ? (
          <span
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.06)",
              color: "hsl(0,0%,60%)",
              borderRadius: 6,
              padding: "2px 9px",
              fontSize: 12,
            }}
          >
            {task.linked_entity_type}
          </span>
        ) : (
          <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

function TaskListRow({
  task,
  isOverdue,
}: {
  task: Task;
  isOverdue?: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <td style={TD_STYLE}>
        <span style={{ fontFamily: "var(--font-lora)", fontSize: 14, color: "hsl(0,0%,100%)" }}>
          {task.title}
        </span>
      </td>
      <td style={TD_STYLE}>
        {task.due_date ? (
          <span
            style={{
              fontSize: 12,
              color: isOverdue ? "#e05252" : "hsl(0,0%,60%)",
              fontWeight: isOverdue ? 600 : 400,
            }}
          >
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
        )}
      </td>
      <td style={TD_STYLE}>
        {task.assignee_display_name ?? (
          <span style={{ color: "hsl(0,0%,40%)" }}>Unassigned</span>
        )}
      </td>
      <td style={TD_STYLE}>
        {task.linked_entity_type ? (
          <span
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.06)",
              color: "hsl(0,0%,60%)",
              borderRadius: 6,
              padding: "2px 9px",
              fontSize: 12,
            }}
          >
            {task.linked_entity_type}
          </span>
        ) : (
          <span style={{ color: "hsl(0,0%,40%)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

type Tab = "templates" | "rules";

export function TasksPageClient({
  myTasks: initialMyTasks,
  upcomingTasks,
  overdueTasks,
  templates: initialTemplates,
  rules: initialRules,
  today,
}: {
  myTasks: Task[];
  upcomingTasks: Task[];
  overdueTasks: Task[];
  templates: TaskTemplate[];
  rules: TaskRule[];
  today: string;
}) {
  const [myTasks, setMyTasks] = useState<Task[]>(initialMyTasks);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<TaskTemplate[]>(initialTemplates);
  const [rules, setRules] = useState<TaskRule[]>(initialRules);

  function handleTaskComplete(taskId: string) {
    setMyTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handleTaskCreated(task: Task) {
    setShowCreateModal(false);
    // If task is assigned to current user and open, prepend to my tasks
    setMyTasks((prev) => [task, ...prev]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: "#3762e3",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + New Task
        </button>
      </div>

      {/* My Tasks checklist */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <h2 style={SECTION_TITLE}>My Tasks</h2>
        </div>
        <div style={CARD_STYLE}>
          {myTasks.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                color: "hsl(0,0%,40%)",
              }}
            >
              No open tasks assigned to you.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={{ ...TH_STYLE, width: 40 }}></th>
                  <th style={TH_STYLE}>Title</th>
                  <th style={TH_STYLE}>Due Date</th>
                  <th style={TH_STYLE}>Entity</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map((task) => (
                  <MyTaskRow key={task.id} task={task} onComplete={handleTaskComplete} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upcoming + Overdue */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Upcoming */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <h2 style={SECTION_TITLE}>Upcoming (Next 14 Days)</h2>
          </div>
          <div style={CARD_STYLE}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={TH_STYLE}>Title</th>
                  <th style={TH_STYLE}>Due Date</th>
                  <th style={TH_STYLE}>Assignee</th>
                  <th style={TH_STYLE}>Entity</th>
                </tr>
              </thead>
              <tbody>
                {upcomingTasks.length === 0 ? (
                  <EmptyRow message="No upcoming tasks in the next 14 days." />
                ) : (
                  upcomingTasks.map((task) => <TaskListRow key={task.id} task={task} />)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ ...SECTION_TITLE, color: "#e05252" }}>Overdue</h2>
          </div>
          <div
            style={{
              ...CARD_STYLE,
              border: overdueTasks.length > 0 ? "1px solid rgba(224,82,82,0.2)" : CARD_STYLE.border,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={TH_STYLE}>Title</th>
                  <th style={TH_STYLE}>Due Date</th>
                  <th style={TH_STYLE}>Assignee</th>
                  <th style={TH_STYLE}>Entity</th>
                </tr>
              </thead>
              <tbody>
                {overdueTasks.length === 0 ? (
                  <EmptyRow message="No overdue tasks." />
                ) : (
                  overdueTasks.map((task) => (
                    <TaskListRow key={task.id} task={task} isOverdue={true} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tabs: Templates + Rules */}
      <div>
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 0,
          }}
        >
          {(["templates", "rules"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab ? "2px solid #3762e3" : "2px solid transparent",
                padding: "10px 20px",
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 14,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "hsl(0,0%,100%)" : "hsl(0,0%,50%)",
                cursor: "pointer",
                marginBottom: -1,
                transition: "color 0.15s",
              }}
            >
              {tab === "templates" ? "Templates" : "Automation Rules"}
            </button>
          ))}
        </div>

        <div
          style={{
            ...CARD_STYLE,
            borderRadius: "0 16px 16px 16px",
            borderTop: "none",
          }}
        >
          {activeTab === "templates" ? (
            <TemplatesManager
              templates={templates}
              onTemplatesChange={setTemplates}
            />
          ) : (
            <RulesManager
              rules={rules}
              templates={templates}
              onRulesChange={setRules}
            />
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}
