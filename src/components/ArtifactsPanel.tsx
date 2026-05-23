import { useState } from "react";
import { Code, Eye, Copy, Download, X } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import "./ArtifactsPanel.css";

export interface Artifact {
  id: string;
  name: string;
  content: string;
  language?: string;
  type?: "code" | "markdown" | "html" | "svg";
}

interface ArtifactsPanelProps {
  visible: boolean;
  onClose?: () => void;
  artifacts?: Artifact[];
}

export function ArtifactsPanel({
  visible,
  onClose,
  artifacts = [],
}: ArtifactsPanelProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const active = artifacts[activeIdx];

  const canPreview =
    active &&
    (active.type === "html" ||
      active.type === "svg" ||
      active.type === "markdown");

  const handleCopy = () => {
    if (active) {
      navigator.clipboard.writeText(active.content).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!active) return;
    const blob = new Blob([active.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = active.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="artifacts">
      <div className="artifacts-header">
        <span className="artifacts-title mono">Artifacts</span>
        <span className="artifacts-count">{artifacts.length}</span>
        <div className="grow" />
        {onClose && (
          <button className="artifacts-close" onClick={onClose} type="button">
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="artifacts-list">
        {artifacts.length === 0 ? (
          <div className="text-muted" style={{ padding: 12, fontSize: 12 }}>
            No artifacts yet. Generated files appear here.
          </div>
        ) : (
          artifacts.map((a, i) => (
            <button
              key={a.id}
              className={`artifacts-item ${i === activeIdx ? "artifacts-item-active" : ""}`}
              onClick={() => setActiveIdx(i)}
              type="button"
            >
              <span className="artifacts-item-name">{a.name}</span>
              {a.language && (
                <span className="artifacts-item-lang mono">{a.language}</span>
              )}
            </button>
          ))
        )}
      </div>

      {active && (
        <div className="artifacts-content">
          <div className="artifacts-meta mono">
            {active.name}
            {active.language && ` · ${active.language}`}
          </div>

          <div className="artifacts-tabs">
            <button
              className={`artifacts-tab ${tab === "code" ? "active" : ""}`}
              onClick={() => setTab("code")}
              type="button"
            >
              <Code size={12} strokeWidth={1.5} /> Code
            </button>
            {canPreview && (
              <button
                className={`artifacts-tab ${tab === "preview" ? "active" : ""}`}
                onClick={() => setTab("preview")}
                type="button"
              >
                <Eye size={12} strokeWidth={1.5} /> Preview
              </button>
            )}
            <div className="grow" />
            <button
              className="artifacts-action"
              onClick={handleCopy}
              type="button"
            >
              <Copy size={12} strokeWidth={1.5} /> {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="artifacts-action"
              onClick={handleDownload}
              type="button"
            >
              <Download size={12} strokeWidth={1.5} />
            </button>
          </div>

          <div className="artifacts-body">
            {tab === "code" ? (
              <CodeBlock
                code={active.content}
                language={active.language || "text"}
                filename={active.name}
              />
            ) : canPreview && tab === "preview" ? (
              <div className="artifacts-preview">
                {active.type === "html" ? (
                  <iframe
                    srcDoc={active.content}
                    sandbox="allow-scripts"
                    className="artifacts-iframe"
                    title={active.name}
                  />
                ) : active.type === "svg" ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: active.content }}
                    className="artifacts-svg"
                  />
                ) : active.type === "markdown" ? (
                  <MarkdownRenderer
                    content={active.content}
                    className="artifacts-md"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
