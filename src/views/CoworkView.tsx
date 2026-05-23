import { useState, useEffect, useRef } from "react";
import {
  ArrowUp,
  Puzzle,
  Clock,
  FileText,
  BarChart3,
  X,
  FolderOpen,
  Trash2,
  Package,
  Play,
  Square,
  Check,
  AlertTriangle,
  ChevronDown,
  Zap,
  Activity,
  Download,
  Copy,
  PenSquare,
  Save,
} from "lucide-react";
import { Button } from "../components/Button";
import { StatusDot } from "../components/StatusDot";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Composer } from "../components/Composer";
import { useCoworkStore } from "../stores/coworkStore";
import type { CoworkActivity, CoworkFileChange } from "../stores/coworkStore";
import { usePluginStore } from "../stores/pluginStore";
import { useSettingsStore } from "../stores/settingsStore";
import "./CoworkView.css";

type ViewMode = "home" | "schedule-new";

const PROFILES = ["balanced", "tiny", "deep", "builder"];

const QUICK_ACTIONS = [
  {
    id: "qa-1",
    icon: Puzzle,
    label: "Create plugin",
    fill: "I want to create a plugin. Here's what it should do: ",
    kind: "create-plugin" as const,
  },
  {
    id: "qa-2",
    icon: Clock,
    label: "Schedule task",
    fill: "",
    kind: "schedule" as const,
  },
  {
    id: "qa-3",
    icon: FileText,
    label: "Generate report",
    fill: "Generate a detailed report on ",
    kind: "report" as const,
  },
  {
    id: "qa-4",
    icon: BarChart3,
    label: "Analyze data",
    fill: "Analyze the codebase in this workspace. Find patterns, issues, and optimization opportunities. ",
    kind: "analyze" as const,
  },
];

