import { contextBridge, ipcRenderer } from "electron";

export interface SessionSummary {
  id: string;
  startedAt: number;
  endedAt: number | null;
  workspace: string;
  summary: string;
  turnCount: number;
}

export interface SessionDetail extends SessionSummary {
  turns: Array<{
    id: string;
    ts: number;
    role: string;
    content: string;
  }>;
}

export interface SkillEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  installed: boolean;
  enabled: boolean;
  source: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ProjectFile {
  path: string;
  status: string;
}

export interface EndpointEntry {
  id: string;
  name: string;
  url: string;
  type: string;
}

export interface InstalledPlugin {
  name: string;
  description: string;
  version: string;
  author: string;
  installPath: string;
  installedAt: string;
  skills: string[];
  commands: string[];
  agents: string[];
}

export interface ConfigStatus {
  endpoint: string;
  model: string;
  connected: boolean;
  provider: string | null;
  providers: EndpointEntry[];
  defaultProvider: string | null;
}

export interface ChatResult {
  content?: string;
  ok?: boolean;
  reply?: string;
  error?: string;
}

export interface ToolConfirmPayload {
  tool: {
    id: string;
    name: string;
    args: string;
    safety: string;
    description: string;
  };
}

export interface CoworkActivity {
  runId: string;
  time: string;
  agent: string;
  action: "think" | "tool" | "file" | "done" | "error";
  detail: string;
}

export interface CoworkDone {
  runId: string;
  reply?: string;
  edits?: Array<{ path: string; status: string; content: string }>;
  cancelled?: boolean;
}

export interface CoworkError {
  runId: string;
  error: string;
}

export interface STSState {
  state: "listening" | "thinking" | "speaking" | "off";
}

type Unsubscribe = () => void;

