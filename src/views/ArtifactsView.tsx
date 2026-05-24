import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { FileText, Trash2, Download, Eye, Code } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useDesignStore } from "../stores/designStore";
import type { ArtifactScope } from "../types/api";
import "./ArtifactsView.css";

interface ProjectOption {
  id: string;
  name: string;
}

export function ArtifactsView() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<Array<{ name: string; size: number; mtime: number }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [scope, setScope] = useState<ArtifactScope>({ type: "global" });

  const loadFiles = () => {
    window.api.artifacts.list(scope).then((r) => setFiles(r.files)).catch(() => {});
  };
  useEffect(() => {
    window.api.projects.list().then((rows) => {
      setProjects(rows.map((p) => ({ id: p.id, name: p.name })));
    }).catch(() => setProjects([]));
  }, []);
  useEffect(() => {
    setSelected(null);
    setContent("");
    loadFiles();
  }, [scope.type, scope.projectId]);

  const handleSelect = async (name: string) => {
    setSelected(name);
    const result = await window.api.artifacts.read(name, scope);
    if (result) {
      setContent(result.content);
      setTab("preview");
    }
  };

  const handleDelete = async (name: string) => {
    await window.api.artifacts.delete(name, scope);
    if (selected === name) { setSelected(null); setContent(""); }
    loadFiles();
  };

  const handleDownload = () => {
    if (!selected || !content) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selected;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenInDesign = async () => {
    if (!selected || !isHtml) return;
    const sessionId = await useChatStore.getState().loadModeSession("design");
    if (!sessionId) return;
    useDesignStore.getState().openArtifact(sessionId, selected, content);
    navigate("/design");
  };

  const ext = selected?.split(".").pop()?.toLowerCase() || "";
  const isHtml = ext === "html" || ext === "htm";
  const isSvg = ext === "svg";
  const isMd = ext === "md";
  const canPreview = isHtml || isSvg || isMd;

  return (
    <div className="art-view">
      <div className="chat-header">
        <div className="chat-title">Artifacts</div>
        <span className="art-view-count mono">{files.length} files</span>
        <div className="grow" />
        <select className="art-scope-select" value={scope.type === "project" ? scope.projectId || "" : "global"}
          onChange={(e) => {
            if (e.target.value === "global") setScope({ type: "global" });
            else setScope({ type: "project", projectId: e.target.value });
          }}>
          <option value="global">Global artifacts</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>
      <div className="art-view-body">
        <div className="art-view-list">
          {files.length === 0 ? (
            <p className="text-muted" style={{ padding: 12, fontSize: 12 }}>
              No artifacts yet. Save files from sessions or Cowork runs.
            </p>
          ) : (
            files.map((f) => (
              <button
                key={f.name}
                className={`art-view-item ${selected === f.name ? "art-view-item-active" : ""}`}
                onClick={() => handleSelect(f.name)}
                type="button"
              >
                <FileText size={14} strokeWidth={1.5} />
                <span className="art-view-item-name">{f.name}</span>
                <span className="art-view-item-size mono">{f.size} B</span>
                <button
                  className="art-view-item-del"
                  onClick={(e) => { e.stopPropagation(); handleDelete(f.name); }}
                  type="button"
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </button>
            ))
          )}
        </div>
        <div className="art-view-preview">
          {selected ? (
            <>
              <div className="art-view-preview-bar">
                <span className="mono">{selected}</span>
                <div className="grow" />
                {canPreview && (
                  <>
                    <button className={`art-view-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")} type="button">
                      <Eye size={12} /> Preview
                    </button>
                    <button className={`art-view-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")} type="button">
                      <Code size={12} /> Code
                    </button>
                  </>
                )}
                {isHtml && (
                  <button className="art-view-tab" onClick={handleOpenInDesign} type="button">
                    Open in Design
                  </button>
                )}
                <button className="art-view-tab" onClick={handleDownload} type="button">
                  <Download size={12} />
                </button>
              </div>
              <div className="art-view-preview-body">
                {tab === "preview" && isHtml ? (
                  <iframe srcDoc={content} sandbox="allow-scripts" className="art-view-iframe" title={selected} />
                ) : tab === "preview" && isSvg ? (
                  <div className="art-view-svg" dangerouslySetInnerHTML={{ __html: content }} />
                ) : tab === "preview" && isMd ? (
                  <div className="art-view-md">{content}</div>
                ) : (
                  <Editor
                    language={ext || "text"}
                    value={content}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      renderLineHighlight: "none",
                      lineNumbers: "on",
                      fontSize: 13,
                      smoothScrolling: true,
                    }}
                    theme="vs-dark"
                    className="art-view-code-editor"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="art-view-empty">
              <p className="text-muted">Select a file to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