export function CoworkView() {
  const [view, setView] = useState<ViewMode>("home");
  const [composerInput, setComposerInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrompt, setModalPrompt] = useState("");
  const [modalKind, setModalKind] = useState<string>("");
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [scaffoldFiles, setScaffoldFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [scaffoldDir, setScaffoldDir] = useState<string>("");
  const [scaffoldName, setScaffoldName] = useState<string>("");
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldInstalling, setScaffoldInstalling] = useState(false);
  const [selectedScaffoldFile, setSelectedScaffoldFile] = useState<string | null>(null);

  // Command palette
  const [allCommands, setAllCommands] = useState<Array<{ name: string; plugin: string; description: string }>>([]);
  const [cmdPaletteIdx, setCmdPaletteIdx] = useState(0);
  const [profile, setProfile] = useState("balanced");
  const [selectedFile, setSelectedFile] = useState<CoworkFileChange | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Schedule state
  const [schedules, setSchedules] = useState<Array<{
    id: string; name: string; when: string; cron: string; prompt: string; profile: string;
    enabled: boolean; lastRun: number | null; nextRun: number | null; createdAt: number;
  }>>([]);
  const [schedName, setSchedName] = useState("");
  const [schedWhen, setSchedWhen] = useState("every Monday at 9am");
  const [schedPrompt, setSchedPrompt] = useState("");
  const [schedProfile, setSchedProfile] = useState("balanced");
  const [schedSaving, setSchedSaving] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // Plugin editing state
  const [editingPlugin, setEditingPlugin] = useState<{ name: string; files: Array<{ path: string; content: string }> } | null>(null);
  const [editFilePath, setEditFilePath] = useState<string | null>(null);
  const [editFileContent, setEditFileContent] = useState("");

  useEffect(() => {
    window.api.schedules.list().then(setSchedules).catch(() => {});
    window.api.commands.list().then((r) => setAllCommands(r.commands)).catch(() => {});
  }, []);

  // Command palette
  const slashMatch = composerInput.match(/^\/(\S*)$/);
  const showCmdPalette = !!slashMatch;
  const cmdFilter = slashMatch ? slashMatch[1].toLowerCase() : "";
  const filteredCommands = showCmdPalette
    ? allCommands.filter((c) => c.name.toLowerCase().includes(cmdFilter)).slice(0, 8)
    : [];
  useEffect(() => { setCmdPaletteIdx(0); }, [cmdFilter]);

  const selectCommand = (cmd: typeof allCommands[number]) => {
    setComposerInput(`/${cmd.name} `);
  };

  const handleCreateSchedule = async () => {
    if (!schedName.trim() || !schedPrompt.trim() || !schedWhen.trim()) return;
    setSchedSaving(true);
    const result = await window.api.schedules.create({
      name: schedName.trim(),
      when: schedWhen.trim(),
      prompt: schedPrompt.trim(),
      profile: schedProfile,
    });
    setSchedSaving(false);
    if (result.schedule) {
      setSchedules((prev) => [...prev, result.schedule!]);
      setView("home");
    }
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    await window.api.schedules.toggle(id, enabled);
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, enabled } : s));
  };

  const handleUpdateSchedule = async () => {
    if (!editingScheduleId || !schedName.trim()) return;
    setSchedSaving(true);
    await window.api.schedules.update(editingScheduleId, {
      name: schedName.trim(),
      when: schedWhen.trim(),
      prompt: schedPrompt.trim(),
      profile: schedProfile,
    });
    // Refresh
    const updated = await window.api.schedules.list();
    setSchedules(updated);
    setSchedSaving(false);
    setEditingScheduleId(null);
    setView("home");
  };

  const handleOpenScheduleEdit = (sched: typeof schedules[number]) => {
    setEditingScheduleId(sched.id);
    setSchedName(sched.name);
    setSchedWhen(sched.when || sched.cron);
    setSchedPrompt(sched.prompt);
    setSchedProfile(sched.profile);
    setView("schedule-new");
  };

  const handleRunScheduleNow = (sched: typeof schedules[number]) => {
    startRun({ prompt: sched.prompt, profile: sched.profile || "balanced", autoApprove: true });
    setInstallFeedback(`Running: ${sched.name}`);
    setTimeout(() => setInstallFeedback(null), 3000);
  };

  const handleDeleteSchedule = async (id: string) => {
    await window.api.schedules.delete(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  // Plugin editing
  const handleEditPlugin = async (name: string) => {
    const result = await window.api.plugins.readFiles(name);
    if (result.files) {
      setEditingPlugin({ name, files: result.files });
      setEditFilePath(null);
    }
  };

  const handleSavePluginFile = async () => {
    if (!editingPlugin || !editFilePath) return;
    await window.api.plugins.writeFile(editingPlugin.name, editFilePath, editFileContent);
    // Refresh file list
    const result = await window.api.plugins.readFiles(editingPlugin.name);
    if (result.files) setEditingPlugin({ name: editingPlugin.name, files: result.files });
  };

  // Cowork store
  const runs = useCoworkStore((s) => s.runs);
  const activeRunId = useCoworkStore((s) => s.activeRunId);
  const autoApprove = useCoworkStore((s) => s.autoApprove);
  const startRun = useCoworkStore((s) => s.startRun);
  const cancelRun = useCoworkStore((s) => s.cancelRun);
  const selectRun = useCoworkStore((s) => s.selectRun);
  const pushActivity = useCoworkStore((s) => s.pushActivity);
  const finishRun = useCoworkStore((s) => s.finishRun);
  const cancelRunDone = useCoworkStore((s) => s.cancelRunDone);
  const failRun = useCoworkStore((s) => s.failRun);
  const setAutoApprove = useCoworkStore((s) => s.setAutoApprove);

  // Plugin store
  const plugins = usePluginStore((s) => s.plugins);
  const pluginLoaded = usePluginStore((s) => s.loaded);
  const pluginError = usePluginStore((s) => s.installError);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);
  const installFromFolder = usePluginStore((s) => s.installFromFolder);
  const uninstallPlugin = usePluginStore((s) => s.uninstallPlugin);
  const clearPluginError = usePluginStore((s) => s.clearError);

  // Settings
  const endpoints = useSettingsStore((s) => s.endpoints);
  const providerId = useSettingsStore((s) => s.providerId);
  const saveModel = useSettingsStore((s) => s.saveModel);
  const [modelDropOpen, setModelDropOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  const activeRun = runs.find((r) => r.id === activeRunId);
  const runningRuns = runs.filter((r) => r.status === "running");

  useEffect(() => {
    if (!pluginLoaded) loadPlugins();
  }, [pluginLoaded, loadPlugins]);

  // IPC event listeners
  useEffect(() => {
    const unsubActivity = window.api.cowork.onActivity((data) => {
      pushActivity(data);
    });
    const unsubDone = window.api.cowork.onDone((data) => {
      if (data.cancelled) cancelRunDone(data.runId);
      else finishRun(data.runId, data.reply || "", data.edits as CoworkFileChange[]);
    });
    const unsubError = window.api.cowork.onError((data) => {
      failRun(data.runId, data.error);
    });
    return () => {
      unsubActivity();
      unsubDone();
      unsubError();
    };
  }, [pushActivity, finishRun, cancelRunDone, failRun]);

  // Auto-scroll activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeRun?.activity]);

  // Model selector click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelDropOpen(false);
      }
    };
    if (modelDropOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelDropOpen]);

  /* ── Handlers ──────────────────────────────────── */

  const handleSend = () => {
    const text = composerInput.trim();
    if (!text || runningRuns.length > 0) return;
    setComposerInput("");
    startRun({ prompt: text, profile, autoApprove });
  };

  const handleQuickAction = (qa: typeof QUICK_ACTIONS[number]) => {
    if (qa.kind === "schedule") {
      setView("schedule-new");
      return;
    }
    setModalKind(qa.kind);
    setModalPrompt(qa.fill);
    setModalOpen(true);
  };

  const handleScheduleAfterInstall = () => {
    const pluginName = modalPrompt; // stored from install flow
    setModalOpen(false);
    setSchedName(pluginName || "Plugin run");
    setSchedWhen("every Monday at 9am");
    setSchedPrompt(`Run the "${pluginName}" plugin tasks automatically.`);
    setEditingScheduleId(null);
    setView("schedule-new");
  };

  const handleModalSend = async () => {
    if (!modalPrompt.trim()) return;

    if (modalKind === "schedule-plugin") {
      handleScheduleAfterInstall();
      return;
    }

    if (modalKind === "create-plugin") {
      setScaffolding(true);
      setScaffoldFiles([]);
      setScaffoldName("");
      setSelectedScaffoldFile(null);
      const name = scaffoldName.trim() || undefined;
      const result = await window.api.plugins.scaffold(modalPrompt, name);
      setScaffolding(false);
      if (result.ok && result.files) {
        setScaffoldFiles(result.files);
        setScaffoldDir(result.pluginDir || "");
        setScaffoldName(result.pluginName || "");
      } else {
        setInstallFeedback(result.error || "Scaffold failed");
      }
      return;
    }

    setModalOpen(false);
    setComposerInput(modalPrompt);
    startRun({ prompt: modalPrompt, profile, autoApprove });
  };

  const handleInstallScaffold = async () => {
    if (!scaffoldDir) return;
    setScaffoldInstalling(true);
    const result = await window.api.plugins.installScaffolded(scaffoldDir);
    setScaffoldInstalling(false);
    if (result.installed) {
      setInstallFeedback(`Installed "${result.installed.name}" with ${result.installed.skills.length} skill(s).`);
      loadPlugins();
      // Offer to schedule it
      setModalKind("schedule-plugin");
      setModalPrompt(result.installed.name);
    } else {
      setInstallFeedback(result.error || "Install failed");
    }
    setScaffoldFiles([]);
    setScaffoldDir("");
    setModalOpen(false);
  };

  const handleInstallPlugin = async () => {
    setInstallFeedback(null);
    clearPluginError();
    const result = await installFromFolder();
    if (result.error) setInstallFeedback(result.error);
    else if (result.installed) {
      setInstallFeedback(
        `Installed "${result.installed.name}" with ${result.installed.skills.length} skill(s).`,
      );
    }
  };

  const handleUninstall = async (name: string) => {
    const ok = await uninstallPlugin(name);
    if (ok) setInstallFeedback(`Uninstalled "${name}".`);
  };

  /* ── Activity icon ─────────────────────────────── */

  const activityIcon = (action: string) => {
    switch (action) {
      case "done": return <Check size={10} strokeWidth={2} />;
      case "error": return <AlertTriangle size={10} strokeWidth={2} />;
      case "tool": return <Play size={10} strokeWidth={2} />;
      default: return <Activity size={10} strokeWidth={1.5} />;
    }
  };

  const activityIconClass = (action: string) => {
    if (action === "done") return "activity-icon-done";
    if (action === "error") return "activity-icon-error";
    if (action === "tool") return "activity-icon-run";
    return "activity-icon-gather";
  };

  /* ── Schedule new view ─────────────────────────── */

  if (view === "schedule-new") {
    return (
      <div className="cw-app">
        <div className="chat-header">
          <button className="cw-back" onClick={() => setView("home")} type="button">Back</button>
          <div className="chat-title">{editingScheduleId ? "Edit schedule" : "New scheduled job"}</div>
        </div>
        <div className="cw-body">
          <div className="sched-detail">
            <div className="sched-detail-body">
              <div className="sched-detail-row">
                <div className="sched-field">
                  <label>Name</label>
                  <input type="text" placeholder="e.g. Weekly digest" value={schedName} onChange={(e) => setSchedName(e.target.value)} />
                </div>
                <div className="sched-field">
                  <label>Recurrence</label>
                  <input type="text" placeholder="every Monday at 9am" value={schedWhen} onChange={(e) => setSchedWhen(e.target.value)} />
                </div>
              </div>
              <div className="sched-field">
                <label>Prompt</label>
                <textarea rows={3} placeholder="What should the agent do on this schedule?" value={schedPrompt} onChange={(e) => setSchedPrompt(e.target.value)} />
              </div>
              <div className="cron-presets">
                {["every day at 9am", "every Monday at 9am", "every Friday at 5pm", "monthly on the 1st at midnight"].map((when) => (
                  <button key={when} className={`cron-chip ${schedWhen === when ? "cron-chip-active" : ""}`} type="button" onClick={() => setSchedWhen(when)}>{when}</button>
                ))}
              </div>
              <div className="sched-detail-row" style={{ marginTop: 20 }}>
                <div className="sched-field">
                  <label>Profile</label>
                  <select value={schedProfile} onChange={(e) => setSchedProfile(e.target.value)}>
                    {PROFILES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="sched-field">
                  <label>Output</label>
                  <select defaultValue="file">
                    <option value="file">Save as file in workspace</option>
                    <option value="show">Show me here</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sched-detail-actions">
              {editingScheduleId ? (
                <>
                  <Button variant="primary" size="sm" onClick={handleUpdateSchedule} disabled={schedSaving}>{schedSaving ? "Saving..." : "Update schedule"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingScheduleId(null); setView("home"); }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button variant="primary" size="sm" onClick={handleCreateSchedule} disabled={schedSaving}>{schedSaving ? "Creating..." : "Create schedule"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setView("home")}>Cancel</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Home ──────────────────────────────────────── */

  return (
    <div className="cw-app">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">
          <span>Cowork</span>
          <span className="cw-sub mono">
            {runningRuns.length > 0
              ? `${runningRuns.length} task${runningRuns.length !== 1 ? "s" : ""} running`
              : "Agent workspace"}
          </span>
        </div>
        <div className="cw-header-pills">
          {/* Auto-pilot toggle */}
          <button
            className={`meta-pill ${autoApprove ? "active" : ""}`}
            onClick={() => setAutoApprove(!autoApprove)}
            type="button"
          >
            <Zap size={11} strokeWidth={1.5} />
            {autoApprove ? "Auto-pilot on" : "Auto-pilot off"}
          </button>
          {/* Stop all */}
          {runningRuns.length > 0 && (
            <button
              className="stop-btn"
              onClick={() => runningRuns.forEach((r) => cancelRun(r.id))}
              type="button"
            >
              <Square size={11} strokeWidth={2} fill="currentColor" /> Stop all
            </button>
          )}
          {plugins.length > 0 && (
            <span className="meta-pill">
              {plugins.length} plugin{plugins.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            className="plugin-install-btn"
            type="button"
            onClick={handleInstallPlugin}
          >
            <FolderOpen size={13} strokeWidth={1.5} />
            <span>Install plugin</span>
          </button>
        </div>
      </div>

      <div className="cw-body">
        {/* Install feedback */}
        {(installFeedback || pluginError) && (
          <div className={`cw-install-feedback ${pluginError ? "cw-feedback-err" : "cw-feedback-ok"}`}>
            <span>{pluginError || installFeedback}</span>
            <button className="cw-feedback-dismiss" type="button" onClick={() => { setInstallFeedback(null); clearPluginError(); }}>
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Active run detail */}
        {activeRun && (
          <div className="cw-section">
            <div className="cw-section-title">
              {activeRun.status === "running" ? "Running" : activeRun.status === "done" ? "Completed" : activeRun.status}
              <span className="cw-section-count mono">{activeRun.id}</span>
              {/* Run tabs */}
              <div className="grow" />
              {runs.length > 1 && (
                <div className="cw-run-tabs">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      className={`cw-run-tab ${r.id === activeRunId ? "cw-run-tab-active" : ""}`}
                      onClick={() => selectRun(r.id)}
                      type="button"
                    >
                      <StatusDot
                        variant={r.status === "running" ? "online" : r.status === "done" ? "accent" : r.status === "error" ? "busy" : "offline"}
                        size={5}
                      />
                      {r.prompt.slice(0, 20)}...
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Activity feed */}
            {activeRun.activity.length > 0 && (
              <div className="activity-feed">
                {activeRun.activity.map((a: CoworkActivity, i: number) => (
                  <div key={i} className="activity-row">
                    <span className="activity-time mono">{a.time}</span>
                    <span className={`activity-icon ${activityIconClass(a.action)}`}>
                      {activityIcon(a.action)}
                    </span>
                    <span className="activity-text">{a.detail}</span>
                  </div>
                ))}
                <div ref={activityEndRef} />
              </div>
            )}

            {/* Done: show reply + files */}
            {activeRun.status === "done" && (
              <>
                {activeRun.reply && (
                  <div className="cw-run-reply">
                    <MarkdownRenderer content={activeRun.reply} className="msg-text" />
                  </div>
                )}
                <div className="cw-run-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      let output = `# Cowork Run Output\n\n**Prompt:** ${activeRun.prompt}\n\n`;
                      if (activeRun.reply) output += `${activeRun.reply}\n\n`;
                      for (const f of activeRun.fileChanges) {
                        output += `### ${f.path} (${f.status})\n\n\`\`\`\n${f.content || "(empty)"}\n\`\`\`\n\n`;
                      }
                      const blob = new Blob([output], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `cowork-output-${activeRun.id}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={12} /> Save output
                  </Button>
                  {activeRun.fileChanges.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const zipContent = activeRun.fileChanges
                          .map((f) => `// ${f.path} (${f.status})\n${f.content}`)
                          .join("\n\n---\n\n");
                        navigator.clipboard.writeText(zipContent).catch(() => {});
                      }}
                    >
                      <Copy size={12} /> Copy all files
                    </Button>
                  )}
                </div>
              </>
            )}

            {activeRun.status === "error" && (
              <div className="cw-run-error">
                <AlertTriangle size={14} strokeWidth={2} /> {activeRun.error}
              </div>
            )}

            {/* File changes */}
            {activeRun.fileChanges.length > 0 && (
              <div className="cw-files-section">
                <div className="cw-section-title">
                  Files changed
                  <span className="cw-section-count">{activeRun.fileChanges.length}</span>
                </div>
                <div className="cw-files-grid">
                  {activeRun.fileChanges.map((f, i) => (
                    <button
                      key={i}
                      className={`cw-file-card ${selectedFile?.path === f.path ? "cw-file-active" : ""}`}
                      onClick={() => setSelectedFile(selectedFile?.path === f.path ? null : f)}
                      type="button"
                    >
                      <span className={`cw-file-status cw-file-status-${f.status}`}>
                        {f.status === "added" ? "A" : f.status === "modified" ? "M" : "D"}
                      </span>
                      <span className="cw-file-path mono">{f.path}</span>
                    </button>
                  ))}
                </div>

                {selectedFile && (
                  <div className="cw-file-preview">
                    <div className="cw-file-preview-header mono">
                      {selectedFile.path}
                      <span className={`cw-file-badge cw-file-badge-${selectedFile.status}`}>
                        {selectedFile.status}
                      </span>
                    </div>
                    <pre className="cw-file-preview-content mono">
                      {selectedFile.content || "(empty)"}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No active run: show empty state */}
        {!activeRun && runs.length === 0 && (
          <div className="cw-empty" style={{ marginBottom: 24 }}>
            <p>Send a task and the agent will execute it. Results appear here with a live activity feed and file listings.</p>
          </div>
        )}

        {/* Run history */}
        {!activeRun && runs.length > 0 && (
          <div className="cw-section">
            <div className="cw-section-title">
              Run history
              <span className="cw-section-count">{runs.length}</span>
            </div>
            <div className="cw-run-history">
              {[...runs].reverse().map((r) => (
                <button
                  key={r.id}
                  className="cw-history-item"
                  onClick={() => selectRun(r.id)}
                  type="button"
                >
                  <StatusDot
                    variant={r.status === "running" ? "online" : r.status === "done" ? "accent" : "busy"}
                    size={5}
                  />
                  <span className="cw-history-prompt">{r.prompt.slice(0, 60)}{r.prompt.length > 60 ? "..." : ""}</span>
                  <span className="cw-history-meta mono">{r.status} &middot; {r.activity.length} events</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <Composer
          value={composerInput}
          onChange={setComposerInput}
          onSend={handleSend}
          placeholder="Describe what you want done..."
          generating={runningRuns.length > 0 && !!activeRunId}
          onStop={() => { if (activeRunId) cancelRun(activeRunId); }}
          header={
            <div className="cw-config-row">
              <select className="cw-config-select" value={profile} onChange={(e) => setProfile(e.target.value)}>
                {PROFILES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
          }
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
          <div className="cw-composer-chips">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.id} className="qa-chip" type="button" onClick={() => handleQuickAction(qa)}>
                <qa.icon size={13} strokeWidth={1.5} /><span>{qa.label}</span>
              </button>
            ))}
          </div>
        </Composer>

        {/* Schedules */}
        {schedules.length > 0 && (
          <div className="cw-section">
            <div className="cw-section-title">
              Scheduled jobs
              <span className="cw-section-count">{schedules.filter((s) => s.enabled).length} active</span>
              <div className="grow" />
              <button className="cw-section-link" type="button" onClick={() => { setSchedName(""); setSchedWhen("every Monday at 9am"); setSchedPrompt(""); setView("schedule-new"); }}>
                + New
              </button>
            </div>
            <div className="sched-list">
              {schedules.map((sched) => (
                <div key={sched.id} className="sched-item" onClick={() => handleOpenScheduleEdit(sched)}>
                  <span className={`sched-status-dot ${sched.enabled ? "sched-status-ok" : "sched-status-paused"}`} />
                  <div className="sched-item-icon-wrap">
                    <Clock size={14} strokeWidth={1.5} />
                  </div>
                  <div className="sched-item-info">
                    <span className="sched-item-name">{sched.name}</span>
                    <span className="sched-item-cron mono">{sched.when || sched.cron}</span>
                  </div>
                  <button
                    className="sched-run-now-btn"
                    onClick={(e) => { e.stopPropagation(); handleRunScheduleNow(sched); }}
                    title="Run now"
                    type="button"
                  >
                    <Play size={10} strokeWidth={2} />
                  </button>
                  <button
                    className={`sched-item-tag ${sched.enabled ? "sched-tag-ok" : "sched-tag-paused"}`}
                    onClick={(e) => { e.stopPropagation(); handleToggleSchedule(sched.id, !sched.enabled); }}
                    type="button"
                  >
                    {sched.enabled ? "active" : "paused"}
                  </button>
                  <button
                    className="plugin-uninstall-btn"
                    style={{ opacity: 1, marginLeft: 4 }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(sched.id); }}
                    title="Delete schedule"
                    type="button"
                  >
                    <Trash2 size={11} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installed plugins */}
        {plugins.length > 0 ? (
          <div className="cw-section">
            <div className="cw-section-title">
              Installed plugins
              <span className="cw-section-count">{plugins.length}</span>
            </div>
            <div className="plugin-list">
              {plugins.map((p) => (
                <div key={p.name} className="plugin-item">
                  <div className="plugin-item-icon">
                    <Package size={16} strokeWidth={1.5} />
                  </div>
                  <div className="plugin-item-info">
                    <span className="plugin-item-name">{p.name}</span>
                    <span className="plugin-item-meta mono">
                      v{p.version} &middot; {p.author}
                      {p.skills.length > 0 && ` &middot; ${p.skills.length} skill${p.skills.length !== 1 ? "s" : ""}`}
                      {p.commands.length > 0 && ` &middot; ${p.commands.length} command${p.commands.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <button
                    className="plugin-edit-btn"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleEditPlugin(p.name); }}
                    title="Edit plugin files"
                  >
                    <PenSquare size={11} strokeWidth={1.5} />
                  </button>
                  <button
                    className="plugin-uninstall-btn"
                    type="button"
                    onClick={() => handleUninstall(p.name)}
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Plugin Editor Modal */}
      {editingPlugin && (
        <div className="cw-modal-overlay" onClick={() => { setEditingPlugin(null); setEditFilePath(null); }}>
          <div className="cw-modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cw-modal-header">
              <div className="cw-modal-icon">
                <Package size={20} strokeWidth={1.5} />
              </div>
              <div>
                <span className="cw-modal-title">Edit plugin: {editingPlugin.name}</span>
                <span className="cw-modal-sub mono">{editingPlugin.files.length} files</span>
              </div>
              <button className="cw-modal-close" type="button" onClick={() => { setEditingPlugin(null); setEditFilePath(null); }}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="cw-modal-body">
              <div className="scaffold-browser">
                <div className="scaffold-file-list">
                  {editingPlugin.files.map((f) => (
                    <button
                      key={f.path}
                      className={`scaffold-file-entry ${editFilePath === f.path ? "scaffold-file-entry-active" : ""}`}
                      onClick={() => { setEditFilePath(f.path); setEditFileContent(f.content); }}
                      type="button"
                    >
                      <FileText size={14} strokeWidth={1.5} className="scaffold-file-icon" />
                      <span className="scaffold-file-name mono">{f.path}</span>
                      <span className="scaffold-file-size mono">{f.content.length} B</span>
                    </button>
                  ))}
                </div>
                {editFilePath ? (
                  <div className="scaffold-preview">
                    <div className="scaffold-preview-header mono">{editFilePath}</div>
                    <textarea
                      className="scaffold-edit-area mono"
                      value={editFileContent}
                      onChange={(e) => setEditFileContent(e.target.value)}
                      spellCheck={false}
                    />
                    <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)", display: "flex", gap: 8 }}>
                      <Button variant="primary" size="sm" onClick={handleSavePluginFile}>
                        <Save size={12} /> Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditFilePath(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="scaffold-preview" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="text-muted" style={{ fontSize: 12 }}>Select a file to edit</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Modal */}
      {modalOpen && (
        <div className="cw-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="cw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cw-modal-header">
              <div className="cw-modal-icon">
                {modalKind === "create-plugin" ? <Puzzle size={20} strokeWidth={1.5} />
                  : modalKind === "report" ? <FileText size={20} strokeWidth={1.5} />
                  : modalKind === "schedule-plugin" ? <Clock size={20} strokeWidth={1.5} />
                  : <BarChart3 size={20} strokeWidth={1.5} />}
              </div>
              <div>
                <span className="cw-modal-title">
                  {modalKind === "create-plugin" ? "Create plugin"
                    : modalKind === "report" ? "Generate report"
                    : modalKind === "schedule-plugin" ? "Schedule this plugin?"
                    : "Analyze data"}
                </span>
                <span className="cw-modal-sub mono">
                  {modalKind === "create-plugin" && "Describe the endgame — what should the plugin do? The agent will generate the full plugin with skills, commands, and agents."}
                  {modalKind === "schedule-plugin" && "Want this to run automatically? Set the recurrence and we'll schedule it for you."}
                  {modalKind === "report" && "What kind of report do you need? The agent will gather data and produce a formatted document."}
                  {modalKind === "analyze" && "What should be analyzed? The agent will scan the workspace and produce findings."}
                </span>
              </div>
              <button className="cw-modal-close" type="button" onClick={() => setModalOpen(false)}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="cw-modal-body">
              {modalKind === "schedule-plugin" ? (
                <div className="scaffold-loading" style={{ padding: 24 }}>
                  <p>Set up a recurring schedule for this plugin to run automatically.</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Button variant="primary" size="sm" onClick={handleScheduleAfterInstall}>
                      <Clock size={14} strokeWidth={1.5} /> Yes, set frequency
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                      No thanks
                    </Button>
                  </div>
                </div>
              ) : scaffoldFiles.length > 0 ? (
                <div>
                  <label className="sched-field-label" style={{ marginBottom: 8, display: "block" }}>Files — click to preview</label>
                  <div className="scaffold-browser">
                    <div className="scaffold-file-list">
                      {scaffoldFiles.map((f, i) => (
                        <button
                          key={i}
                          className={`scaffold-file-entry ${selectedScaffoldFile === f.path ? "scaffold-file-entry-active" : ""}`}
                          onClick={() => setSelectedScaffoldFile(selectedScaffoldFile === f.path ? null : f.path)}
                          type="button"
                        >
                          <FileText size={14} strokeWidth={1.5} className="scaffold-file-icon" />
                          <span className="scaffold-file-name mono">{f.path}</span>
                          <span className="scaffold-file-size mono">{f.content.length} B</span>
                        </button>
                      ))}
                    </div>
                    {selectedScaffoldFile && (
                      <div className="scaffold-preview">
                        <div className="scaffold-preview-header mono">
                          {selectedScaffoldFile}
                        </div>
                        <pre className="scaffold-preview-content mono">
                          {scaffoldFiles.find((f) => f.path === selectedScaffoldFile)?.content || ""}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : scaffolding ? (
                <div className="scaffold-loading">
                  <div className="scaffold-spinner" />
                  <p>Generating plugin structure...</p>
                  <span className="text-muted" style={{ fontSize: 11 }}>This may take a few seconds</span>
                </div>
              ) : (
                <div>
                  {modalKind === "create-plugin" && (
                    <div className="sched-field">
                      <label>Plugin name</label>
                      <input
                        type="text"
                        placeholder="my-awesome-plugin"
                        value={scaffoldName}
                        onChange={(e) => setScaffoldName(e.target.value)}
                        className="sched-field-input"
                      />
                    </div>
                  )}
                  <div className="sched-field">
                    <label>What's the endgame?</label>
                    <textarea
                      value={modalPrompt}
                      onChange={(e) => setModalPrompt(e.target.value)}
                      disabled={scaffolding}
                      rows={4}
                      placeholder={modalKind === "create-plugin" ? "Describe what the plugin should do... e.g. 'Auto-format code on save and run linting'" : "Describe what you want in detail..."}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="cw-modal-actions">
              {scaffoldFiles.length > 0 ? (
                <>
                  <Button variant="primary" size="sm" onClick={handleInstallScaffold} disabled={scaffoldInstalling}>
                    <FolderOpen size={14} strokeWidth={1.5} /> {scaffoldInstalling ? "Installing..." : "Install plugin"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setScaffoldFiles([]); setScaffoldDir(""); setSelectedScaffoldFile(null); }}>
                    Discard
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" size="sm" onClick={handleModalSend} disabled={scaffolding || !modalPrompt.trim()}>
                    {scaffolding ? (
                      <span className="scaffold-btn-loading">
                        <span className="scaffold-btn-spinner" />
                        Generating...
                      </span>
                    ) : modalKind === "create-plugin" ? (
                      "Generate plugin"
                    ) : (
                      <><ArrowUp size={14} strokeWidth={2} /> Start task</>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={scaffolding}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
