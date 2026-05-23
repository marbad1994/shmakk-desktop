import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowUp, Square, Monitor, Tablet, Smartphone, History, X,
  Maximize2, Minimize2, Layout, BarChart3, Globe, FileText,
  Component, Presentation, RectangleHorizontal, PenTool,
  RefreshCw, Download, Copy, RotateCcw, ChevronDown,
} from "lucide-react";
import { DETECTION_SCRIPT } from "../services/detectionScript";
import { ElementInspector } from "../components/ElementInspector";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Composer } from "../components/Composer";
import type { ElementInfo } from "../components/ElementInspector";
import "./DesignView.css";

const DESIGN_TYPES = [
  { id: "landing-page", label: "Landing Page", icon: Globe },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "mobile-app", label: "Mobile App", icon: Smartphone },
  { id: "form", label: "Form", icon: FileText },
  { id: "component", label: "Component", icon: Component },
  { id: "presentation", label: "Presentation", icon: Presentation },
  { id: "full-page", label: "Full Page", icon: Layout },
  { id: "wireframe", label: "Wireframe", icon: RectangleHorizontal },
  { id: "custom", label: "Custom", icon: PenTool },
];

const QUICK_PROMPTS = [
  "Landing page with hero and CTA",
  "Dashboard with charts and sidebar",
  "Signup form with validation",
  "Mobile product grid screen",
  "Pricing table with 3 tiers",
];

interface Iteration {
  prompt: string;
  html: string;
  timestamp: number;
}

