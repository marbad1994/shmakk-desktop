import { create } from "zustand";
import { useChatStore } from "./chatStore";

export interface DesignEntry {
  id: string;
  prompt: string;
  html: string;
  designType: string;
  createdAt: number;
}

interface DesignSnapshot {
  history: DesignEntry[];
  currentHtml: string;
  streaming: boolean;
  error: string | null;
  currentPrompt: string;
  currentDesignType: string;
}

interface DesignStore {
  activeSessionId: string | null;
  sessions: Record<string, DesignSnapshot>;
  history: DesignEntry[];
  currentHtml: string;
  streaming: boolean;
  error: string | null;
  currentPrompt: string;
  currentDesignType: string;
  setActiveSession: (sessionId: string | null) => void;
  addEntry: (entry: DesignEntry) => void;
  setCurrentHtml: (html: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentPrompt: (p: string) => void;
  setCurrentDesignType: (t: string) => void;
  openArtifact: (sessionId: string, fileName: string, html: string) => void;
  clearHistory: () => void;
}

let nextId = 0;
function genId() { return `design-${Date.now()}-${nextId++}`; }

function safeDesignFileName(prompt: string, designType: string): string {
  const stem = (prompt || designType || "design")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "design";
  return `${Date.now()}-${stem}.html`;
}

function emptySnapshot(): DesignSnapshot {
  return {
    history: [],
    currentHtml: "",
    streaming: false,
    error: null,
    currentPrompt: "",
    currentDesignType: "",
  };
}

function snapshotFromState(state: Pick<DesignStore, "history" | "currentHtml" | "streaming" | "error" | "currentPrompt" | "currentDesignType">): DesignSnapshot {
  return {
    history: state.history.map((entry) => ({ ...entry })),
    currentHtml: state.currentHtml,
    streaming: state.streaming,
    error: state.error,
    currentPrompt: state.currentPrompt,
    currentDesignType: state.currentDesignType,
  };
}

async function persistDesignArtifact(sessionId: string | null, prompt: string, designType: string, html: string) {
  if (!sessionId) return;
  const fileName = safeDesignFileName(prompt, designType);
  const saveTarget = async () => {
    try {
      const projects = await window.api.projects.getForSession(sessionId);
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

  if (!sessionId.startsWith("conv-")) {
    await window.api.sessionFiles.saveCopy(sessionId, fileName, html).catch(() => {});
  }
  await saveTarget();
}

let designListenerRegistered = false;

export const useDesignStore = create<DesignStore>((set, get) => {
  // Register IPC listener at store level — lives forever
  if (!designListenerRegistered && typeof window !== "undefined" && window.api?.design?.onToken) {
    designListenerRegistered = true;
    window.api.design.onToken((data) => {
      if (data.done) {
        const activeSessionId = get().activeSessionId ?? useChatStore.getState().activeId;
        const currentPrompt = get().currentPrompt;
        const currentDesignType = get().currentDesignType;
        set((s) => {
          const next = {
            ...s,
            streaming: false,
            error: data.error ? data.error : s.error,
          };
          return {
            streaming: false,
            error: data.error || null,
            sessions: activeSessionId ? { ...s.sessions, [activeSessionId]: snapshotFromState(next) } : s.sessions,
          };
        });
        if (data.error) {
          return;
        }
        if (data.html) {
          const html = data.html;
          const activeId = activeSessionId ?? useChatStore.getState().activeId;
          set((s) => {
            const nextHistory = [...s.history, {
              id: genId(),
              prompt: currentPrompt || "",
              html,
              designType: currentDesignType || "",
              createdAt: Date.now(),
            }];
            const next = {
              ...s,
              currentHtml: html,
              currentPrompt: "",
              currentDesignType: "",
              error: null,
              history: nextHistory,
            };
            return {
              currentHtml: html,
              currentPrompt: "",
              currentDesignType: "",
              error: null,
              history: nextHistory,
              sessions: activeId ? { ...s.sessions, [activeId]: snapshotFromState(next) } : s.sessions,
            };
          });
          if (activeId) {
            void persistDesignArtifact(activeId, currentPrompt, currentDesignType, html);
          }
          if (activeId && !activeId.startsWith("conv-")) {
            window.api.sessions.addTurn(activeId, "user", currentPrompt || "").catch(() => {});
            window.api.sessions.addTurn(activeId, "assistant", JSON.stringify({ type: "design", html: html.slice(0, 50000), prompt: currentPrompt, designType: currentDesignType })).catch(() => {});
          }
        }
      }
    });
  }

  return {
    activeSessionId: null,
    sessions: {},
    history: [],
    currentHtml: "",
    streaming: false,
    error: null,
    currentPrompt: "",
    currentDesignType: "",

    setActiveSession: (sessionId) => set((s) => {
      const currentId = s.activeSessionId;
      const nextSessions = currentId ? {
        ...s.sessions,
        [currentId]: snapshotFromState(s),
      } : s.sessions;
      const restored = sessionId ? nextSessions[sessionId] : null;
      const snapshot = restored || emptySnapshot();
      return {
        activeSessionId: sessionId,
        sessions: nextSessions,
        history: snapshot.history,
        currentHtml: snapshot.currentHtml,
        streaming: snapshot.streaming,
        error: snapshot.error,
        currentPrompt: snapshot.currentPrompt,
        currentDesignType: snapshot.currentDesignType,
      };
    }),

    addEntry: (entry) => set((s) => {
      const savedEntry = { ...entry, id: entry.id || genId(), createdAt: entry.createdAt || Date.now() };
      const nextHistory = [...s.history, savedEntry];
      const next = { ...s, history: nextHistory, currentHtml: entry.html };
      return {
        history: nextHistory,
        currentHtml: entry.html,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),

    setCurrentHtml: (html) => set((s) => {
      const next = { ...s, currentHtml: html, error: null };
      return {
        currentHtml: html,
        error: null,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
    setStreaming: (v) => set((s) => {
      const next = { ...s, streaming: v };
      return {
        streaming: v,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
    setError: (error) => set((s) => {
      const next = { ...s, error };
      return {
        error,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
    setCurrentPrompt: (p) => set((s) => {
      const next = { ...s, currentPrompt: p };
      return {
        currentPrompt: p,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
    setCurrentDesignType: (t) => set((s) => {
      const next = { ...s, currentDesignType: t };
      return {
        currentDesignType: t,
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
    openArtifact: (sessionId, fileName, html) => set((s) => {
      const prompt = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "artifact";
      const snapshot: DesignSnapshot = {
        history: [],
        currentHtml: html,
        streaming: false,
        error: null,
        currentPrompt: prompt,
        currentDesignType: "",
      };
      return {
        activeSessionId: sessionId,
        history: snapshot.history,
        currentHtml: snapshot.currentHtml,
        streaming: snapshot.streaming,
        error: snapshot.error,
        currentPrompt: snapshot.currentPrompt,
        currentDesignType: snapshot.currentDesignType,
        sessions: {
          ...s.sessions,
          [sessionId]: snapshot,
        },
      };
    }),
    clearHistory: () => set((s) => {
      const next = { ...s, history: [], currentHtml: "", error: null, currentPrompt: "", currentDesignType: "" };
      return {
        history: [],
        currentHtml: "",
        error: null,
        currentPrompt: "",
        currentDesignType: "",
        sessions: s.activeSessionId ? { ...s.sessions, [s.activeSessionId]: snapshotFromState(next) } : s.sessions,
      };
    }),
  };
});
