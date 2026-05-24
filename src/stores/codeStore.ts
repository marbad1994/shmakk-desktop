import { create } from "zustand";

export interface OpenFile {
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface CodeChange {
  filePath: string;
  find: string;
  replace: string;
  state?: "pending" | "applied" | "rejected";
}

export interface CodeChatMsg {
  role: "user" | "agent";
  content: string;
  diff?: string;
  diffStats?: string;
  changes?: CodeChange[];
  detail?: string;
}

type Updater<T> = T | ((prev: T) => T);

interface CodeStore {
  openFiles: OpenFile[];
  activeOpenPath: string | null;
  chatMessages: CodeChatMsg[];
  chatInput: string;
  showPreview: boolean;
  previewHtml: string;
  previewUrl: string;
  devServerRunning: boolean;
  showInspector: boolean;
  inspectedEl: any;

  setOpenFiles: (files: Updater<OpenFile[]>) => void;
  setActiveOpenPath: (path: Updater<string | null>) => void;
  setChatMessages: (msgs: Updater<CodeChatMsg[]>) => void;
  setChatInput: (input: string) => void;
  setShowPreview: (v: boolean) => void;
  setPreviewHtml: (html: string) => void;
  setPreviewUrl: (url: string) => void;
  setDevServerRunning: (v: boolean) => void;
  setShowInspector: (v: boolean) => void;
  setInspectedEl: (el: any) => void;
}

function resolve<T>(val: Updater<T>, prev: T): T {
  return typeof val === "function" ? (val as (prev: T) => T)(prev) : val;
}

export const useCodeStore = create<CodeStore>((set) => ({
  openFiles: [],
  activeOpenPath: null,
  chatMessages: [],
  chatInput: "",
  showPreview: false,
  previewHtml: "",
  previewUrl: "",
  devServerRunning: false,
  showInspector: false,
  inspectedEl: null,

  setOpenFiles: (files) => set((s) => ({ openFiles: resolve(files, s.openFiles) })),
  setActiveOpenPath: (path) => set((s) => ({ activeOpenPath: resolve(path, s.activeOpenPath) })),
  setChatMessages: (msgs) => set((s) => ({ chatMessages: resolve(msgs, s.chatMessages) })),
  setChatInput: (input) => set({ chatInput: input }),
  setShowPreview: (v) => set({ showPreview: v }),
  setPreviewHtml: (html) => set({ previewHtml: html }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setDevServerRunning: (v) => set({ devServerRunning: v }),
  setShowInspector: (v) => set({ showInspector: v }),
  setInspectedEl: (el) => set({ inspectedEl: el }),
}));
