import { useState, useEffect, useRef, useCallback } from "react";
import {
  Monitor, Tablet, Smartphone, History, X,
  Maximize2, Minimize2, Layout, BarChart3, Globe, FileText,
  Component, Presentation, RectangleHorizontal, PenTool,
  RefreshCw, Download, Copy, RotateCcw, Zap,
} from "lucide-react";
import { useDesignStore } from "../stores/designStore";
import { useChatStore } from "../stores/chatStore";
import { DETECTION_SCRIPT } from "../services/detectionScript";
import { ElementInspector } from "../components/ElementInspector";
import { Composer } from "../components/Composer";
import type { ElementInfo } from "../components/ElementInspector";

import "./DesignView.css";

const DESIGN_TYPES = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3, desc: "Data-heavy product screens" },
  { id: "landing", label: "Landing", icon: Globe, desc: "Marketing pages and launches" },
  { id: "presentation", label: "Deck", icon: Presentation, desc: "Slides and pitch decks" },
  { id: "form", label: "Form", icon: FileText, desc: "Signup, checkout, onboarding" },
  { id: "component", label: "Component", icon: Component, desc: "Cards, modals, widgets" },
  { id: "page", label: "Page", icon: Layout, desc: "Full product or content pages" },
  { id: "wireframe", label: "Wireframe", icon: RectangleHorizontal, desc: "Structure before visual detail" },
  { id: "custom", label: "Custom", icon: PenTool, desc: "Specific visual brief" },
];

const DESIGN_PRESETS = [
  {
    label: "Analytics Dashboard",
    type: "dashboard",
    icon: BarChart3,
    prompt: "A modern analytics dashboard with sidebar navigation, KPI cards showing revenue/users/conversion, and a chart area with line and bar charts",
  },
  {
    label: "SaaS Landing Page",
    type: "landing",
    icon: Zap,
    prompt: "A SaaS landing page with a dark gradient hero, feature cards in a 3-column grid, pricing table with 3 tiers, and a newsletter CTA footer",
  },
  {
    label: "Pitch Deck",
    type: "presentation",
    icon: Presentation,
    prompt: "A professional presentation with dark theme - slide 1: title, slide 2: problem statement, slide 3: solution with 3 pillars, slide 4: metrics and traction, slide 5: roadmap and next steps",
  },
  {
    label: "Checkout Form",
    type: "form",
    icon: FileText,
    prompt: "A mobile-first checkout form with shipping address, payment method selector (card/PayPal), order summary sidebar, and a clean progress indicator at top",
  },
];

const PLACEHOLDERS: Record<string, string> = {
  dashboard: 'Describe your dashboard, e.g. "sales analytics with revenue charts and regional map"',
  landing: 'Describe your landing page, e.g. "SaaS hero, features, pricing, CTA"',
  presentation: 'Describe your deck, e.g. "5-slide quarterly review with KPIs and roadmap"',
  form: 'Describe your form, e.g. "checkout with shipping, payment, order summary"',
  component: 'Describe your component, e.g. "profile card with avatar, stats, follow button"',
  page: 'Describe your page, e.g. "blog homepage with featured posts and newsletter"',
  wireframe: 'Describe your wireframe, e.g. "mobile onboarding flow with 3 steps"',
  custom: "Describe exactly what you want to design.",
};

function PaletteIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="10.5" r="2" />
      <circle cx="8.5" cy="7.5" r="2" />
      <circle cx="6.5" cy="12.5" r="2" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.86-.13 2.75-.38A10.02 10.02 0 0 0 22 12c0-5.5-4.5-10-10-10z" />
    </svg>
  );
}

interface Iteration {
  prompt: string;
  html: string;
  timestamp: number;
}

