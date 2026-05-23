import { useState } from "react";
import { Check, Circle, FileText } from "lucide-react";
import { SegmentedControl } from "../components/SegmentedControl";
import type { Segment } from "../components/SegmentedControl";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import "./PlansTasksView.css";

interface TaskDep {
  taskId: string;
  label: string;
}

interface Task {
  id: string;
  subject: string;
  description?: string;
  done: boolean;
  active?: boolean;
  dependsOn?: TaskDep[];
}

interface Plan {
  id: string;
  name: string;
  status: "draft" | "active" | "done";
  content: string;
  tasks: Task[];
}

const PLAN_SEGMENTS: Segment[] = [
  { value: "plans", label: "Plans" },
  { value: "tasks", label: "Tasks" },
];

function renderPlanContent(content: string) {
  return content.split("\n").map((line, i) => {
    if (line.startsWith("# ")) {
      return (
        <span key={i} className="pt-md-h1">
          {line.slice(2)}
        </span>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <span key={i} className="pt-md-h2">
          {line.slice(3)}
        </span>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <span key={i} className="pt-md-h3">
          {line.slice(4)}
        </span>
      );
    }
    return (
      <span key={i}>
        {line || " "}
        {"\n"}
      </span>
    );
  });
}

export function PlansTasksView() {
  const [plans] = useState<Plan[]>([]);
  const [activePlanId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [segment, setSegment] = useState("tasks");

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
  const tasks = activePlan?.tasks ?? [];
  const completed = tasks.filter((t) => t.done).length;
  const total = tasks.length;

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="pt-app">
      <div className="chat-header">
        <div className="chat-title">Plans &amp; Tasks</div>
        <SegmentedControl
          segments={PLAN_SEGMENTS}
          value={segment}
          onChange={setSegment}
        />
      </div>

      {!activePlan ? (
        <div className="pt-body">
          <div className="pt-empty">
            <p className="text-muted">
              No plans yet. Plans are created when an agent breaks down a
              complex task into steps. Send a prompt in Chat to get started.
            </p>
          </div>
        </div>
      ) : segment === "plans" ? (
        /* ─── Plans tab ─── */
        <div className="pt-body">
          <div className="pt-plan-editor">
            <div className="pt-plan-editor-header">
              <FileText size={16} className="text-muted" />
              <h3>{activePlan.name}</h3>
              {activePlan.status === "draft" && (
                <span className="pt-draft-tag mono">Draft</span>
              )}
            </div>
            <div className="pt-plan-editor-body">
              {renderPlanContent(activePlan.content)}
              <span className="pt-cursor" />
            </div>
          </div>

          <div className="pt-task-sidebar">
            <div className="pt-task-sidebar-header">
              <h3>Derived tasks</h3>
              <Badge variant="accent">
                {completed}/{total}
              </Badge>
            </div>
            <div className="pt-task-sidebar-body">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`pt-derived-task ${task.id === activeTaskId ? "pt-task-active" : ""}`}
                  onClick={() => setActiveTaskId(task.id)}
                >
                  <span
                    className={`pt-derived-check ${task.done ? "checked" : ""}`}
                  >
                    {task.done && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="pt-derived-name">{task.subject}</span>
                  {task.dependsOn?.map((d) => (
                    <span key={d.taskId} className="pt-dep-tag mono">
                      {d.label}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div className="pt-plan-action-bar">
              <Button variant="ghost" size="sm">
                Add task
              </Button>
              <div className="grow" />
              <Button variant="primary" size="sm">
                Apply plan
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* ─── Tasks tab ─── */
        <div className="pt-body">
          <div className="pt-tasks-viewer">
            <div className="pt-tasks-header">
              <h2>{activePlan.name}</h2>
              <div className="pt-tasks-sub mono">
                plan/{activePlanId} · {completed} of {total} tasks complete
              </div>
              <div className="pt-tasks-progress">
                <div className="pt-tasks-progress-bar">
                  <div
                    className="pt-tasks-progress-fill"
                    style={{
                      width: `${total > 0 ? (completed / total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="pt-tasks-progress-text mono">
                  {total > 0 ? Math.round((completed / total) * 100) : 0}%
                </span>
              </div>
            </div>

            <div className="pt-tasks-body">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`pt-task-block ${task.id === activeTaskId ? "active" : ""} ${task.done ? "completed" : ""}`}
                  onClick={() => setActiveTaskId(task.id)}
                >
                  <div className="pt-task-block-head">
                    <Circle
                      size={10}
                      className={`pt-task-status-dot ${task.done ? "done" : task.active ? "active" : "pending"}`}
                      fill="currentColor"
                    />
                    <span className="pt-task-block-id mono">{task.id}</span>
                    <span className="pt-task-block-subject">
                      {task.subject}
                    </span>
                  </div>
                  {task.description && (
                    <div className="pt-task-block-desc">
                      {task.description}
                    </div>
                  )}
                  {task.dependsOn && task.dependsOn.length > 0 && (
                    <div className="pt-task-block-meta mono">
                      {task.dependsOn.map((d) => (
                        <span key={d.taskId} className="pt-dep">
                          depends on {d.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-tasks-action-bar">
              <div className="pt-live-indicator">
                <span className="pt-live-dot" />
                <span className="mono text-xs text-muted">
                  Watching TASKS.md
                </span>
              </div>
              <div className="grow" />
              <Button variant="ghost" size="sm">
                Refresh
              </Button>
              <Button variant="primary" size="sm">
                Run plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
