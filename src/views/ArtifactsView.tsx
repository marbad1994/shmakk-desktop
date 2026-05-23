import { useState, useEffect } from "react";
import { FileText, Trash2, Download, Eye, Code } from "lucide-react";
import { Button } from "../components/Button";
import "./ArtifactsView.css";

export function ArtifactsView() {
  const [files, setFiles] = useState<Array<{ name: string; size: number; mtime: number }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [tab, setTab] = useState<"preview" | "code">("preview");

  const loadFiles = () => {
    window.api.artifacts.list().then((r) => setFiles(r.files)).catch(() => {});
  };
  useEffect(() => { loadFiles(); }, []);

  const handleSelect = async (name: string) => {
    setSelected(name);
    const result = await window.api.artifacts.read(name);
    if (result) {
      setContent(result.content);
      setTab("preview");
    }
  };

  const handleDelete = async (name: string) => {
    await window.api.artifacts.delete(name);
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
                  <pre className="art-view-content mono">{content}</pre>
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
