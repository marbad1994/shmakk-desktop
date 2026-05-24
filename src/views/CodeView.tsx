import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { X, ChevronDown, ChevronRight, Wand2, Bug, FileCode, Check, Eye, EyeOff, RefreshCw, ArrowLeft, ArrowRight, Maximize2, Minimize2, Save, Undo2, FilePlus, FolderPlus, Copy, Pencil, Trash2, GitBranch, GitCommit, Plus } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { Button } from "../components/Button";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Composer } from "../components/Composer";
import { DETECTION_SCRIPT, DETECTION_SCRIPT_RAW } from "../services/detectionScript";
import { ElementInspector } from "../components/ElementInspector";
import type { ElementInfo } from "../components/ElementInspector";
import { useChatStore } from "../stores/chatStore";
import { useCodeStore, type OpenFile, type CodeChatMsg, type CodeChange } from "../stores/codeStore";
import { withActiveProjectContext } from "../services/projectContext";
import "./CodeView.css";

// Local aliases for existing code
type CodeChatMessage = CodeChatMsg;

const LANG_MAP: Record<string, string> = {
  ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",css:"css",scss:"scss",
  html:"html",htm:"html",json:"json",md:"markdown",py:"python",rs:"rust",go:"go",
  toml:"ini",yaml:"yaml",yml:"yaml",xml:"xml",svg:"xml",
};
const ICON_MAP: Record<string, string> = {
  ts:"#3178c6",tsx:"#61dafb",js:"#f7df1e",jsx:"#61dafb",css:"#1572b6",
  html:"#e34f26",json:"#f5a623",md:"#fff",py:"#3776ab",rs:"#dea584",go:"#00add8",
};

function isHtml(ext: string) { return /^(html|htm)$/i.test(ext); }
function isMd(ext: string) { return ext.toLowerCase() === "md"; }

function parseChanges(raw: string): CodeChange[] {
  if (!raw || !raw.trim()) return [];
  let text = raw.trim();
  if (text.startsWith("```")) text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
  const blocks = text.split(/^---+$/m);
  const changes: CodeChange[] = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const fm = block.match(/^FILE:\s*(.+)/m);
    const findM = block.match(/^FIND:\s*\n?([\s\S]*?)(?=\nREPLACE:|$)/m);
    const repM = block.match(/^REPLACE:\s*\n?([\s\S]*)$/m);
    if (fm && findM) {
      changes.push({
        filePath: fm[1].trim(),
        find: findM[1].trim(),
        replace: repM ? repM[1].trim() : (findM[1]?.trim() || ""),
      });
    }
  }
  return changes;
}

