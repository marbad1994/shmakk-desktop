import { useState } from "react";
import {
  Check,
  X,
  Columns,
  AlignJustify,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { Button } from "../components/Button";
import "./EditViewerView.css";

type DiffMode = "unified" | "split";

export function EditViewerView() {
  const files = useProjectStore((s) => s.files);
  const activeFilePath = useProjectStore((s) => s.activeFilePath);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);

  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  const changedFiles = files.filter((f) => f.status !== "unchanged");
  const activeFile = changedFiles.find((f) => f.path === activeFilePath);
  const fileIndex = activeFile ? changedFiles.indexOf(activeFile) : -1;

  const goToPrev = () => {
    if (fileIndex > 0) setActiveFile(changedFiles[fileIndex - 1].path);
  };
  const goToNext = () => {
    if (fileIndex < changedFiles.length - 1)
      setActiveFile(changedFiles[fileIndex + 1].path);
  };

  return (
    <div className="ev-app">
      <div className="chat-header">
        <div className="chat-title">Edit Viewer</div>
        <div className="ev-toggle-group">
          <button
            className={`chat-header-btn ${diffMode === "unified" ? "ev-toggle-active" : ""}`}
            onClick={() => setDiffMode("unified")}
            type="button"
            title="Unified diff"
          >
            <AlignJustify size={13} strokeWidth={1.5} />
          </button>
          <button
            className={`chat-header-btn ${diffMode === "split" ? "ev-toggle-active" : ""}`}
            onClick={() => setDiffMode("split")}
            type="button"
            title="Split diff"
          >
            <Columns size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="ev-body">
        <div className="ev-sidebar">
          <div className="ev-sidebar-header mono">
            Changed files
            <span className="ev-file-count">{changedFiles.length}</span>
          </div>
          <div className="ev-file-list">
            {changedFiles.length === 0 ? (
              <div className="text-muted" style={{ padding: "12px" }}>
                No changed files in workspace.
              </div>
            ) : (
              changedFiles.map((file) => (
                <div
                  key={file.path}
                  className={`ev-file ${file.path === activeFilePath ? "ev-file-active" : ""}`}
                  onClick={() => setActiveFile(file.path)}
                >
                  <span className={`ev-file-status ev-status-${file.status}`}>
                    {file.status === "modified"
                      ? "M"
                      : file.status === "added"
                        ? "A"
                        : "D"}
                  </span>
                  <span className="ev-file-name">
                    {file.path.split("/").pop()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="ev-main">
          {activeFile ? (
            <>
              <div className="ev-header-bar">
                <div className="ev-file-nav">
                  <button
                    className="ev-nav-btn"
                    onClick={goToPrev}
                    disabled={fileIndex <= 0}
                    type="button"
                  >
                    <ChevronLeft size={14} strokeWidth={1.5} />
                  </button>
                  <span className="ev-file-label mono">{activeFile.path}</span>
                  <button
                    className="ev-nav-btn"
                    onClick={goToNext}
                    disabled={fileIndex >= changedFiles.length - 1}
                    type="button"
                  >
                    <ChevronRight size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <span
                  className={`ev-file-badge ev-file-badge-${activeFile.status} mono`}
                >
                  {activeFile.status}
                </span>
                <div className="ev-hunk-actions">
                  <Button variant="ghost" size="sm">
                    <Check size={12} strokeWidth={2} /> Accept all
                  </Button>
                  <Button variant="ghost" size="sm">
                    <X size={12} strokeWidth={2} /> Reject all
                  </Button>
                </div>
              </div>

              <div className="ev-diff">
                <pre className="ev-diff-content mono">
                  {activeFile.content || "(No diff data available — edits happen through agent tool calls)"}
                </pre>
              </div>
            </>
          ) : (
            <div className="ev-empty">
              <p className="text-muted">
                Select a changed file to view the diff.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
