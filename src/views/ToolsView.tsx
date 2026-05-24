import { Link } from "react-router-dom";
import { Archive, Database, Puzzle, Workflow } from "lucide-react";
import "./ToolsView.css";

const TOOL_LINKS = [
  {
    path: "/skills",
    title: "Skills",
    description: "Browse, filter, enable, and disable installed agent skills.",
    icon: Puzzle,
  },
  {
    path: "/memory",
    title: "Memory & Rules",
    description: "Edit global rules and persistent working preferences.",
    icon: Database,
  },
  {
    path: "/workflows",
    title: "Workflows",
    description: "Manage repeatable task flows and automation templates.",
    icon: Workflow,
  },
  {
    path: "/artifacts",
    title: "Artifacts",
    description: "Inspect global and project-scoped generated files.",
    icon: Archive,
  },
];

export function ToolsView() {
  return (
    <div className="tools-view">
      <div className="chat-header">
        <div className="chat-title">Tools</div>
      </div>
      <div className="tools-body">
        <div className="tools-grid">
          {TOOL_LINKS.map((tool) => (
            <Link key={tool.path} to={tool.path} className="tools-card">
              <span className="tools-card-icon">
                <tool.icon size={18} strokeWidth={1.5} />
              </span>
              <span className="tools-card-main">
                <strong>{tool.title}</strong>
                <span>{tool.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