export function DesignView() {
  const [input, setInput] = useState("");
  const [designType, setDesignType] = useState("");
  // Use design store for state that survives tab switches
  const generating = useDesignStore((s) => s.streaming);
  const currentHtml = useDesignStore((s) => s.currentHtml);
  const generationError = useDesignStore((s) => s.error);
  const iterationsHistory = useDesignStore((s) => s.history);
  const setDesignHtml = useDesignStore((s) => s.setCurrentHtml);
  const setDesignStreaming = useDesignStore((s) => s.setStreaming);
  const setDesignError = useDesignStore((s) => s.setError);
  const currentPrompt = useDesignStore((s) => s.currentPrompt);
  // Convert store entries to Iteration format for rendering
  const iterations: Iteration[] = iterationsHistory.map((e) => ({
    prompt: e.prompt, html: e.html, timestamp: e.createdAt,
  }));
  const [showHistory, setShowHistory] = useState(false);
  const [selectedIter, setSelectedIter] = useState<number | null>(null);
  const [inspectedElement, setInspectedElement] = useState<ElementInfo | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(34);
  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  // ── Session change detection ────────────────────
  const activeId = useChatStore((s) => s.activeId);
  useEffect(() => {
    useDesignStore.getState().setActiveSession(activeId);
    setInput("");
    setShowHistory(false);
    setShowInspector(false);
    if (!activeId) {
      setDesignHtml("");
      setDesignError(null);
      setDesignStreaming(false);
    }
    if (!useDesignStore.getState().currentHtml) {
      prevHtmlRef.current = "";
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        doc.open();
        doc.write("");
        doc.close();
      }
    }
  }, [activeId, setDesignHtml, setDesignError, setDesignStreaming]);

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

    // Safety: validate that content looks like HTML before rendering
    const looksLikeHtml = /<(html|body|div|head|style|script|meta|link|span|p|h[1-6]|section|header|nav|main|footer|article|table|form|input|button|a|img|svg|canvas|ul|ol|li)/i.test(html);
    if (!looksLikeHtml) {
      // Show error state instead of rendering prose as HTML
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui,sans-serif;background:#1a1a1e;color:#a0a0a0}div{max-width:400px;text-align:center;padding:24px}h3{color:#d4a373;margin:0 0 8px}p{margin:0;font-size:13px;line-height:1.5}</style></head><body><div><h3>Invalid output</h3><p>The agent returned text instead of HTML. Try a different prompt or design type.</p></div></body></html>`);
      doc.close();
      return;
    }

    const deviceScrollHide = viewport === "desktop"
      ? ""
      : `
      <style>
        html, body {
          scrollbar-width: none;
          -ms-overflow-style: none;
          overflow: hidden;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          display: none;
        }
      </style>
      `;
    const injected = html.replace("</body>", `
      ${deviceScrollHide}
      ${DETECTION_SCRIPT}
      </body>`);
    const final = injected.includes("<body") ? injected
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif${viewport === "desktop" ? "" : ";overflow:hidden;scrollbar-width:none;-ms-overflow-style:none"} } body::-webkit-scrollbar{${viewport === "desktop" ? "" : "display:none;"}}</style></head><body>${injected}${DETECTION_SCRIPT}</body></html>`;
    doc.open();
    doc.write(final);
    doc.close();
  }, [viewport]);

  // Token events are handled at store level (survives tab switches).
  // When the store gets new HTML, render it in the preview.
  const prevHtmlRef = useRef(currentHtml);
  useEffect(() => {
    if (!currentHtml) {
      prevHtmlRef.current = "";
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        doc.open();
        doc.write("");
        doc.close();
      }
      return;
    }
    prevHtmlRef.current = currentHtml;
    renderPreview(currentHtml);
  }, [currentHtml, viewport, renderPreview]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || generating) return;
    const activeHtml = currentHtml;
    const effectiveType = designType || "custom";
    const promptWithContext = activeHtml
      ? `${text}\n\nExisting design HTML to update:\n\`\`\`html\n${activeHtml.slice(0, 20000)}\n\`\`\``
      : text;
    setDesignStreaming(true);
    setDesignError(null);
    setDesignHtml("");
    useDesignStore.getState().setCurrentPrompt(text);
    useDesignStore.getState().setCurrentDesignType(effectiveType);
    setShowInspector(false);
    setShowHistory(false);
    setInput("");
    window.api.design.generate(promptWithContext, effectiveType).then((result) => {
      if (result.error) {
        setDesignStreaming(false);
        setDesignError(result.error);
      }
    }).catch((err) => {
      setDesignStreaming(false);
      setDesignError(err instanceof Error ? err.message : String(err));
    });
  };

  const handleReloadPreview = () => { if (currentHtml) renderPreview(currentHtml); };
  const handleExportHtml = () => {
    if (!currentHtml) return;
    const blob = new Blob([currentHtml], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "design.html"; a.click();
  };
  const handleCopyHtml = () => navigator.clipboard.writeText(currentHtml).catch(() => {});
  const applyPreset = (preset: typeof DESIGN_PRESETS[number]) => {
    setDesignType((current) => (current === preset.type ? "" : preset.type));
    setInput(preset.prompt);
  };

  const handleApplyEdit = (style: Record<string, string>, text?: string, _target?: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "shmakk:applyEdit", style, text }, "*");
  };

  const handleDeleteElement = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "shmakk:deleteElement" }, "*");
    setShowInspector(false);
  };

  const handleSaveEdit = async () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const html = doc.documentElement.outerHTML;
    const prompt = useDesignStore.getState().currentPrompt;
    const currentType = useDesignStore.getState().currentDesignType;
    const activeSession = useChatStore.getState().activeId;

    useDesignStore.getState().addEntry({
      id: "",
      prompt: prompt || "",
      html,
      designType: currentType || "",
      createdAt: Date.now(),
    });

    const slug = (prompt || currentType || "design")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "design";
    const fileName = `${Date.now()}-${slug}-edited.html`;
    if (activeSession && !activeSession.startsWith("conv-")) {
      await window.api.sessionFiles.saveCopy(activeSession, fileName, html).catch(() => {});
    }
    try {
      const projects = await window.api.projects.getForSession(activeSession || "");
      const project = projects.find((p) => p.settings?.shareArtifacts !== false);
      if (project) {
        await window.api.artifacts.save(fileName, html, { type: "project", projectId: project.id });
      } else {
        await window.api.artifacts.save(fileName, html, { type: "global" });
      }
    } catch {
      await window.api.artifacts.save(fileName, html, { type: "global" }).catch(() => {});
    }
  };

  const selectCommand = (cmd: typeof allCommands[number]) => { setInput(`/${cmd.name} `); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCmdPalette && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdPaletteIdx((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdPaletteIdx((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(filteredCommands[cmdPaletteIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
      }
    }
  };


  return (
    <div className="design-app">
      <div className="chat-header">
        <div className="chat-title">Design</div>
        <div style={{ flex: 1 }} />
        <button className={`chat-header-btn ${showHistory ? "active" : ""}`} onClick={() => setShowHistory(!showHistory)} type="button" title="History" style={showHistory ? { background: "var(--accent-subtle)", color: "var(--accent)" } : undefined}>
          <History size={14} strokeWidth={1.5} />
          {iterations.length > 0 && <span className="design-badge">{iterations.length}</span>}
        </button>
      </div>

      <div className="design-body" ref={bodyRef}>
        {!fullscreen && (
          <div className="design-resize-handle"
            style={{ left: `${splitRatio}%` }}
            onMouseDown={(e) => { e.preventDefault(); dragState.current = { startX: e.clientX, startRatio: splitRatio }; }}
          />
        )}

        {!fullscreen && (
          <div className="design-chat" style={{ width: `${splitRatio}%` }}>
            <div className="design-type-selector">
              {DESIGN_TYPES.map((dt) => {
                const Icon = dt.icon;
                return (
                    <button key={dt.id} className={`design-type-chip ${designType === dt.id ? "active" : ""}`} onClick={() => setDesignType((current) => (current === dt.id ? "" : dt.id))} type="button" title={dt.desc}>
                    <Icon size={13} strokeWidth={1.5} />
                    <span>{dt.label}</span>
                  </button>
                );
              })}
            </div>

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
                      onClick={() => { setSelectedIter(i); setDesignHtml(iter.html); renderPreview(iter.html); setShowHistory(false); }}
                      type="button">
                      <span className="design-history-num">#{iterations.length - i}</span>
                      <span className="design-history-prompt">{iter.prompt.slice(0, 60)}</span>
                      <button className="design-history-revert" onClick={(e) => { e.stopPropagation(); const it = iterations[i]; if (it) { setDesignHtml(it.html); renderPreview(it.html); } }}
                        title="Revert" type="button"><RotateCcw size={10} strokeWidth={1.5} /></button>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="design-chat-scroll">
              {!currentHtml && !generating && !currentPrompt ? (
                <div className="design-welcome">
                  <div className="design-welcome-icon"><PaletteIcon /></div>
                  <h3>Design Studio</h3>
                  <p>Describe what you want to build and watch it come to life in the preview.</p>
                  <div className="design-quick-prompts">
                    {DESIGN_PRESETS.map((preset) => {
                      const Icon = preset.icon;
                      return (
                        <button key={preset.label} className="design-quick-prompt" onClick={() => applyPreset(preset)} type="button">
                          <Icon size={14} strokeWidth={1.5} />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="design-message-list">
                  {currentPrompt && (
                    <div className="design-msg design-msg-user">
                      <span className="design-msg-label">You</span>
                      <p>{currentPrompt}</p>
                    </div>
                  )}
                  <div className="design-msg design-msg-assistant">
                    <span className="design-msg-label">Design</span>
                    <p>{generating ? "Generating the preview..." : currentHtml ? "Preview generated. Inspect elements in the canvas or iterate from the prompt." : "Ready."}</p>
                  </div>
                </div>
              )}
            </div>

            {generationError && (
              <div className="design-error" role="alert">{generationError}</div>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              placeholder={PLACEHOLDERS[designType] || PLACEHOLDERS.custom}
              generating={generating}
              onStop={() => setDesignStreaming(false)}
              onKeyDown={handleKeyDown}
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

            {showInspector && inspectedElement && (
              <div className="design-inspector-overlay">
                <ElementInspector element={inspectedElement} onApplyEdit={handleApplyEdit}
                  onSave={handleSaveEdit}
                  onDelete={handleDeleteElement}
                  onAskAI={(prompt) => { setInput(prompt); setShowInspector(false); }} onClose={() => setShowInspector(false)} />
              </div>
            )}
          </div>
        )}

        <div className="design-preview" style={fullscreen ? { width: "100%" } : { width: `${100 - splitRatio}%` }}>
          <div className="design-preview-header">
            <span className={`design-preview-status ${generating ? "streaming" : ""}`}>{generating ? "Generating" : currentHtml ? "Preview" : "Ready"}</span>
            <div className="design-preview-actions">
              <button className={`design-action-btn ${viewport === "desktop" ? "active" : ""}`} onClick={() => setViewport("desktop")} type="button" title="Desktop">
                <Monitor size={14} strokeWidth={1.5} />
              </button>
              <button className={`design-action-btn ${viewport === "tablet" ? "active" : ""}`} onClick={() => setViewport("tablet")} type="button" title="Tablet">
                <Tablet size={14} strokeWidth={1.5} />
              </button>
              <button className={`design-action-btn ${viewport === "mobile" ? "active" : ""}`} onClick={() => setViewport("mobile")} type="button" title="Mobile">
                <Smartphone size={14} strokeWidth={1.5} />
              </button>
              <button className="design-action-btn" onClick={handleReloadPreview} type="button" title="Reload preview" disabled={!currentHtml}>
                <RefreshCw size={14} strokeWidth={1.5} />
              </button>
              <button className="design-action-btn" onClick={handleCopyHtml} type="button" title="Copy HTML" disabled={!currentHtml}>
                <Copy size={14} strokeWidth={1.5} />
              </button>
              <button className="design-action-btn" onClick={handleExportHtml} type="button" title="Download HTML" disabled={!currentHtml}>
                <Download size={14} strokeWidth={1.5} />
              </button>
              <button className="design-action-btn" onClick={() => setFullscreen(!fullscreen)} type="button" title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {fullscreen ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
          <div className={`design-preview-frame ${viewport === "tablet" ? "tablet-frame" : ""} ${viewport === "mobile" ? "mobile-frame" : ""}`}>
            {!currentHtml ? (
              <div className="design-preview-empty">
                <div className="design-preview-empty-icon"><PaletteIcon size={34} /></div>
                <h3>{generating ? "Generating preview" : "Design preview"}</h3>
                <p>{generating ? "The design will render here as soon as HTML is ready." : "Use a preset or write a brief. The preview updates here when generation completes."}</p>
              </div>
            ) : (
              viewport === "desktop" ? (
                <iframe ref={iframeRef} className="design-iframe" title="Design Preview" sandbox="allow-scripts allow-same-origin" />
              ) : (
                <div className={`design-device-mockup ${viewport === "mobile" ? "mobile-mockup" : "tablet-mockup"}`}>
                  {viewport === "mobile" && <div className="mockup-notch" />}
                  <div className="mockup-screen">
                    <iframe ref={iframeRef} className="design-iframe" title="Design Preview" sandbox="allow-scripts allow-same-origin" />
                  </div>
                </div>
              )
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
