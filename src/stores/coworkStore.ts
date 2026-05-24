import { create } from "zustand";
import { useChatStore } from "./chatStore";

export interface CoworkActivity {
  runId: string;
  time: string;
  agent: string;
  action: "think" | "tool" | "file" | "done" | "error";
  detail: string;
}

export interface CoworkFileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  content: string;
}

export interface CoworkRun {
  id: string;
  prompt: string;
  profile: string;
  startedAt: number;
  status: "running" | "done" | "cancelled" | "error";
  activity: CoworkActivity[];
  fileChanges: CoworkFileChange[];
  reply: string;
  error: string;
  autoApprove: boolean;
}

export interface CoworkSession {
  id: string;
  name: string;
  users: string[];
  workspace: string;
}

interface CoworkState {
  sessions: CoworkSession[];
  activeSessionId: string | null;
  runs: CoworkRun[];
  activeRunId: string | null;
  onlineCount: number;
  autoApprove: boolean;

  // Run management
  startRun: (opts: { prompt: string; profile?: string; autoApprove?: boolean }) => Promise<void>;
  cancelRun: (runId: string) => void;
  selectRun: (runId: string) => void;

  // Activity
  pushActivity: (entry: CoworkActivity) => void;
  setRunFiles: (runId: string, files: CoworkFileChange[]) => void;
  finishRun: (runId: string, reply: string, files?: CoworkFileChange[]) => void;
  cancelRunDone: (runId: string) => void;
  failRun: (runId: string, error: string) => void;

  // Settings
  setAutoApprove: (v: boolean) => void;

  // Sessions
  setActiveSession: (id: string) => void;
  createSession: (name: string) => void;
}

let runCounter = 0;

export const useCoworkStore = create<CoworkState>((set, get) => {
  // Register IPC listeners at store level — survive tab switches
  if (typeof window !== "undefined" && window.api?.cowork) {
    window.api.cowork.onActivity((data) => {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === data.runId
            ? { ...r, activity: [...r.activity, data] }
            : r
        ),
      }));
    });
    window.api.cowork.onDone((data) => {
      if (data.cancelled) {
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === data.runId ? { ...r, status: "cancelled" as const } : r
          ),
        }));
      } else {
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === data.runId
              ? { ...r, status: "done" as const, reply: data.reply || r.reply, fileChanges: (data.edits as any) || r.fileChanges }
              : r
          ),
        }));
        // Persist to session
        const activeId = useChatStore.getState().activeId;
        const run = get().runs.find((r) => r.id === data.runId);
        if (activeId && !activeId.startsWith("conv-") && run) {
          window.api.sessions.addTurn(activeId, "user", run.prompt).catch(() => {});
          window.api.sessions.addTurn(activeId, "assistant", JSON.stringify({
            type: "cowork", reply: data.reply || "", prompt: run.prompt, edits: data.edits,
          })).catch(() => {});
        }
      }
    });
    window.api.cowork.onError((data) => {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === data.runId ? { ...r, status: "error" as const, error: data.error } : r
        ),
      }));
    });
  }

  return ({
  sessions: [],
  activeSessionId: null,
  runs: [],
  activeRunId: null,
  onlineCount: 1,
  autoApprove: false,

  startRun: async (opts) => {
    const runId = `run-${Date.now()}-${++runCounter}`;
    const run: CoworkRun = {
      id: runId,
      prompt: opts.prompt,
      profile: opts.profile || "balanced",
      startedAt: Date.now(),
      status: "running",
      activity: [],
      fileChanges: [],
      reply: "",
      error: "",
      autoApprove: opts.autoApprove ?? get().autoApprove,
    };

    set((s) => ({
      runs: [...s.runs, run],
      activeRunId: runId,
    }));

    // Fire and forget — the run completes via IPC events
    window.api.cowork.execute({
      runId,
      prompt: opts.prompt,
      profile: opts.profile || "balanced",
      autoApprove: opts.autoApprove ?? get().autoApprove,
    }).then((result) => {
      if (result.error) {
        get().failRun(runId, result.error);
      } else if (result.cancelled) {
        get().cancelRunDone(runId);
      } else if (result.ok !== undefined || result.reply !== undefined) {
        get().finishRun(runId, result.reply || "", result.edits as CoworkFileChange[]);
      }
    }).catch((err) => {
      get().failRun(runId, err instanceof Error ? err.message : String(err));
    });
  },

  cancelRun: (runId) => {
    window.api.cowork.cancel(runId);
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, status: "cancelled" as const } : r,
      ),
    }));
  },

  selectRun: (runId) => set({ activeRunId: runId }),

  pushActivity: (entry) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === entry.runId
          ? { ...r, activity: [...r.activity.slice(-499), entry] }
          : r,
      ),
    }));
  },

  setRunFiles: (runId, files) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, fileChanges: files } : r,
      ),
    }));
  },

  finishRun: (runId, reply, files) => {
    const changes: CoworkFileChange[] = (files || []).map((f) => ({
      path: f.path,
      status: (f.status === "added" || f.status === "modified" || f.status === "deleted" ? f.status : "modified") as CoworkFileChange["status"],
      content: f.content,
    }));
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "done",
              reply,
              fileChanges: changes.length > 0 ? changes : r.fileChanges,
            }
          : r,
      ),
    }));
  },

  cancelRunDone: (runId) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, status: "cancelled" } : r,
      ),
    }));
  },

  failRun: (runId, error) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, status: "error", error } : r,
      ),
    }));
  },

  setAutoApprove: (autoApprove) => set({ autoApprove }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  createSession: (name) =>
    set((s) => ({
      sessions: [
        ...s.sessions,
        {
          id: `cw-${Date.now()}`,
          name,
          users: ["You"],
          workspace: "general",
        },
      ],
      activeSessionId: s.activeSessionId,
    })),
  });
});