function wrapHtml(content: string): string {
  if (/<html/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body><div id="root">${content}</div></body></html>`;
}

interface TreeNode { name: string; path: string; isDir: boolean; children?: TreeNode[]; }

function TreeRow({ node, depth, activeOpenPath, expandedFolders, toggleFolder, handleOpenFile, onCtxMenu }: {
  node: TreeNode; depth: number;
  activeOpenPath: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (p: string) => void;
  handleOpenFile: (p: string) => void;
  onCtxMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
}) {
  const indent = depth * 14;
  if (node.isDir) {
    const exp = expandedFolders.has(node.path);
    return (
      <>
        <div className="code-folder-row" style={{ paddingLeft: 8 + indent }}
          onClick={() => toggleFolder(node.path)}
          onContextMenu={(e) => onCtxMenu(e, node.path, true)}>
          {exp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="code-folder-name">{node.name}</span>
        </div>
        {exp && node.children?.map((c) => (
          <TreeRow key={c.path} node={c} depth={depth + 1} {...{ activeOpenPath, expandedFolders, toggleFolder, handleOpenFile, onCtxMenu }} />
        ))}
      </>
    );
  }
  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  return (
    <div className={`code-file-row nested ${node.path === activeOpenPath ? "active" : ""}`}
      style={{ paddingLeft: 8 + indent }}
      onClick={() => handleOpenFile(node.path)}
      onContextMenu={(e) => onCtxMenu(e, node.path, false)}>
      <FileCode size={12} strokeWidth={1.5} style={{ color: ICON_MAP[ext] || "var(--text-muted)", flexShrink: 0 }} />
      <span className="code-file-name">{node.name}</span>
    </div>
  );
}

export function CodeView() {
  const files = useProjectStore((s) => s.files);
  const activeFilePath = useProjectStore((s) => s.activeFilePath);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);

  // Persistent state (survives tab switches) via codeStore
  const openFiles = useCodeStore((s) => s.openFiles);
  const setOpenFiles = useCodeStore((s) => s.setOpenFiles);
  const activeOpenPath = useCodeStore((s) => s.activeOpenPath);
  const setActiveOpenPath = useCodeStore((s) => s.setActiveOpenPath);
  const chatMessages = useCodeStore((s) => s.chatMessages);
  const setChatMessages = useCodeStore((s) => s.setChatMessages);
  const showPreview = useCodeStore((s) => s.showPreview);
  const setShowPreview = useCodeStore((s) => s.setShowPreview);
  const previewHtml = useCodeStore((s) => s.previewHtml);
  const setPreviewHtml = useCodeStore((s) => s.setPreviewHtml);
  const previewUrl = useCodeStore((s) => s.previewUrl);
  const setPreviewUrl = useCodeStore((s) => s.setPreviewUrl);
  const devServerRunning = useCodeStore((s) => s.devServerRunning);
  const setDevServerRunning = useCodeStore((s) => s.setDevServerRunning);
  const showInspector = useCodeStore((s) => s.showInspector);
  const setShowInspector = useCodeStore((s) => s.setShowInspector);
  const inspectedEl = useCodeStore((s) => s.inspectedEl);
  const setInspectedEl = useCodeStore((s) => s.setInspectedEl);

  // Transient UI state (local)
  const [editorRef, setEditorRef] = useState<any>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["src"]));
  const [treeWidth, setTreeWidth] = useState(220);
  const [chatWidth, setChatWidth] = useState(340);
  const [devServerPath, setDevServerPath] = useState<string | null>(null);
  const [devServerStarting, setDevServerStarting] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const accumulatedEditsRef = useRef<Map<string, { style: Record<string, string>, text?: string, target: "inline" | "class" }>>(new Map());
  const inspectedSelectorRef = useRef("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewElRef = useRef<any>(null);
  const activeOpenPathRef = useRef(activeOpenPath);
  activeOpenPathRef.current = activeOpenPath;

  // Manage webview lifecycle for dev server preview
  useEffect(() => {
    if (!previewUrl || !webviewContainerRef.current) return;
    const container = webviewContainerRef.current;
    if (webviewElRef.current) { webviewElRef.current.remove(); webviewElRef.current = null; }
    const wv = document.createElement("webview") as any;
    wv.src = previewUrl;
    wv.style.cssText = "flex:1;border:none;width:100%;height:100%;";
    wv.addEventListener("dom-ready", () => {
      try { wv.executeJavaScript(DETECTION_SCRIPT_RAW); } catch (_) {}
    });
    wv.addEventListener("console-message", (e: any) => {
      const msg = e.message || "";
      if (msg.startsWith("__SHMAKK__")) {
        try {
          const data = JSON.parse(msg.slice("__SHMAKK__".length));
          if (data.type === "shmakk:elementClick") {
            setInspectedEl(data.info);
            setShowInspector(true);
            inspectedSelectorRef.current = data.info?.selector || "";
          }
        } catch (_) {}
      }
    });
    wv.addEventListener("message", (e: any) => {
      if (e.data?.type === "shmakk:elementClick") {
        setInspectedEl(e.data.info);
        setShowInspector(true);
        inspectedSelectorRef.current = e.data.info?.selector || "";
      }
    });
    webviewElRef.current = wv;
    container.appendChild(wv);
    return () => { wv.remove(); webviewElRef.current = null; };
  }, [previewUrl]);

  // Get the active preview window for postMessage (iframe or webview)
  const previewWindow = (): Window | null => {
    if (previewUrl && webviewElRef.current) {
      return (webviewElRef.current as any).contentWindow ?? null;
    }
    return iframeRef.current?.contentWindow ?? null;
  };

  useEffect(() => {
    const u1 = window.api.preview.onServerReady((d) => { setPreviewUrl(d.url); setDevServerRunning(true); setDevServerStarting(false); setDevServerPath(activeOpenPathRef.current); });
    const u2 = window.api.preview.onServerError((d) => { setDevServerStarting(false); setDevServerRunning(false); setDevServerPath(null); });
    return () => { u1(); u2(); };
  }, []);

  // Resize drag state
  const treeDrag = useRef<{ startX: number; startW: number } | null>(null);
  const chatDrag = useRef<{ startX: number; startW: number } | null>(null);

  // Ctrl+B: toggle file tree
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const treeWidthSaved = useRef(treeWidth);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setTreeCollapsed((c) => {
          if (!c) treeWidthSaved.current = treeWidth;
          return !c;
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [treeWidth]);

  const effectiveTreeWidth = treeCollapsed ? 0 : treeWidth;

  useEffect(() => {
    const m = (e: MouseEvent) => {
      if (treeDrag.current) {
        const d = e.clientX - treeDrag.current.startX;
        setTreeWidth(Math.max(140, Math.min(400, treeDrag.current.startW + d)));
      }
      if (chatDrag.current) {
        const d = chatDrag.current.startX - e.clientX;
        setChatWidth(Math.max(200, Math.min(500, chatDrag.current.startW + d)));
      }
    };
    const u = () => { treeDrag.current = null; chatDrag.current = null; };
    document.addEventListener("mousemove", m);
    document.addEventListener("mouseup", u);
    return () => { document.removeEventListener("mousemove", m); document.removeEventListener("mouseup", u); };
  }, []);

  // Element picker messages
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === "shmakk:elementClick") {
        setInspectedEl(e.data.info); setShowInspector(true); inspectedSelectorRef.current = e.data.info?.selector || "";
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const activeOpen = openFiles.find((f) => f.path === activeOpenPath);
  const ext = activeOpenPath?.split(".").pop()?.toLowerCase() || "";
  const language = LANG_MAP[ext] || "plaintext";
  const isHtmlFile = isHtml(ext);
  const isMdFile = isMd(ext);
  const isPkgJson = activeOpenPath?.endsWith("package.json") || false;
  const canPreview = isHtmlFile || isMdFile || isPkgJson;

  const handleOpenFile = useCallback(async (filePath: string) => {
    const existing = openFiles.find((f) => f.path === filePath);
    if (existing) { setActiveOpenPath(filePath); setActiveFile(filePath); return; }
    let content = files.find((f) => f.path === filePath)?.content;
    if (content === undefined) {
      const read = await window.api.workspace.readFile(filePath);
      if (read === null) { setActiveFile(filePath); return; }
      content = read;
    }
    const e = filePath.split(".").pop()?.toLowerCase() || "";
    const f: OpenFile = { path: filePath, content, language: LANG_MAP[e] || "plaintext", isDirty: false };
    setOpenFiles((p) => [...p, f]); setActiveOpenPath(filePath); setActiveFile(filePath);
  }, [files, openFiles, setActiveFile]);

  const handleCloseTab = (path: string) => {
    setOpenFiles((p) => {
      const n = p.filter((f) => f.path !== path);
      if (activeOpenPath === path) {
        const i = p.findIndex((f) => f.path === path);
        setActiveOpenPath(n[Math.min(i, n.length - 1)]?.path ?? null);
      }
      return n;
    });
  };

  const handleTogglePreview = async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (isHtmlFile && activeOpen) {
      const html = wrapHtml(activeOpen.content);
      setPreviewHtml(html.replace("</body>", DETECTION_SCRIPT + "\n</body>"));
      setPreviewUrl("");
    } else if (isMdFile && activeOpen) {
      setPreviewHtml("");
      setPreviewUrl("");
    } else if (isPkgJson) {
      if (devServerStarting) return;
      const sameServer = devServerRunning && devServerPath === activeOpenPath;
      if (sameServer) {
        // Same server still running, just show it
      } else {
        setDevServerStarting(true);
        setPreviewHtml("");
        setDevServerPath(null);
        const r = await window.api.preview.startDevServer(activeOpenPath!);
        if (r.error) {
          setDevServerStarting(false);
          return;
        }
        setTimeout(() => setDevServerStarting((s) => s ? false : s), 15000);
      }
    }
    setShowPreview(true);
  };

  const handleSave = async () => {
    if (!activeOpenPath || !activeOpen) return;
    const ok = await window.api.workspace.writeFile(activeOpenPath, activeOpen.content);
    if (ok) {
      setOpenFiles((p) => p.map((f) => f.path === activeOpenPath ? { ...f, isDirty: false } : f));
    }
  };

  // Ctrl+S to save
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeOpenPath, activeOpen]);

  const buildInspectorPrompt = (el: ElementInfo, changes: string, opts?: { newText?: string; userPrompt?: string }): string => {
    const parts: string[] = [];
    parts.push(`## Context`);
    parts.push(`- Preview file: ${activeOpenPath || "unknown"}`);
    parts.push(`- Preview type: ${isPkgJson ? "dev server (bundled)" : isHtmlFile ? "HTML file (direct)" : "unknown"}`);
    if (activeOpenPath) parts.push(`- Source file open in editor: \`${activeOpenPath}\``);

    parts.push(`\n## Element to modify`);
    parts.push(`- Tag: \`<${el.tag}>\``);
    if (el.id) parts.push(`- ID: \`#${el.id}\``);
    if (el.classes.length) parts.push(`- Classes: ${el.classes.map((c) => "`.${c}`").join(", ")}`);
    parts.push(`- Full selector: \`${el.selector}\``);
    if (el.text) parts.push(`- Current text content: "${el.text}"`);

    parts.push(`\n## Computed styles (current)`);
    const styleKeys = ["color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "lineHeight", "padding", "margin", "width", "height", "display", "flexDirection", "alignItems", "justifyContent", "gap", "border", "borderRadius", "boxShadow", "opacity", "position", "overflow", "zIndex", "cursor", "transition"];
    const nonEmptyStyles = Object.entries(el.styles).filter(([k, v]) => v && styleKeys.includes(k));
    parts.push("```json");
    parts.push(JSON.stringify(Object.fromEntries(nonEmptyStyles), null, 2));
    parts.push("```");

    parts.push(`\n## Requested changes`);
    const hasStyles = changes.trim().length > 0;
    const hasText = !!opts?.newText;
    const hasUserPrompt = !!opts?.userPrompt;

    if (hasStyles) parts.push(changes);
    if (hasText)   parts.push(`- Change text from "${el.text}" to "${opts!.newText}"`);
    if (!hasStyles && !hasText && !hasUserPrompt) parts.push("(No specific changes listed)");

    parts.push(`\n## Instructions`);
    if (hasText && !hasStyles) {
      parts.push(`This is a TEXT-ONLY change. The text "${el.text}" needs to be updated to "${opts!.newText}".`);
      parts.push(`- Search the workspace for the exact string "${el.text}".`);
      parts.push(`- Check JSON translation/locale files first (e.g. **/locales/**, **/i18n/**, **/messages/**, **/translations/**).`);
      parts.push(`- Also check JSX/TSX component files, HTML templates, or markdown.`);
      parts.push(`- Change ONLY the text value — keep the key/identifier unchanged.`);
    }
    if (hasStyles) {
      parts.push(`- Find the source file defining this element${isPkgJson ? " (trace bundle back to original .css/.scss/.tsx)" : ""}.`);
      if (el.classes.length) parts.push(`- Target the CSS rule for class \`.${el.classes[0]}\`.`);
      parts.push(`- Apply ONLY the CSS changes listed above. Do not modify unrelated properties.`);
    }
    if (hasUserPrompt) {
      parts.push(`Additional user request: ${opts!.userPrompt}`);
    }
    parts.push(`- Output each change using this EXACT format (replace the example with actual values):
\`\`\`
FILE: relative/path/to/file
FIND: <exact text to find in the file>
REPLACE: <exact replacement text>
---
\`\`\`
- Separate multiple changes with --- on its own line.
- The FIND must match exactly (including whitespace, quotes, indentation).
- After all changes, add ==== on its own line followed by a brief explanation.
- Before outputting, mentally verify each change won't break the file (valid JSON, matching braces, no syntax errors).`);

    return parts.join("\n");
  };

  const fileStateBeforeChange = useRef<{ content: string; filePath: string } | null>(null);
  const chatContextRef = useRef<string[]>([]);
  const [chatContextCount, setChatContextCount] = useState(0);
  const [canRevert, setCanRevert] = useState(false);

  // File tree context menu & creation
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; filePath: string; isDir: boolean } | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder">("file");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Git state
  const [gitBranch, setGitBranch] = useState("");
  const [gitBranches, setGitBranches] = useState<string[]>([]);
  const [gitFiles, setGitFiles] = useState<Array<{ path: string; status: string }>>([]);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [stageAll, setStageAll] = useState(true);
  const branchSwitcherRef = useRef<HTMLDivElement>(null);

  const loadGitData = async () => {
    try {
      const [b, s] = await Promise.all([window.api.git.branches(), window.api.git.status()]);
      setGitBranch(b.current); setGitBranches(b.branches); setGitFiles(s.files);
    } catch (_) {
      setGitBranch(""); setGitBranches([]); setGitFiles([]);
    }
  };

  useEffect(() => {
    loadGitData();
    // Refresh on file changes
    const u = window.api.workspace.watchFiles();
    const h = () => loadGitData();
    // Listen for filesChanged events via polling or custom handler
    const interval = setInterval(() => { loadGitData(); }, 10000);
    return () => { clearInterval(interval); };
  }, []);

  const closeCtxMenu = () => setCtxMenu(null);
  useEffect(() => { window.addEventListener("click", closeCtxMenu); return () => window.removeEventListener("click", closeCtxMenu); }, []);

  const handleCreateFile = (parentDir?: string) => {
    const dir = parentDir || "";
    setCreatingIn(dir);
    setCreatingType("file");
    setNewFileName("");
  };
  const handleCreateFolder = (parentDir?: string) => {
    const dir = parentDir || "";
    setCreatingIn(dir);
    setCreatingType("folder");
    setNewFileName("");
  };
  const submitCreate = async () => {
    if (!creatingIn || !newFileName.trim()) { setCreatingIn(null); return; }
    const p = creatingIn ? `${creatingIn}/${newFileName}` : newFileName;
    const content = creatingType === "folder" ? "" : "";
    if (creatingType === "folder") {
      // Create a placeholder file to force directory creation
      await window.api.workspace.writeFile(`${p}/.gitkeep`, "");
      // Then delete it (optional, keeps folder)
    } else {
      await window.api.workspace.writeFile(p, "");
    }
    setCreatingIn(null);
    // Reload project files
    const store = useProjectStore.getState();
    store.loadProjectFiles();
  };

  const handleRename = (oldPath: string) => {
    setRenamingPath(oldPath);
    setRenameValue(oldPath.split("/").pop() || "");
  };
  const submitRename = async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    await window.api.workspace.renameFile(renamingPath, renameValue);
    setRenamingPath(null);
    useProjectStore.getState().loadProjectFiles();
  };

  const handleDelete = async (filePath: string) => {
    await window.api.workspace.deleteFile(filePath);
    setConfirmDelete(null);
    // Close tab if open
    if (openFiles.find((f) => f.path === filePath)) handleCloseTab(filePath);
    useProjectStore.getState().loadProjectFiles();
  };

  const handleCopyPath = (filePath: string, full: boolean) => {
    const root = useProjectStore.getState().files[0]?.path || "";
    const p = full ? `${root}/${filePath}` : filePath;
    navigator.clipboard.writeText(p);
    setCtxMenu(null);
  };

  const handleDuplicate = async (filePath: string) => {
    const content = await window.api.workspace.readFile(filePath) || "";
    const ext = filePath.split(".").pop() || "";
    const base = filePath.replace(new RegExp(`\\.${ext}$`), "");
    const newPath = `${base}_copy.${ext}`;
    await window.api.workspace.writeFile(newPath, content);
    setCtxMenu(null);
    const store = useProjectStore.getState();
    store.loadProjectFiles();
  };

  const handleCodeChatSend = async (msg?: string, opts?: { display?: string; action?: string }) => {
    const displayMsg = opts?.display || msg || chatInput;
    let aiPrompt = msg || chatInput;
    if (!displayMsg.trim() || chatLoading) return;
    // Include persisted chat context if any
    if (chatContextRef.current.length > 0) {
      const ctx = chatContextRef.current.map((c, i) => `[Context ${i + 1}]:\n\`\`\`\n${c.slice(0, 2000)}\n\`\`\``).join("\n\n");
      aiPrompt = `## Additional context from codebase\n${ctx}\n\n## Request\n${aiPrompt}`;
      chatContextRef.current = [];
      setChatContextCount(0);
    }
    aiPrompt = await withActiveProjectContext(aiPrompt);
    const detail = aiPrompt !== displayMsg ? aiPrompt : undefined;
    setChatMessages((p) => [...p, { role: "user", content: displayMsg, detail }]);
    // Save to session
    const activeId = useChatStore.getState().activeId;
    if (activeId && !activeId.startsWith("conv-")) {
      window.api.sessions.addTurn(activeId, "user", displayMsg).catch(() => {});
    }
    setChatInput("");
    setChatLoading(true);
    try {
      const action = opts?.action || (detail ? "fix" : "explain");
      const r = await window.api.code.chat({
        filePath: activeOpenPath || "",
        fullFile: activeOpen?.content || "",
        selection: aiPrompt,
        action,
      });
      const diff = r.diff;
      if (diff) {
        const changes = parseChanges(diff);
        if (changes.length > 0) {
          setChatMessages((p) => [...p, {
            role: "agent", content: r.reply || "", changes,
          }]);
        } else {
          setChatMessages((p) => [...p, {
            role: "agent", content: r.reply || "", diff, diffStats: "",
          }]);
        }
      } else {
        setChatMessages((p) => [...p, { role: "agent", content: r.reply || r.error || "Done." }]);
      }
      // Save AI response as turn
      const activeId = useChatStore.getState().activeId;
      if (activeId && !activeId.startsWith("conv-")) {
        window.api.sessions.addTurn(activeId, "assistant", r.reply || r.error || "Done.").catch(() => {});
      }
    } catch (e: any) {
      setChatMessages((p) => [...p, { role: "agent", content: String(e?.message || e) }]);
    }
    setChatLoading(false);
  };

  const applyChange = async (change: CodeChange): Promise<boolean> => {
    const fp = change.filePath;
    if (!fp) return false;

    // Save state for revert
    if (!fileStateBeforeChange.current) {
      const curContent = editorRef?.getModel()?.getValue() || activeOpen?.content || "";
      fileStateBeforeChange.current = { content: curContent, filePath: activeOpenPath || "" };
    }
    setCanRevert(true);

    let content: string;
    if (fp === activeOpenPath && editorRef?.getModel()) {
      content = editorRef.getModel().getValue();
    } else if (fp === activeOpenPath && activeOpen) {
      content = activeOpen.content;
    } else {
      content = await window.api.workspace.readFile(fp) || "";
    }

    if (!content.includes(change.find)) return false;
    const newContent = content.replace(change.find, change.replace);

    const wrote = await window.api.workspace.writeFile(fp, newContent);
    if (!wrote) return false;

    if (fp === activeOpenPath && editorRef?.getModel()) {
      const fr = editorRef.getModel().getFullModelRange();
      editorRef.executeEdits("apply", [{ range: fr, text: newContent }]);
    }
    setOpenFiles((p) => p.map((f) => f.path === fp ? { ...f, content: newContent, isDirty: false } : f));

    if (fp !== activeOpenPath && !openFiles.find((f) => f.path === fp)) {
      const c = await window.api.workspace.readFile(fp) || "";
      const e = fp.split(".").pop()?.toLowerCase() || "";
      setOpenFiles((p) => [...p, { path: fp, content: c, language: LANG_MAP[e] || "plaintext", isDirty: false }]);
      setActiveOpenPath(fp);
      setActiveFile(fp);
    }
    return true;
  };

  const updateChangeState = (msgIndex: number, ci: number, state: "applied" | "rejected") => {
    setChatMessages((p) => p.map((m, i) => {
      if (i !== msgIndex || !m.changes) return m;
      return { ...m, changes: m.changes.map((c, j) => j === ci ? { ...c, state } : c) };
    }));
  };

  const handleApplyChange = async (msg: CodeChatMessage, msgIndex: number, ci: number) => {
    if (!msg.changes) return;
    const ok = await applyChange(msg.changes[ci]);
    if (ok) updateChangeState(msgIndex, ci, "applied");
  };

  const handleRejectChange = (msgIndex: number, ci: number) => {
    updateChangeState(msgIndex, ci, "rejected");
  };

  const handleApplyAllChanges = async (msg: CodeChatMessage, msgIndex: number) => {
    if (!msg.changes) return;
    for (let ci = 0; ci < msg.changes.length; ci++) {
      if (!msg.changes[ci].state) {
        const ok = await applyChange(msg.changes[ci]);
        if (ok) updateChangeState(msgIndex, ci, "applied");
      }
    }
  };

  const handleSaveAllEdits = () => {
    const all = [...accumulatedEditsRef.current.entries()];
    if (!all.length) return;
    // Build one prompt describing all edits across all elements
    const parts = all.map(([sel, edit]) => {
      const styles = Object.entries(edit.style).length
        ? Object.entries(edit.style).map(([k, v]) => `  - ${k}: ${v}`).join("\n")
        : "";
      const textPart = edit.text ? `  - text: "${edit.text}"` : "";
      return `[Selector: ${sel}]\n${[styles, textPart].filter(Boolean).join("\n")}`;
    });
    const prompt = parts.join("\n\n");
    handleCodeChatSend(
      buildInspectorPrompt(inspectedEl!, prompt, { userPrompt: "Apply ALL the above changes to the source files. Each [Selector: ...] block is a separate element that needs modification." }),
      { display: "Save changes to file" }
    );
    accumulatedEditsRef.current.clear();
    setShowInspector(false);
  };

  const handleCancelEdits = () => {
    // Reload preview to revert all inline edits
    if (isPkgJson && devServerRunning && iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    } else if (isHtmlFile && activeOpen) {
      const html = wrapHtml(activeOpen.content);
      setPreviewHtml(html.replace("</body>", DETECTION_SCRIPT + "\n</body>"));
      setShowPreview(false);
      setTimeout(() => setShowPreview(true), 50);
    }
    accumulatedEditsRef.current.clear();
    setShowInspector(false);
  };

  // Get previously applied edits for the currently inspected element
  const initialInspectorEdits = inspectedEl
    ? accumulatedEditsRef.current.get(inspectedEl.selector)
    : undefined;

  const handleRevertLastChange = () => {
    if (!editorRef || !fileStateBeforeChange.current) return;
    const { content, filePath } = fileStateBeforeChange.current;
    const model = editorRef.getModel();
    if (!model) return;
    const fr = model.getFullModelRange();
    editorRef.executeEdits("revert", [{ range: fr, text: content }]);
    setOpenFiles((p) => p.map((f) => f.path === filePath ? { ...f, content, isDirty: false } : f));
    fileStateBeforeChange.current = null;
    setCanRevert(false);
  };

  const handleRefreshPreview = () => {
    if (!activeOpen) return;
    if (isHtmlFile) {
      const html = wrapHtml(activeOpen.content);
      setPreviewHtml(html.replace("</body>", DETECTION_SCRIPT + "\n</body>"));
      // Force iframe to reload the updated srcDoc
      setShowPreview(false);
      setTimeout(() => setShowPreview(true), 50);
    } else if (isPkgJson && devServerRunning && iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const getSelection = () => {
    if (!editorRef) return null;
    const sel = editorRef.getSelection();
    if (!sel?.isEmpty()) {
      const m = editorRef.getModel();
      if (!m) return null;
      return { text: m.getValueInRange(sel), startLine: sel.startLineNumber, endLine: sel.endLineNumber };
    }
    return null;
  };
  const selection = getSelection();

  const handleCodeAction = async (action: "fix" | "explain" | "generate") => {
    if (!activeOpenPath || chatLoading) return;
    // Read selection directly from Monaco (not React state, which is stale in context menu callbacks)
    const edSel = editorRef?.getSelection?.();
    if (!edSel || edSel.isEmpty()) return;
    const selModel = editorRef?.getModel?.();
    if (!selModel) return;
    const selText: string = selModel.getValueInRange(edSel);
    if (!selText) return;

    setChatLoading(true);
    const label = { fix: "Fix", explain: "Explain", generate: "Generate" };
    const codeLen = 120;
    const snippet = selText.slice(0, codeLen).replace(/\n/g, " ");
    const display = `${label[action]}: ${snippet}${selText.length > codeLen ? "…" : ""}`;
    const instructions: Record<string, string> = {
      fix: "Review ONLY the selected code for bugs, security issues, and edge cases. Fix any problems you find. Do NOT modify code outside the selection. Be thorough.",
      explain: "Explain ONLY the selected code — what it does, its purpose, edge cases, and risks. Keep it concise.",
      generate: "Based on the selected code, generate improvements or new features. Output clean, working code.",
    };
    const detail = `Action: ${label[action]}\nFile: ${activeOpenPath}\n\nSelected code:\n\`\`\`\n${selText}\n\`\`\``;
    setChatMessages((p) => [...p, { role: "user", content: display, detail }]);
    try {
      const selection = await withActiveProjectContext(instructions[action]);
      const r = await window.api.code.chat({
        filePath: activeOpenPath, fullFile: activeOpen?.content || "",
        selection, action,
      });
      const diff = r.diff;
      if (diff && action === "fix") {
        const changes = parseChanges(diff);
        if (changes.length > 0) {
          setChatMessages((p) => [...p, {
            role: "agent", content: r.reply || "", changes,
          }]);
        } else {
          setChatMessages((p) => [...p, {
            role: "agent", content: r.reply || "", diff, diffStats: "",
          }]);
        }
      } else {
        setChatMessages((p) => [...p, { role: "agent", content: r.reply || r.error || "Done." }]);
      }
    } catch (e) { setChatMessages((p) => [...p, { role: "agent", content: String(e) }]); }
    setChatLoading(false);
  };
  const handleCodeActionRef = useRef(handleCodeAction);
  handleCodeActionRef.current = handleCodeAction;

  // Build file tree as nested structure
  interface TreeNode { name: string; path: string; isDir: boolean; children?: TreeNode[]; }
  const fileTree = useMemo(() => {
    const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
    const dirMap = new Map<string, TreeNode>();
    dirMap.set("", root);

    for (const f of files) {
      const parts = f.path.split("/");
      // Ensure all parent dirs exist
      for (let i = 0; i < parts.length - 1; i++) {
        const dp = parts.slice(0, i + 1).join("/");
        if (!dirMap.has(dp)) {
          const node: TreeNode = { name: parts[i], path: dp, isDir: true, children: [] };
          dirMap.set(dp, node);
          const pp = parts.slice(0, i).join("/");
          dirMap.get(pp)?.children?.push(node);
        }
      }
      // Add file to its parent
      const pp = parts.slice(0, -1).join("/");
      const fileNode: TreeNode = { name: parts[parts.length - 1], path: f.path, isDir: false };
      dirMap.get(pp)?.children?.push(fileNode);
    }
    // Sort: dirs first, then alphabetical
    const sortNode = (n: TreeNode) => {
      n.children?.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children?.forEach(sortNode);
    };
    sortNode(root);
    return root;
  }, [files]);
  const toggleFolder = (p: string) => setExpandedFolders((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  return (
    <div className="code-app">
      {/* File tree */}
      <div className="code-sidebar" style={{ width: effectiveTreeWidth, display: treeCollapsed ? "none" : "flex" }}>
        <div className="code-sidebar-header mono">Explorer<div className="grow" />
          <button className="code-sidebar-btn" onClick={() => handleCreateFile()} type="button" title="New file"><FilePlus size={14} /></button>
          <button className="code-sidebar-btn" onClick={() => handleCreateFolder()} type="button" title="New folder"><FolderPlus size={14} /></button>
        </div>
        <div className="code-file-tree">
          {/* Inline create input */}
          {creatingIn !== null && (
            <div className="code-create-row">
              <input className="code-create-input mono" autoFocus
                placeholder={creatingType === "file" ? "filename.ts" : "folder-name"}
                value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreatingIn(null); }}
                onBlur={submitCreate} />
            </div>
          )}
          {fileTree.children?.map((node) => (
            <TreeRow key={node.path} node={node} depth={0}
              onCtxMenu={(e, path, isDir) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, filePath: path, isDir }); }}
              {...{ activeOpenPath, expandedFolders, toggleFolder, handleOpenFile }} />
          )) || (
            <div className="code-tree-empty">No files</div>
          )}
          {/* Rename inline input */}
          {renamingPath && (
            <div className="code-create-row">
              <input className="code-create-input mono" autoFocus
                value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingPath(null); }}
                onBlur={submitRename} />
            </div>
          )}
          {/* Context menu */}
          {ctxMenu && (
            <div className="code-ctx-menu" style={{ left: ctxMenu.x - 200, top: ctxMenu.y - 100, position: "fixed", zIndex: 100 }}>
              <button className="code-ctx-item" onClick={() => { handleRename(ctxMenu.filePath); closeCtxMenu(); }}>
                <Pencil size={11} /> Rename
              </button>
              {!ctxMenu.isDir && (
                <button className="code-ctx-item" onClick={() => { handleCopyPath(ctxMenu.filePath, true); }}>
                  <Copy size={11} /> Copy full path
                </button>
              )}
              <button className="code-ctx-item" onClick={() => { handleCopyPath(ctxMenu.filePath, false); }}>
                <Copy size={11} /> Copy relative path
              </button>
              {!ctxMenu.isDir && (
                <button className="code-ctx-item" onClick={() => { handleDuplicate(ctxMenu.filePath); }}>
                  <Copy size={11} /> Duplicate
                </button>
              )}
              <button className="code-ctx-item code-ctx-item-danger" onClick={() => { setConfirmDelete(ctxMenu.filePath); closeCtxMenu(); }}>
                <Trash2 size={11} /> Delete
              </button>
            </div>
          )}
          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="code-ctx-menu" style={{ left: "50%", top: "50%", position: "fixed", zIndex: 101, transform: "translate(-50%,-50%)" }}>
              <div style={{ padding: "10px 14px", fontSize: 12 }}>Delete "{confirmDelete.split("/").pop()}"?</div>
              <div style={{ display: "flex", gap: 4, padding: "6px 14px", justifyContent: "flex-end" }}>
                <button className="code-ctx-item" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="code-ctx-item code-ctx-item-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button>
              </div>
            </div>
          )}
          {/* Git bar */}
          {gitBranch && (
            <div className="code-git-bar">
              <div className="code-git-bar-main" onClick={() => setShowBranchSwitcher(!showBranchSwitcher)}>
                <GitBranch size={11} />
                <span className="mono">{gitBranch}</span>
                {gitFiles.length > 0 && <span className="code-git-count">{gitFiles.length}</span>}
              </div>
              <button className="code-sidebar-btn" onClick={() => setShowGitPanel(!showGitPanel)} title="Git panel">
                <GitCommit size={12} />
              </button>
              {showBranchSwitcher && (
                <div className="code-git-branch-list">
                  {gitBranches.map((b) => (
                    <button key={b} className={`code-git-branch-item ${b === gitBranch ? "active" : ""}`}
                      onClick={async () => {
                        await window.api.git.checkout(b);
                        await loadGitData();
                        setShowBranchSwitcher(false);
                      }}>
                      {b}
                    </button>
                  ))}
                  <div className="code-git-branch-sep" />
                  <button className="code-git-branch-item" onClick={async () => {
                    const name = prompt("New branch name:");
                    if (name) { await window.api.git.createBranch(name); await loadGitData(); setShowBranchSwitcher(false); }
                  }}>
                    <Plus size={10} /> New branch
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tree resize handle */}
      {!treeCollapsed && <div className="code-resize-handle" onMouseDown={(e) => { e.preventDefault(); treeDrag.current = { startX: e.clientX, startW: treeWidth }; }} />}

      {/* Editor area */}
      <div className="code-editor-area">
        <div className="code-file-tabs">
          {openFiles.map((f) => (
            <div key={f.path} className={`code-tab ${f.path === activeOpenPath ? "active" : ""}`} onClick={() => setActiveOpenPath(f.path)}>
              <span className={`code-tab-dot ${f.isDirty ? "unsaved" : ""}`} />
              <span>{f.path.split("/").pop()}</span>
              <button className="code-tab-close" onClick={(e) => { e.stopPropagation(); handleCloseTab(f.path); }} type="button"><X size={11} strokeWidth={1.5} /></button>
            </div>
          ))}
          <div className="grow" />
          {canPreview && (
            <button className="code-tab" onClick={handleTogglePreview} style={{ borderLeft: "1px solid var(--border-light)" }}>
              {showPreview ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Preview</>}
            </button>
          )}
          {activeOpen && (
            <button className={`code-tab code-tab-save ${activeOpen.isDirty ? "code-tab-save-dirty" : ""}`}
              onClick={handleSave} disabled={!activeOpen.isDirty}
              style={{ borderLeft: "1px solid var(--border-light)", opacity: activeOpen.isDirty ? 1 : 0.4 }}>
              <Save size={12} /> {activeOpen.isDirty ? "Save" : "Saved"}
            </button>
          )}
          {canRevert && (
            <button className="code-tab code-tab-revert" onClick={handleRevertLastChange}
              style={{ borderLeft: "1px solid var(--border-light)" }}>
              <Undo2 size={12} /> Revert
            </button>
          )}
        </div>
        {activeOpenPath && <div className="code-breadcrumb">
          {activeOpenPath.split("/").map((p, i, a) => <span key={i}>{i>0 && <span className="code-breadcrumb-sep">/</span>}<span className={i===a.length-1?"code-breadcrumb-fn":""}>{p}</span></span>)}
          <div className="grow" />
          {selection && <span style={{color:"var(--yellow)",fontSize:10,fontFamily:"var(--font-mono)"}}>{selection.endLine-selection.startLine+1} lines ({selection.startLine}-{selection.endLine})</span>}
        </div>}

        <div className="code-editor-body" style={{ flexDirection: showPreview && !previewFullscreen ? "row" : "column" }}>
          <div className="code-monaco-area" style={{ flex: showPreview ? 1 : "1 1 100%", display: previewFullscreen ? "none" : undefined }}>
            {activeOpenPath && activeOpen ? (
              <Editor height="100%" language={language} value={activeOpen.content} theme="vs-dark"
                path={activeOpenPath}
                beforeMount={(monaco) => {
                  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                    module: monaco.languages.typescript.ModuleKind.ESNext,
                    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
                    allowJs: true,
                    checkJs: false,
                    strict: true,
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    resolveJsonModule: true,
                    isolatedModules: true,
                  });
                  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false,
                  });
                  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                    module: monaco.languages.typescript.ModuleKind.ESNext,
                    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
                    allowJs: true,
                    checkJs: false,
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                  });
                  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false,
                  });
                }}
                onMount={(e: any) => {
                  setEditorRef(e);
                  // Add context menu actions — use ref to always call latest function
                  e.addAction({ id: "shmakk-fix", label: "Fix", contextMenuGroupId: "1_modification", contextMenuOrder: 1,
                    run: () => handleCodeActionRef.current?.("fix") });
                  e.addAction({ id: "shmakk-explain", label: "Explain", contextMenuGroupId: "1_modification", contextMenuOrder: 2,
                    run: () => handleCodeActionRef.current?.("explain") });
                  e.addAction({ id: "shmakk-addContext", label: "Add to Chat Context", contextMenuGroupId: "1_modification", contextMenuOrder: 3,
                    run: (ed: any) => {
                      const sel = ed.getModel().getValueInRange(ed.getSelection());
                      if (sel) { chatContextRef.current.push(sel); setChatContextCount(chatContextRef.current.length); }
                    } });
                }}
                onChange={(v?: string) => { if (v!==undefined) setOpenFiles((p) => p.map((f) => f.path===activeOpenPath?{...f,content:v,isDirty:true}:f)); }}
                options={{ fontSize:12, fontFamily:"JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace", lineHeight:22,
                  minimap:{enabled:true,scale:1,showSlider:"mouseover"}, lineNumbers:"on",
                  renderLineHighlight:"all", scrollBeyondLastLine:false, padding:{top:8},
                  bracketPairColorization:{enabled:true}, automaticLayout:true, tabSize:2,
                  cursorBlinking:"smooth", smoothScrolling:true, matchBrackets:"always",
                }}
              />
            ) : (
              <div className="code-empty"><div className="code-empty-glyph"><FileCode size={28} strokeWidth={1} /></div><h3>No file open</h3><p>Select a file from the explorer to start editing.</p></div>
            )}
          </div>

          {showPreview && (
            <div className="code-preview-pane" style={{ flex: previewFullscreen ? "1 1 100%" : 1 }}>
              <div className="code-preview-toolbar">
                {(isHtmlFile || isPkgJson) && (
                  <>
                    <button className="code-preview-btn" onClick={() => {
                      const w = isPkgJson ? (webviewElRef.current as any) : iframeRef.current?.contentWindow;
                      if (w) { try { isPkgJson ? w.goBack() : iframeRef.current?.contentWindow?.history.back(); } catch (_) {} }
                    }} type="button" title="Back"><ArrowLeft size={11} /></button>
                    <button className="code-preview-btn" onClick={() => {
                      const w = isPkgJson ? (webviewElRef.current as any) : iframeRef.current?.contentWindow;
                      if (w) { try { isPkgJson ? w.goForward() : iframeRef.current?.contentWindow?.history.forward(); } catch (_) {} }
                    }} type="button" title="Forward"><ArrowRight size={11} /></button>
                  </>
                )}
                <span className="mono" style={{fontSize:10,color:previewUrl?"var(--green)":"var(--text-muted)"}}>
                  {previewUrl ? previewUrl : `Preview: ${activeOpenPath?.split("/").pop()}`}
                </span>
                <div className="grow" />
                {isPkgJson && devServerRunning && (
                  <button className="code-preview-btn" onClick={async () => { await window.api.preview.stopDevServer(); setDevServerRunning(false); setDevServerStarting(false); setDevServerPath(null); setPreviewUrl(""); }} type="button" title="Stop server">Stop</button>
                )}
                {(isHtmlFile || isPkgJson) && (
                  <button className="code-preview-btn" onClick={handleRefreshPreview} type="button"><RefreshCw size={11} /></button>
                )}
                <button className="code-preview-btn" onClick={() => setPreviewFullscreen((f) => !f)} type="button" title={previewFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                  {previewFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
              </div>

              {devServerStarting ? (
                <div className="code-preview-loading">
                  <span className="code-chat-spinner" />
                  <span>Starting dev server...</span>
                </div>
              ) : isMdFile && activeOpen ? (
                <div className="code-preview-md">
                  <MarkdownRenderer content={activeOpen.content} />
                </div>
              ) : previewUrl ? (
                <div ref={webviewContainerRef} className="code-preview-iframe" />
              ) : isHtmlFile ? (
                <iframe ref={iframeRef} srcDoc={previewHtml} className="code-preview-iframe" title="Preview" sandbox="allow-scripts allow-same-origin" />
              ) : (
                <div className="code-preview-empty">Run the dev server to preview</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat resize handle */}
      {!showInspector && <div className="code-resize-handle" style={{ display: previewFullscreen ? "none" : undefined }} onMouseDown={(e) => { e.preventDefault(); chatDrag.current = { startX: e.clientX, startW: chatWidth }; }} />}

      {/* Code Chat or Inspector */}
      {showGitPanel ? (
        <div className="code-chat" style={{ width: chatWidth }}>
          <div className="code-chat-header mono">Git<div className="grow" />
            <button className="code-sidebar-btn" onClick={() => setShowGitPanel(false)} type="button"><X size={12} /></button>
          </div>
          <div className="code-chat-body" style={{ overflow: "auto" }}>
            {gitFiles.length === 0 ? (
              <div className="code-chat-empty"><p>Working tree clean</p></div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                  {gitFiles.length} changed file{gitFiles.length > 1 ? "s" : ""}
                </div>
                {gitFiles.map((f) => (
                  <div key={f.path} className="cc-git-file">
                    <span className={`code-git-dot ${f.status}`} style={{ margin: 0 }} />
                    <span className="mono" style={{ fontSize: 10, flex: 1 }}>{f.path}</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{f.status}</span>
                  </div>
                ))}
                <textarea className="elem-textarea" placeholder="Commit message..." value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)} rows={3}
                  style={{ marginTop: 10, fontSize: 11 }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <Button variant="primary" size="sm" disabled={!commitMsg.trim()} onClick={async () => {
                    if (stageAll) {
                      const all = gitFiles.map((f) => f.path);
                      await window.api.git.stage(all);
                    }
                    await window.api.git.commit(commitMsg);
                    setCommitMsg("");
                    await loadGitData();
                  }}>
                    <GitCommit size={11} /> Commit {stageAll ? "all" : ""}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStageAll(!stageAll)}>
                    {stageAll ? "Stage selected" : "Stage all"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : showInspector && inspectedEl ? (
        <div className="code-chat" style={{ width: chatWidth }}>
          <div className="code-chat-header mono">Element Inspector<div className="grow" />
            <span className="mono" style={{fontSize:10,color:"var(--text-muted)"}}>{accumulatedEditsRef.current.size} edits</span>
          </div>
          <div className="code-chat-body" style={{ overflow: "auto" }}>
            <ElementInspector element={inspectedEl}
              key={inspectedEl.selector}
              initialEdits={accumulatedEditsRef.current.get(inspectedEl.selector)}
              onApplyEdit={(style, text, targetMode) => {
                previewWindow()?.postMessage({type:"shmakk:applyEdit", style, text}, "*");
                accumulatedEditsRef.current.set(inspectedSelectorRef.current, { style, text: text || undefined, target: targetMode });
              }}
              onSave={(style, text, targetMode) => {
                if (isHtmlFile && activeOpen && editorRef) {
                  let content = activeOpen.content;
                  const el = inspectedEl!;
                  const styleStr = Object.entries(style).map(([k, v]) => `${k}:${v}`).join(";");
                  if (text) content = content.replace(el.text, text);
                  if (Object.keys(style).length) {
                    const tagRegex = new RegExp(`<${el.tag}[^>]*>`, "i");
                    const match = content.match(tagRegex);
                    if (match) {
                      let newTag = match[0];
                      if (/style\s*=\s*["']/.test(newTag)) newTag = newTag.replace(/style\s*=\s*["'][^"']*["']/, `style="${styleStr}"`);
                      else newTag = newTag.replace(/>$/, ` style="${styleStr}">`);
                      content = content.replace(match[0], newTag);
                    }
                  }
                  const model = editorRef.getModel();
                  if (model) {
                    editorRef.executeEdits("save-inspector", [{ range: model.getFullModelRange(), text: content }]);
                    setOpenFiles((p) => p.map((f) => f.path === activeOpenPath ? { ...f, content, isDirty: true } : f));
                  }
                }
                accumulatedEditsRef.current.set(inspectedSelectorRef.current, { style, text: text || undefined, target: targetMode });
              }}
              onDelete={() => { previewWindow()?.postMessage({type:"shmakk:deleteElement"},"*"); setShowInspector(false); }}
              onAskAI={(prompt) => {
                handleCodeChatSend(
                  buildInspectorPrompt(inspectedEl!, "", { userPrompt: prompt }),
                  { display: prompt }
                );
                setShowInspector(false);
              }}
              onClose={() => setShowInspector(false)}
              onCancelAll={handleCancelEdits}
              onSaveAll={handleSaveAllEdits}
              savedCount={accumulatedEditsRef.current.size}
            />
          </div>
        </div>
      ) : (
        <div className="code-chat" style={{ width: chatWidth, display: previewFullscreen ? "none" : undefined }}>
        <div className="code-chat-header mono">Code Chat{chatContextCount > 0 && <span className="code-chat-ctx-badge">+{chatContextCount}</span>}<div className="grow" />{chatLoading&&<span className="code-chat-loading"><span className="code-chat-spinner" />thinking</span>}</div>
        <div className="code-chat-body">
          {chatMessages.length===0&&!chatLoading?(
            <div className="code-chat-empty">
              <div className="code-chat-empty-glyph"><FileCode size={20} strokeWidth={1.5} /></div>
              <h4>Code Chat</h4>
              <p>Select code in the editor to fix, explain, or generate.</p>
              {selection && <div className="code-chat-actions">
                {[{a:"fix",i:Bug,c:"fix"},{a:"explain",i:FileCode,c:"explain"},{a:"generate",i:Wand2,c:"generate"}].map(({a,i:Icon,c})=>(
                  <button key={a} className="code-chat-action" onClick={()=>handleCodeAction(a as any)} type="button">
                    <span className={`code-chat-action-icon ${c}`}><Icon size={14}/></span>
                    <span className="code-chat-action-text"><span className="title">{a.charAt(0).toUpperCase()+a.slice(1)}</span><span className="hint">{a==="fix"?"Find bugs, add safety":a==="explain"?"What this code does":"Write tests, add features"}</span></span>
                  </button>
                ))}
              </div>}
            </div>
          ):(
            <div className="code-chat-conversation">
              {chatMessages.map((m,i)=>(
                <div key={i} className={`cc-msg ${m.role}`}>
                  {m.role==="agent"&&(m.diff||m.changes)?<div className="cc-diff-group">
                    {m.changes ? m.changes.map((c, ci) => {
                      const applied = c.state === "applied";
                      const rejected = c.state === "rejected";
                      const done = applied || rejected;
                      return (
                        <div key={ci} className={`cc-change ${applied ? "cc-diff-applied" : rejected ? "cc-diff-rejected" : ""}`}>
                          {c.filePath && <div className="cc-diff-file mono">{c.filePath}{applied ? " · Applied" : rejected ? " · Rejected" : ""}</div>}
                          <div className="cc-change-content">
                            <div className="cc-change-row cc-change-find"><span className="cc-change-label">−</span><code className="mono">{c.find.slice(0, 300)}{c.find.length > 300 ? "…" : ""}</code></div>
                            <div className="cc-change-row cc-change-repl"><span className="cc-change-label">+</span><code className="mono">{c.replace.slice(0, 300)}{c.replace.length > 300 ? "…" : ""}</code></div>
                          </div>
                          {!done && (
                            <div className="cc-apply-bar">
                              <Check size={12}/><span>1 change</span><div className="grow"/>
                              <Button variant="ghost" size="sm" onClick={() => handleRejectChange(i, ci)}>Reject</Button>
                              <Button variant="primary" size="sm" onClick={() => handleApplyChange(m, i, ci)}>Apply</Button>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <div className="cc-diff">
                        <pre className="cc-diff-content mono">{m.diff}</pre>
                        {m.diffStats && <div className="cc-diff-stats mono">{m.diffStats}</div>}
                      </div>
                    )}
                    {m.changes && m.changes.length > 1 && m.changes.some(c => !c.state) && (
                      <div className="cc-apply-all-bar">
                        <Button variant="primary" size="sm" onClick={() => handleApplyAllChanges(m, i)}>Apply all ({m.changes.filter(c => !c.state).length})</Button>
                      </div>
                    )}
                    {m.content && <MarkdownRenderer content={m.content} className="cc-msg-text"/>}
                  </div>
                  :m.role==="agent"?<MarkdownRenderer content={m.content} className="cc-msg-text"/>
                  :<div className="cc-user-msg">
                    <span>{m.content}</span>
                    {m.detail && (
                      <button className="cc-msg-expand" onClick={() => setExpandedMsgs((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} type="button" title="Show full prompt">
                        {expandedMsgs.has(i) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                    )}
                  </div>}
                  {m.detail && expandedMsgs.has(i) && (
                    <pre className="cc-msg-detail mono">{m.detail}</pre>
                  )}
                </div>
              ))}
              {chatLoading&&<div className="cc-streaming"><span className="cc-streaming-dots"><span/><span/><span/></span></div>}
            </div>
          )}
        </div>
        <div className="cc-composer">
          <Composer value={chatInput} onChange={setChatInput} onSend={() => handleCodeChatSend()} placeholder={selection?"Describe changes...":"Ask about this file..."}
            disabled={chatLoading} />
        </div>
      </div>
      )}
    </div>
  );
}