export function DesignView() {
  const [input, setInput] = useState("");
  const [designType, setDesignType] = useState("landing-page");
  const [generating, setGenerating] = useState(false);
  const [currentHtml, setCurrentHtml] = useState("");
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedIter, setSelectedIter] = useState<number | null>(null);
  const [inspectedElement, setInspectedElement] = useState<ElementInfo | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(42);
  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragState = useRef<{ startX: number; startRatio: number } | null>(null);

  // ── Command palette ──────────────────────────────
  const [allCommands, setAllCommands] = useState<Array<{ name: string; plugin: string; description: string }>>([]);
  const [cmdPaletteIdx, setCmdPaletteIdx] = useState(0);
  useEffect(() => { window.api.commands.list().then((r) => setAllCommands(r.commands)).catch(() => {}); }, []);
  const slashMatch = input.match(/^\/(\S*)$/);
  const showCmdPalette = !!slashMatch;
  const cmdFilter = slashMatch ? slashMatch[1].toLowerCase() : "";
  const filteredCommands = showCmdPalette ? allCommands.filter((c) => c.name.toLowerCase().includes(cmdFilter)).slice(0, 8) : [];
  useEffect(() => { setCmdPaletteIdx(0); }, [cmdFilter]);

  // ── Design token events ─────────────────────────
  useEffect(() => {
    const unsub = window.api.design.onToken((data) => {
      if (data.done) {
        setGenerating(false);
        if (data.html) {
          const html = data.html;
          setCurrentHtml(html);
          setIterations((prev) => [...prev.slice(-19), { prompt: input || prev[prev.length - 1]?.prompt || "", html, timestamp: Date.now() }]);
          renderPreview(html);
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // ── Element picker postMessage ───────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "shmakk:elementClick") {
        setInspectedElement(e.data.info as ElementInfo);
        setShowInspector(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Resize drag ──────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current || !bodyRef.current) return;
      const dx = e.clientX - dragState.current.startX;
      const newRatio = dragState.current.startRatio + (dx / bodyRef.current.offsetWidth) * 100;
      setSplitRatio(Math.max(20, Math.min(70, newRatio)));
    };
    const onUp = () => { dragState.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  const renderPreview = useCallback((html: string) => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    const injected = html.replace("</body>", DETECTION_SCRIPT + "\n</body>");
    const final = injected.includes("<body") ? injected
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body>${injected}${DETECTION_SCRIPT}</body></html>`;
    doc.open();
    doc.write(final);
    doc.close();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || generating) return;
    setGenerating(true);
    setCurrentHtml("");
    setShowInspector(false);
    setShowHistory(false);
    window.api.design.generate(text, designType);
  };

  const handleReloadPreview = () => { if (currentHtml) renderPreview(currentHtml); };
  const handleExportHtml = () => {
    if (!currentHtml) return;
    const blob = new Blob([currentHtml], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "design.html"; a.click();
  };
  const handleCopyHtml = () => navigator.clipboard.writeText(currentHtml).catch(() => {});

  const handleApplyEdit = (style: Record<string, string>, text?: string, _target?: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "shmakk:applyEdit", style, text }, "*");
  };

  const handleDeleteElement = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "shmakk:deleteElement" }, "*");
    setShowInspector(false);
  };

  const selectCommand = (cmd: typeof allCommands[number]) => { setInput(`/${cmd.name} `); inputRef.current?.focus(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCmdPalette && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCmdPaletteIdx((i) => (i + 1) % filteredCommands.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setCmdPaletteIdx((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); selectCommand(filteredCommands[cmdPaletteIdx]); return; }
      if (e.key === "Escape") { setInput(""); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  useEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const vpWidth = viewport === "mobile" ? 375 : viewport === "tablet" ? 768 : undefined;

  return (
    <div className="design-app">
      {/* ── Header (exact same as .chat-header) ── */}
      <div className="chat-header">
        <div className="chat-title">Design</div>

        <div className="design-type-selector">
          {DESIGN_TYPES.map((dt) => {
            const Icon = dt.icon;
            return (
              <button key={dt.id} className={`design-type-chip ${designType === dt.id ? "active" : ""}`} onClick={() => setDesignType(dt.id)} type="button">
                <Icon size={11} strokeWidth={1.5} />{dt.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Viewport */}
        <button className="chat-header-btn" onClick={() => setViewport("desktop")} type="button" title="Desktop" style={viewport === "desktop" ? { color: "var(--accent)" } : undefined}>
          <Monitor size={14} strokeWidth={1.5} />
        </button>
        <button className="chat-header-btn" onClick={() => setViewport("tablet")} type="button" title="Tablet" style={viewport === "tablet" ? { color: "var(--accent)" } : undefined}>
          <Tablet size={14} strokeWidth={1.5} />
        </button>
        <button className="chat-header-btn" onClick={() => setViewport("mobile")} type="button" title="Mobile" style={viewport === "mobile" ? { color: "var(--accent)" } : undefined}>
          <Smartphone size={14} strokeWidth={1.5} />
        </button>

        <button className="chat-header-btn" onClick={handleReloadPreview} type="button" title="Reload preview" disabled={!currentHtml}>
          <RefreshCw size={14} strokeWidth={1.5} />
        </button>
        <button className="chat-header-btn" onClick={() => setFullscreen(!fullscreen)} type="button" title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {fullscreen ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
        </button>
        <button className={`chat-header-btn ${showHistory ? "active" : ""}`} onClick={() => setShowHistory(!showHistory)} type="button" title="History" style={showHistory ? { background: "var(--accent-subtle)", color: "var(--accent)" } : undefined}>
          <History size={14} strokeWidth={1.5} />
          {iterations.length > 0 && <span className="design-badge">{iterations.length}</span>}
        </button>
        <button className="chat-header-btn" onClick={handleExportHtml} type="button" title="Download HTML" disabled={!currentHtml}>
          <Download size={14} strokeWidth={1.5} />
        </button>
        <button className="chat-header-btn" onClick={handleCopyHtml} type="button" title="Copy HTML" disabled={!currentHtml}>
          <Copy size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="design-body" ref={bodyRef}>
        {!fullscreen && (
          <div className="design-resize-handle"
            style={{ left: `${splitRatio}%` }}
            onMouseDown={(e) => { e.preventDefault(); dragState.current = { startX: e.clientX, startRatio: splitRatio }; }}
          />
        )}

        {/* Left: Chat panel */}
        {!fullscreen && (
          <div className="design-chat" style={{ width: `${splitRatio}%` }}>
            {showHistory && (
              <div className="design-history-panel">
                <div className="design-history-header">Iterations
                  <button className="design-close-btn" onClick={() => setShowHistory(false)} type="button"><X size={12} strokeWidth={1.5} /></button>
                </div>
                <div className="design-history-list">
                  {iterations.length === 0 ? (
                    <p className="text-muted" style={{ padding: 12, fontSize: 12 }}>No iterations yet.</p>
                  ) : iterations.map((iter, i) => (
                    <button key={i} className={`design-history-item ${i === selectedIter ? "active" : ""}`}
                      onClick={() => { setSelectedIter(i); setCurrentHtml(iter.html); renderPreview(iter.html); setShowHistory(false); }}
                      type="button">
                      <span className="design-history-num">#{iterations.length - i}</span>
                      <span className="design-history-prompt">{iter.prompt.slice(0, 60)}</span>
                      <button className="design-history-revert" onClick={(e) => { e.stopPropagation(); const it = iterations[i]; if (it) { setCurrentHtml(it.html); renderPreview(it.html); } }}
                        title="Revert" type="button"><RotateCcw size={10} strokeWidth={1.5} /></button>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!currentHtml && !generating && (
              <div className="design-quick-prompts">
                {QUICK_PROMPTS.map((qp) => (
                  <button key={qp} className="design-quick-chip" onClick={() => setInput(qp)} type="button">{qp}</button>
                ))}
              </div>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              placeholder="Describe your design..."
              generating={generating}
              onStop={() => setGenerating(false)}
            >
              {showCmdPalette && filteredCommands.length > 0 && (
                <div className="cmd-palette">
                  {filteredCommands.map((cmd, i) => (
                    <button key={cmd.name} className={`cmd-palette-item ${i === cmdPaletteIdx ? "cmd-palette-item-active" : ""}`}
                      onClick={() => selectCommand(cmd)} type="button">
                      <span className="cmd-palette-name mono">/{cmd.name}</span>
                      <span className="cmd-palette-desc">{cmd.description || cmd.plugin}</span>
                    </button>
                  ))}
                </div>
              )}
            </Composer>
          </div>
        )}

        {/* Right: Preview */}
        <div className="design-preview" style={fullscreen ? { width: "100%" } : { width: `${100 - splitRatio}%` }}>
          <div className="design-preview-frame" style={viewport !== "desktop" ? { maxWidth: vpWidth, margin: "0 auto" } : undefined}>
            {!currentHtml && !generating ? (
              <div className="design-preview-empty">
                <div className="design-preview-empty-icon"><Layout size={32} strokeWidth={1} /></div>
                <h3>Design preview</h3>
                <p>Enter a prompt to generate a design. Right-click elements to inspect and edit styles.</p>
              </div>
            ) : (
              <iframe ref={iframeRef} className="design-iframe" title="Design Preview" sandbox="allow-scripts allow-same-origin" />
            )}
          </div>

          {showInspector && inspectedElement && (
            <div className="elem-inspector-overlay">
            <ElementInspector element={inspectedElement} onApplyEdit={handleApplyEdit}
              onSave={() => {}}
              onDelete={handleDeleteElement}
              onAskAI={(prompt) => { setInput(prompt); setShowInspector(false); }} onClose={() => setShowInspector(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
