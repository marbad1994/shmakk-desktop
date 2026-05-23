import { useState } from "react";
import { Play, Terminal, FileText, Pencil } from "lucide-react";
import { Chip } from "../components/Chip";
import { StatusDot } from "../components/StatusDot";
import { Button } from "../components/Button";
import "./WorkflowsView.css";

interface Step {
  name: string;
  done: boolean;
  type?: "shell" | "ai" | "file";
  output?: string;
}

interface Workflow {
  name: string;
  steps: Step[];
}

const stepIcons: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  shell: Terminal,
  ai: Pencil,
  file: FileText,
};

function StepIcon({ type }: { type?: string }) {
  const Icon = stepIcons[type ?? ""] ?? FileText;
  return <Icon size={12} strokeWidth={1.5} />;
}

export function WorkflowsView() {
  const [workflows] = useState<Workflow[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const active = workflows[activeIdx];

  return (
    <div className="wf-app">
      <div className="wf-list">
        <div className="chat-header">
          <div className="chat-title">Workflows</div>
          <Button variant="primary" size="sm">New</Button>
        </div>

        <div className="wf-list-items">
          {workflows.length === 0 ? (
            <div className="wf-list-empty">
              <p className="text-muted">No workflows yet. Create one to start automating tasks.</p>
            </div>
          ) : (
            workflows.map((wf, i) => (
              <div
                key={wf.name}
                className={`wf-list-item ${i === activeIdx ? "wf-list-item-active" : ""}`}
                onClick={() => setActiveIdx(i)}
              >
                <span className="wf-list-item-name">{wf.name}</span>
                <span className="wf-list-item-steps mono">
                  {wf.steps.length} steps
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="wf-detail">
        {active ? (
          <>
            <div className="chat-header">
              <div className="chat-title">
                <span>{active.name}</span>
                <Chip>
                  {active.steps.filter((s) => s.done).length}/{active.steps.length} done
                </Chip>
              </div>
              <Button variant="primary" size="sm">
                <Play size={12} strokeWidth={2.5} /> Run
              </Button>
            </div>

            <div className="wf-steps">
              {active.steps.map((step) => (
                <div
                  key={step.name}
                  className={`wf-step ${step.done ? "wf-step-done" : ""}`}
                >
                  <StatusDot
                    variant={step.done ? "online" : "offline"}
                  />
                  <span className="wf-step-type-icon">
                    <StepIcon type={step.type} />
                  </span>
                  <span className="wf-step-name">{step.name}</span>
                  {step.type && (
                    <span className="wf-step-type mono">{step.type}</span>
                  )}
                  {step.output && (
                    <span className="wf-step-type-icon">
                      <Terminal size={10} strokeWidth={1.5} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="wf-detail-empty">
            <p className="text-muted">Select a workflow or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
