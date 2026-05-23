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

export interface ConfigStatus {
  endpoint: string;
  model: string;
  connected: boolean;
  provider: string | null;
  providers: EndpointEntry[];
  defaultProvider: string | null;
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

export interface PluginInstallResult {
  installed?: InstalledPlugin;
  error?: string;
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

export interface Api {
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
    installFromFolder: () => Promise<PluginInstallResult>;
    list: () => Promise<InstalledPlugin[]>;
    uninstall: (pluginName: string) => Promise<boolean>;
    scaffold: (description: string, pluginName?: string) => Promise<{ ok?: boolean; pluginName?: string; pluginDir?: string; files?: Array<{ path: string; content: string }>; error?: string }>;
    installScaffolded: (pluginDir: string) => Promise<PluginInstallResult>;
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
    onSTSState: (callback: (data: STSState) => void) => Unsubscribe;
    onSTSTranscription: (callback: (data: { text: string }) => void) => Unsubscribe;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
