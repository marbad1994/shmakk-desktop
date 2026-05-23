import { AlertTriangle, Check, FileText, FolderOpen, Search, Terminal, Trash2, X } from "lucide-react";
import "./ToolCard.css";

export type ToolSafety = "safe" | "uncertain" | "unsafe";

export interface ToolCall {
  id: string;
  tool: string;
  summary: string;
  safety: ToolSafety;
  params?: Record<string, string>;
  autoApproved?: boolean;
  denied?: boolean;
}

interface ToolCardProps {
  toolCall: ToolCall;
  onAllow?: (id: string) => void;
  onDeny?: (id: string) => void;
}

const toolIcons: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  read_file: FileText,
  write_file: FileText,
  edit_file: FileText,
  delete_file: Trash2,
  list_dir: FolderOpen,
  search: Search,
  run: Terminal,
  default: FileText,
};

function getToolIcon(tool: string) {
  const Icon = toolIcons[tool] ?? toolIcons.default;
  return Icon;
}

export function ToolCard({ toolCall, onAllow, onDeny }: ToolCardProps) {
  const { tool, summary, safety, params, autoApproved, denied } = toolCall;
  const Icon = getToolIcon(tool);
  const resolved = autoApproved || denied;

  return (
    <div className={`tool-card tool-card-${safety}${resolved ? " tool-card-resolved" : ""}`}>
      <div className="tool-header">
        <div className={`tool-icon tool-icon-${safety}`}>
          <Icon size={14} strokeWidth={2} />
        </div>
        <div className="tool-info">
          <div className="tool-name">{tool}</div>
          <div className="tool-summary">{summary}</div>
        </div>
        <span className={`tool-safety tool-safety-${safety}`}>
          {safety}
        </span>
      </div>

      {params && Object.keys(params).length > 0 && (
        <div className="tool-body">
          {Object.entries(params).map(([key, val]) => (
            <div className="tool-kv" key={key}>
              <span className="tool-k">{key}</span>
              <span className="tool-v">{val}</span>
            </div>
          ))}
        </div>
      )}

      {!resolved && onAllow && onDeny && (
        <div className="tool-actions">
          <button
            className="btn btn-sm tool-allow-btn"
            onClick={() => onAllow(toolCall.id)}
            type="button"
          >
            <Check size={12} strokeWidth={2} />
            Allow once
          </button>
          <button
            className="btn btn-sm btn-ghost tool-deny-btn"
            onClick={() => onDeny(toolCall.id)}
            type="button"
          >
            <X size={12} strokeWidth={2} />
            Deny
          </button>
          <div className="tool-spacer" />
          {safety === "unsafe" && (
            <span className="tool-auto-approve-hint tool-hint-unsafe">
              <AlertTriangle size={10} strokeWidth={2} />
              Requires confirmation
            </span>
          )}
        </div>
      )}

      {resolved && (
        <div className="tool-resolved-badge">
          {autoApproved ? "Auto-approved" : "Denied"}
        </div>
      )}
    </div>
  );
}