export type Api = {
  commands: {
    list: () => Promise<{ commands: Array<{ name: string; plugin: string; description: string }> }>;
  };
  artifacts: {
    list: () => Promise<{ files: Array<{ name: string; size: number; mtime: number }> }>;
    read: (fileName: string) => Promise<{ content: string; name: string } | null>;
    delete: (fileName: string) => Promise<boolean>;
  };
  design: {
    generate: (prompt: string, designType: string) => Promise<{ ok?: boolean; html?: string; error?: string }>;
    onToken: (callback: (data: { text: string; done: boolean; html?: string; error?: string }) => void) => Unsubscribe;
  };
  code: {
    chat: (opts: { filePath: string; fullFile: string; selection: string; action: string }) =>
      Promise<{ ok?: boolean; reply?: string; diff?: string; error?: string }>;
  };
  preview: {
    startDevServer: (packageJsonPath: string) => Promise<{ ok?: boolean; scriptName?: string; error?: string; url?: string }>;
    stopDevServer: () => Promise<boolean>;
    getDevServerUrl: () => Promise<{ url: string; running: boolean }>;
    onServerReady: (callback: (data: { url: string }) => void) => Unsubscribe;
    onServerError: (callback: (data: { error: string }) => void) => Unsubscribe;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  workspace: {
    getRoot: () => Promise<string>;
    setRoot: (path: string) => Promise<void>;
    listFiles: (dirPath?: string) => Promise<FileEntry[]>;
    readFile: (filePath: string) => Promise<string | null>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
    renameFile: (oldPath: string, newName: string) => Promise<boolean>;
    getProjectFiles: () => Promise<ProjectFile[]>;
    watchFiles: () => Promise<boolean>;
    unwatchFiles: () => Promise<boolean>;
  };
  git: {
    branches: () => Promise<{ current: string; branches: string[] }>;
    status: () => Promise<{ files: Array<{ path: string; status: string }> }>;
    log: () => Promise<{ commits: Array<{ hash: string; message: string; author: string; date: string }> }>;
    checkout: (branch: string) => Promise<{ ok: boolean; error?: string }>;
    createBranch: (name: string) => Promise<{ ok: boolean; error?: string }>;
    diff: (file?: string) => Promise<{ diff: string; error?: string }>;
    stage: (files: string[]) => Promise<{ ok: boolean; error?: string }>;
    commit: (message: string) => Promise<{ ok: boolean; error?: string }>;
    merge: (branch: string) => Promise<{ ok: boolean; error?: string }>;
    unstage: (files: string[]) => Promise<{ ok: boolean; error?: string }>;
  };
  dialog: {
    selectDirectory: () => Promise<string | null>;
  };
  config: {
    status: () => Promise<ConfigStatus>;
  };
  sessions: {
    list: (mode?: string) => Promise<SessionSummary[]>;
    get: (sessionId: string) => Promise<SessionDetail | null>;
    current: () => Promise<{ id: string; startedAt: number; summary: string } | null>;
    delete: (sessionId: string) => Promise<boolean>;
    create: (summary: string, workspace: string, mode?: string) => Promise<{ id: string; startedAt: number; summary: string; workspace: string; mode?: string } | null>;
    addTurn: (sessionId: string, role: string, content: string) => Promise<boolean>;
  };
  skills: {
    list: () => Promise<SkillEntry[]>;
    read: (skillId: string) => Promise<string | null>;
    toggle: (skillId: string, enabled: boolean) => Promise<boolean>;
  };
  rules: {
    get: () => Promise<string>;
    set: (content: string) => Promise<boolean>;
  };
  chat: {
    send: (providerId: string, model: string, messages: Array<{ role: string; content: string }>, sessionId?: string) => Promise<ChatResult>;
    cancel: () => void;
    respondToolConfirm: (toolId: string, approved: boolean) => Promise<boolean>;
    onToken: (callback: (text: string) => void) => Unsubscribe;
    onToolConfirm: (callback: (payload: ToolConfirmPayload) => void) => Unsubscribe;
    onToolAutoApproved: (callback: (payload: ToolConfirmPayload) => void) => Unsubscribe;
    setProfile: (profile: string) => Promise<void>;
    getProfile: () => Promise<string>;
  };
  settings: {
    getEndpoints: () => Promise<EndpointEntry[]>;
    addEndpoint: (id: string, name: string, url: string, apiKey: string) => Promise<boolean>;
    deleteEndpoint: (id: string) => Promise<boolean>;
  };
  plugins: {
    installFromFolder: () => Promise<{ installed?: InstalledPlugin; error?: string }>;
    list: () => Promise<InstalledPlugin[]>;
    uninstall: (pluginName: string) => Promise<boolean>;
    scaffold: (description: string, pluginName?: string) => Promise<{ ok?: boolean; pluginName?: string; pluginDir?: string; files?: Array<{ path: string; content: string }>; error?: string }>;
    installScaffolded: (pluginDir: string) => Promise<{ installed?: InstalledPlugin; error?: string }>;
    readFiles: (pluginName: string) => Promise<{ files?: Array<{ path: string; content: string }>; error?: string }>;
    writeFile: (pluginName: string, filePath: string, content: string) => Promise<boolean>;
  };
  cowork: {
    execute: (opts: { runId: string; prompt: string; profile?: string; autoApprove?: boolean; skills?: string[]; topology?: string }) =>
      Promise<{ ok?: boolean; reply?: string; edits?: Array<{ path: string; status: string; content: string }>; cancelled?: boolean; error?: string }>;
    cancel: (runId: string) => void;
    onActivity: (callback: (data: CoworkActivity) => void) => Unsubscribe;
    onDone: (callback: (data: CoworkDone) => void) => Unsubscribe;
    onError: (callback: (data: CoworkError) => void) => Unsubscribe;
  };
  sessionFiles: {
    list: (sessionId: string) => Promise<{ files: Array<{ name: string; size: number }> }>;
    read: (sessionId: string, fileName: string) => Promise<string | null>;
    saveCopy: (sessionId: string, fileName: string, content: string) => Promise<{ path: string }>;
    promoteToArtifacts: (sessionId: string, fileName: string) => Promise<boolean>;
  };
  schedules: {
    list: () => Promise<Array<{ id: string; name: string; when: string; cron: string; prompt: string; profile: string; enabled: boolean; lastRun: number | null; nextRun: number | null; createdAt: number }>>;
    create: (data: { name: string; when: string; prompt: string; profile: string }) => Promise<{ schedule?: { id: string; name: string; when: string; cron: string; prompt: string; profile: string; enabled: boolean; lastRun: number | null; nextRun: number | null; createdAt: number } }>;
    delete: (id: string) => Promise<boolean>;
    toggle: (id: string, enabled: boolean) => Promise<boolean>;
    update: (id: string, data: { name?: string; when?: string; prompt?: string; profile?: string }) => Promise<boolean>;
  };
  voice: {
    listVoices: () => Promise<{ voices?: Array<{ id: string; name: string; language: string; gender: string }>; error?: string }>;
    speak: (text: string, opts?: { voice?: string; speed?: number }) => Promise<{ ok?: boolean; error?: string }>;
    stopSpeaking: () => Promise<boolean>;
    transcribe: (audioPath: string) => Promise<{ text?: string; error?: string }>;
    recordAndTranscribe: (opts?: { language?: string; maxDurationSec?: number }) => Promise<{ text?: string; error?: string }>;
    checkAvailability: () => Promise<{ ttsAvailable: boolean; sttAvailable: boolean; microphoneAvailable: boolean; recorder: string | null }>;
    testMicrophone: () => Promise<{ ok: boolean; recorder: string | null; fileSize: number | null; error: string | null }>;
    preloadSTT: () => Promise<boolean>;
    isTTSCached: () => Promise<{ cached: boolean }>;
    isSTTCached: () => Promise<{ cached: boolean }>;
    startSTS: () => Promise<{ ok?: boolean; error?: string }>;
    stopSTS: () => void;
    interruptSTS: () => void;
    onSTSState: (callback: (state: STSState) => void) => Unsubscribe;
    onSTSTranscription: (callback: (data: { text: string }) => void) => Unsubscribe;
  };
};

contextBridge.exposeInMainWorld("api", {
  commands: {
    list: () => ipcRenderer.invoke("commands:list"),
  },
  artifacts: {
    list: () => ipcRenderer.invoke("artifacts:list"),
    read: (fileName) => ipcRenderer.invoke("artifacts:read", fileName),
    delete: (fileName) => ipcRenderer.invoke("artifacts:delete", fileName),
  },
  design: {
    generate: (prompt, designType) => ipcRenderer.invoke("design:generate", prompt, designType),
    onToken: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { text: string; done: boolean; html?: string; error?: string }) => callback(data);
      ipcRenderer.on("design:token", handler);
      return () => ipcRenderer.removeListener("design:token", handler);
    },
  },
  code: {
    chat: (opts) => ipcRenderer.invoke("code:chat", opts),
  },
  preview: {
    startDevServer: (packageJsonPath) => ipcRenderer.invoke("preview:startDevServer", packageJsonPath),
    stopDevServer: () => ipcRenderer.invoke("preview:stopDevServer"),
    getDevServerUrl: () => ipcRenderer.invoke("preview:getDevServerUrl"),
    onServerReady: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { url: string }) => callback(data);
      ipcRenderer.on("preview:serverReady", handler);
      return () => ipcRenderer.removeListener("preview:serverReady", handler);
    },
    onServerError: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
      ipcRenderer.on("preview:serverError", handler);
      return () => ipcRenderer.removeListener("preview:serverError", handler);
    },
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  },
  workspace: {
    getRoot: () => ipcRenderer.invoke("workspace:getRoot"),
    setRoot: (path: string) => ipcRenderer.invoke("workspace:setRoot", path),
    listFiles: (dirPath?: string) => ipcRenderer.invoke("workspace:listFiles", dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke("workspace:readFile", filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke("workspace:writeFile", filePath, content),
    deleteFile: (filePath: string) => ipcRenderer.invoke("workspace:deleteFile", filePath),
    renameFile: (oldPath: string, newName: string) => ipcRenderer.invoke("workspace:renameFile", oldPath, newName),
    getProjectFiles: () => ipcRenderer.invoke("workspace:getProjectFiles"),
    watchFiles: () => ipcRenderer.invoke("workspace:watchFiles"),
    unwatchFiles: () => ipcRenderer.invoke("workspace:unwatchFiles"),
  },
  git: {
    branches: () => ipcRenderer.invoke("git:branches"),
    status: () => ipcRenderer.invoke("git:status"),
    log: () => ipcRenderer.invoke("git:log"),
    checkout: (branch: string) => ipcRenderer.invoke("git:checkout", branch),
    createBranch: (name: string) => ipcRenderer.invoke("git:createBranch", name),
    diff: (file?: string) => ipcRenderer.invoke("git:diff", file),
    stage: (files: string[]) => ipcRenderer.invoke("git:stage", files),
    commit: (message: string) => ipcRenderer.invoke("git:commit", message),
    merge: (branch: string) => ipcRenderer.invoke("git:merge", branch),
    unstage: (files: string[]) => ipcRenderer.invoke("git:unstage", files),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),
  },
  config: {
    status: () => ipcRenderer.invoke("config:status"),
  },
  sessions: {
    list: (mode) => ipcRenderer.invoke("sessions:list", mode),
    get: (sessionId: string) => ipcRenderer.invoke("sessions:get", sessionId),
    current: () => ipcRenderer.invoke("sessions:current"),
    delete: (sessionId: string) => ipcRenderer.invoke("sessions:delete", sessionId),
    create: (summary, workspace, mode) => ipcRenderer.invoke("sessions:create", summary, workspace, mode),
    addTurn: (sessionId: string, role: string, content: string) => ipcRenderer.invoke("sessions:addTurn", sessionId, role, content),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    read: (skillId: string) => ipcRenderer.invoke("skills:read", skillId),
    toggle: (skillId: string, enabled: boolean) => ipcRenderer.invoke("skills:toggle", skillId, enabled),
  },
  rules: {
    get: () => ipcRenderer.invoke("rules:get"),
    set: (content: string) => ipcRenderer.invoke("rules:set", content),
  },
  chat: {
    send: (providerId: string, model: string, messages: Array<{ role: string; content: string }>, sessionId?: string) =>
      ipcRenderer.invoke("chat:send", providerId, model, messages, sessionId),
    cancel: () => ipcRenderer.send("chat:cancel"),
    respondToolConfirm: (toolId: string, approved: boolean) =>
      ipcRenderer.invoke("chat:respondToolConfirm", toolId, approved),
    onToken: (callback: (text: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { text: string }) => callback(data.text);
      ipcRenderer.on("chat:token", handler);
      return () => ipcRenderer.removeListener("chat:token", handler);
    },
    onToolConfirm: (callback: (payload: ToolConfirmPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ToolConfirmPayload) => callback(data);
      ipcRenderer.on("chat:toolConfirm", handler);
      return () => ipcRenderer.removeListener("chat:toolConfirm", handler);
    },
    onToolAutoApproved: (callback: (payload: ToolConfirmPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ToolConfirmPayload) => callback(data);
      ipcRenderer.on("chat:toolAutoApproved", handler);
      return () => ipcRenderer.removeListener("chat:toolAutoApproved", handler);
    },
    setProfile: (profile: string) => ipcRenderer.invoke("chat:setProfile", profile),
    getProfile: () => ipcRenderer.invoke("chat:getProfile"),
  },
  settings: {
    getEndpoints: () => ipcRenderer.invoke("settings:getEndpoints"),
    addEndpoint: (id: string, name: string, url: string, apiKey: string) =>
      ipcRenderer.invoke("settings:addEndpoint", id, name, url, apiKey),
    deleteEndpoint: (id: string) => ipcRenderer.invoke("settings:deleteEndpoint", id),
  },
  plugins: {
    installFromFolder: () => ipcRenderer.invoke("plugins:installFromFolder"),
    list: () => ipcRenderer.invoke("plugins:list"),
    uninstall: (pluginName: string) => ipcRenderer.invoke("plugins:uninstall", pluginName),
    scaffold: (description, pluginName) => ipcRenderer.invoke("plugins:scaffold", description, pluginName),
    installScaffolded: (pluginDir) => ipcRenderer.invoke("plugins:installScaffolded", pluginDir),
    readFiles: (pluginName) => ipcRenderer.invoke("plugins:readFiles", pluginName),
    writeFile: (pluginName, filePath, content) => ipcRenderer.invoke("plugins:writeFile", pluginName, filePath, content),
  },
  cowork: {
    execute: (opts) => ipcRenderer.invoke("cowork:execute", opts),
    cancel: (runId) => ipcRenderer.send("cowork:cancel", runId),
    onActivity: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: CoworkActivity) => callback(data);
      ipcRenderer.on("cowork:activity", handler);
      return () => ipcRenderer.removeListener("cowork:activity", handler);
    },
    onDone: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: CoworkDone) => callback(data);
      ipcRenderer.on("cowork:done", handler);
      return () => ipcRenderer.removeListener("cowork:done", handler);
    },
    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: CoworkError) => callback(data);
      ipcRenderer.on("cowork:error", handler);
      return () => ipcRenderer.removeListener("cowork:error", handler);
    },
  },
  schedules: {
    list: () => ipcRenderer.invoke("schedules:list"),
    create: (data) => ipcRenderer.invoke("schedules:create", data),
    delete: (id) => ipcRenderer.invoke("schedules:delete", id),
    toggle: (id, enabled) => ipcRenderer.invoke("schedules:toggle", id, enabled),
    update: (id, data) => ipcRenderer.invoke("schedules:update", id, data),
  },
  sessionFiles: {
    list: (sessionId) => ipcRenderer.invoke("session-files:list", sessionId),
    read: (sessionId, fileName) => ipcRenderer.invoke("session-files:read", sessionId, fileName),
    saveCopy: (sessionId, fileName, content) => ipcRenderer.invoke("session-files:saveCopy", sessionId, fileName, content),
    promoteToArtifacts: (sessionId, fileName) => ipcRenderer.invoke("session-files:promoteToArtifacts", sessionId, fileName),
  },
  voice: {
    listVoices: () => ipcRenderer.invoke("voice:listVoices"),
    speak: (text, opts) => ipcRenderer.invoke("voice:speak", text, opts),
    stopSpeaking: () => ipcRenderer.invoke("voice:stopSpeaking"),
    transcribe: (audioPath) => ipcRenderer.invoke("voice:transcribe", audioPath),
    recordAndTranscribe: (opts) => ipcRenderer.invoke("voice:recordAndTranscribe", opts),
    checkAvailability: () => ipcRenderer.invoke("voice:checkAvailability"),
    testMicrophone: () => ipcRenderer.invoke("voice:testMicrophone"),
    preloadSTT: () => ipcRenderer.invoke("voice:preloadSTT"),
    isTTSCached: () => ipcRenderer.invoke("voice:isTTSCached"),
    isSTTCached: () => ipcRenderer.invoke("voice:isSTTCached"),
    startSTS: () => ipcRenderer.invoke("voice:startSTS"),
    stopSTS: () => ipcRenderer.send("voice:stopSTS"),
    interruptSTS: () => ipcRenderer.send("voice:interruptSTS"),
    onSTSState: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: STSState) => callback(data);
      ipcRenderer.on("chat:stsState", handler);
      return () => ipcRenderer.removeListener("chat:stsState", handler);
    },
    onSTSTranscription: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { text: string }) => callback(data);
      ipcRenderer.on("chat:stsTranscription", handler);
      return () => ipcRenderer.removeListener("chat:stsTranscription", handler);
    },
  },
} satisfies Api);
