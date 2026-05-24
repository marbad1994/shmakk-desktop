import { create } from "zustand";
import type { ToolCall } from "../components/ToolCard";

export interface CodeSnippet {
  code: string;
  language?: string;
  filename?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  streaming?: boolean;
  thinking?: string;
  toolCalls?: ToolCall[];
  codeBlocks?: CodeSnippet[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  mode?: string;
}

interface ChatStore {
  conversations: Conversation[];
  activeId: string | null;
  loaded: boolean;
  streamingMessageId: string | null;
  loadSessions: () => Promise<void>;
  loadSession: (detail: import("../types/api").SessionDetail) => void;
  addConversation: (mode?: string) => Promise<string>;
  forkConversation: (id: string) => Promise<string | null>;
  /** Load last session per mode and restore its messages */
  loadModeSession: (mode: string) => Promise<string | null>;
  activeMode: string;
  setActiveMode: (m: string) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, data: { title?: string }) => Promise<void>;
  setActive: (id: string) => void;
  addMessage: (convId: string, msg: Omit<Message, "id" | "timestamp">, opts?: { persist?: boolean }) => string;
  /** Append text to the last assistant message (for streaming) */
  appendToLastMessage: (convId: string, text: string) => void;
  /** Mark a message as streaming or not */
  setStreaming: (convId: string, msgId: string, streaming: boolean) => void;
  /** Set streaming state */
  setStreamingMessageId: (id: string | null) => void;
}

let nextId = 0;
const genConvId = () => `conv-${Date.now()}-${++nextId}`;
const genMsgId = () => `msg-${Date.now()}-${++nextId}`;
const GENERIC_TITLE_RE = /^(new conversation|new session|untitled session|session(?: .*)?|.+ session)$/i;

function isGenericTitle(title?: string): boolean {
  return !title?.trim() || GENERIC_TITLE_RE.test(title.trim());
}

function deriveTopicTitle(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\/\w+\s*/, "");

  if (!cleaned) return "New session";

  const sentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned;
  const words = sentence.split(" ").filter(Boolean).slice(0, 8);
  const title = words.join(" ").replace(/[,:;()[\]{}"']+$/g, "").trim();
  return title.length > 54 ? `${title.slice(0, 51).trim()}...` : title || "New session";
}

function titleForSession(
  summary: string | undefined,
  messages: Message[],
  fallback: string,
): string {
  if (!isGenericTitle(summary)) return summary!.trim();
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
  return firstUser ? deriveTopicTitle(firstUser.content) : fallback;
}

function isBlankConversation(c: Conversation): boolean {
  return c.messages.length === 0 && isGenericTitle(c.title);
}

function uniqueBlankTitle(conversations: Conversation[], mode: string): string {
  const sameMode = conversations.filter((c) => (c.mode || "chat") === mode);
  const existing = sameMode
    .filter(isBlankConversation)
    .map((c) => c.title.trim().toLowerCase());
  if (!existing.includes("new session")) return "New session";
  let idx = 2;
  while (existing.includes(`new session ${idx}`)) idx += 1;
  return `New session ${idx}`;
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.createdAt - a.createdAt);
}

function findReusableBlankConversation(conversations: Conversation[], mode: string): Conversation | null {
  return conversations.find((c) => (c.mode || "chat") === mode && isBlankConversation(c)) ?? null;
}

const pendingBlankConversationByMode = new Map<string, Promise<string>>();

function messagesFromTurns(detail: import("../types/api").SessionDetail): Message[] {
  return detail.turns.map((t, i) => ({
    id: t.id || `msg-${detail.id}-${i}`,
    role: mapRole(t.role),
    content: t.content,
    timestamp: t.ts,
  }));
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeId: null,
  loaded: false,
  streamingMessageId: null,
  activeMode: "chat",
  setActiveMode: (m) => set({ activeMode: m }),

  loadSessions: async () => {
    try {
      const sessions = await window.api.sessions.list();

      if (sessions.length === 0) {
        const id = genConvId();
        set({
          conversations: [
            {
              id,
              title: "New session",
              messages: [],
              createdAt: Date.now(),
              mode: "chat",
            },
          ],
          activeId: id,
          activeMode: "chat",
          loaded: true,
        });
        return;
      }

      const conversations: Conversation[] = [];
      for (const sess of sessions.slice(0, 20)) {
        const detail = await window.api.sessions.get(sess.id);
        if (!detail) continue;

        const messages = messagesFromTurns(detail);
        const title = titleForSession(sess.summary, messages, "New session");
        if (title !== sess.summary && !sess.id.startsWith("conv-")) {
          window.api.sessions.rename(sess.id, title).catch(() => {});
        }

        conversations.push({
          id: sess.id,
          title,
          messages,
          createdAt: sess.startedAt,
          mode: sess.mode || "chat",
        });
      }

      const sorted = sortConversations(conversations);
      set({
        conversations: sorted,
        activeId: sorted.length > 0 ? sorted[0].id : null,
        activeMode: sorted.length > 0 ? sorted[0]?.mode || "chat" : "chat",
        loaded: true,
      });
    } catch (err) {
      console.error("Failed to load sessions:", err);
      const id = genConvId();
      set({
        conversations: [
            {
              id,
              title: "New session",
              messages: [],
              createdAt: Date.now(),
              mode: "chat",
            },
          ],
        activeId: id,
        activeMode: "chat",
        loaded: true,
      });
    }
  },

  loadSession: (detail) => {
    const messages = messagesFromTurns(detail);
    const title = titleForSession(detail.summary, messages, "New session");
    if (title !== detail.summary && !detail.id.startsWith("conv-")) {
      window.api.sessions.rename(detail.id, title).catch(() => {});
    }
    set((s) => {
      const conversation: Conversation = {
        id: detail.id,
        title,
        messages,
        createdAt: detail.startedAt,
        mode: detail.mode || "chat",
      };
      if (s.conversations.some((c) => c.id === detail.id)) {
        return {
          conversations: sortConversations(s.conversations.map((c) => c.id === detail.id ? conversation : c)),
          activeId: detail.id,
          activeMode: conversation.mode || s.activeMode,
        };
      }
      return {
        conversations: sortConversations([conversation, ...s.conversations]),
        activeId: detail.id,
        activeMode: conversation.mode || s.activeMode,
      };
    });
  },

  addConversation: async (mode) => {
    const sessionMode = mode || get().activeMode || "chat";
    const reusable = findReusableBlankConversation(get().conversations, sessionMode);
    if (reusable) {
      set({ activeId: reusable.id, activeMode: sessionMode });
      return reusable.id;
    }

    const pending = pendingBlankConversationByMode.get(sessionMode);
    if (pending) {
      const id = await pending;
      set({ activeId: id, activeMode: sessionMode });
      return id;
    }

    const title = uniqueBlankTitle(get().conversations, sessionMode);
    const createPromise = (async () => {
      let dbSession: { id: string; startedAt: number; summary: string; workspace: string } | null = null;
      try {
        const root = await window.api.workspace.getRoot();
        dbSession = await window.api.sessions.create(title, root, sessionMode);
      } catch {
        // Fallback to local-only ID if DB fails
      }

      const id = dbSession?.id ?? genConvId();
      const createdAt = dbSession?.startedAt ?? Date.now();

      set((s) => ({
        conversations: [
          { id, title, messages: [], createdAt, mode: sessionMode },
          ...s.conversations,
        ],
        activeId: id,
        activeMode: sessionMode,
      }));
      return id;
    })();

    pendingBlankConversationByMode.set(sessionMode, createPromise);
    try {
      return await createPromise;
    } finally {
      pendingBlankConversationByMode.delete(sessionMode);
    }
  },

  forkConversation: async (id) => {
    const source = get().conversations.find((c) => c.id === id);
    const mode = source?.mode || get().activeMode || "chat";
    if (id.startsWith("conv-")) {
      return get().addConversation(mode);
    }
    const forked = await window.api.sessions.fork(id).catch(() => null);
    if (!forked) return null;
    const detail = await window.api.sessions.get(forked.id).catch(() => null);
    if (detail) {
      get().loadSession(detail);
      return detail.id;
    }
    set((s) => ({
      conversations: [{
        id: forked.id,
        title: forked.summary || `${source?.title || "Conversation"} (fork)`,
        messages: [],
        createdAt: forked.startedAt,
        mode: forked.mode || mode,
      }, ...s.conversations],
      activeId: forked.id,
      activeMode: forked.mode || mode,
    }));
    return forked.id;
  },

  loadModeSession: async (mode) => {
    try {
      set({ activeMode: mode });
      const reusable = findReusableBlankConversation(get().conversations, mode);
      if (reusable) {
        set({ activeId: reusable.id });
        return reusable.id;
      }
      const inStore = sortConversations(
        get().conversations.filter((c: Conversation) => (c.mode || "chat") === mode),
      );
      if (inStore.length > 0) {
        set({ activeId: inStore[0].id });
        return inStore[0].id;
      }
      const sessions = await window.api.sessions.list(mode);
      const existing = get().conversations.find((c: Conversation) => (c.mode || "chat") === mode && c.id === get().activeId);
      if (existing) return existing.id;
      if (sessions.length > 0) {
        const last = sessions[0];
        const inStore = get().conversations.find((c: Conversation) => c.id === last.id);
        if (inStore) {
          set({ activeId: last.id });
          return last.id;
        }
        const detail = await window.api.sessions.get(last.id);
        if (detail) {
          const messages = messagesFromTurns(detail);
          const title = titleForSession(detail.summary, messages, "New session");
          if (title !== detail.summary && !detail.id.startsWith("conv-")) {
            window.api.sessions.rename(detail.id, title).catch(() => {});
          }
          set((s) => ({
            conversations: sortConversations([
              {
                id: detail.id,
                title,
                messages,
                createdAt: detail.startedAt,
                mode,
              },
              ...s.conversations,
            ]),
            activeId: detail.id,
          }));
          return detail.id;
        }
      }
      // Auto-create exactly once per mode per app session
      if (!get().conversations.some((c: Conversation) => (c.mode || "chat") === mode)) {
        return await get().addConversation(mode);
      }
      const fallback = sortConversations(get().conversations.filter((c: Conversation) => (c.mode || "chat") === mode))[0];
      if (fallback) {
        set({ activeId: fallback.id });
        return fallback.id;
      }
      return null;
    } catch {}
    return null;
  },

  removeConversation: (id) => {
    set((s) => {
      const filtered = s.conversations.filter((c) => c.id !== id);
      const currentMode = s.conversations.find((c) => c.id === id)?.mode || s.activeMode;
      const nextInMode = filtered.find((c) => (c.mode || "chat") === currentMode);
      return {
        conversations: filtered,
        activeId:
          s.activeId === id
            ? nextInMode
              ? nextInMode.id
              : filtered[0]?.id ?? null
            : s.activeId,
      };
    });
    if (!id.startsWith("conv-")) {
      window.api.sessions.delete(id).catch(() => {});
    }
  },

  updateConversation: async (id, data) => {
    if (data.title && !id.startsWith("conv-")) {
      await window.api.sessions.rename(id, data.title).catch(() => {});
    }
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title: data.title ?? c.title } : c
      ),
    }));
  },

  setActive: (id) => set((s) => ({
    activeId: id,
    activeMode: s.conversations.find((c) => c.id === id)?.mode || s.activeMode,
  })),

  addMessage: (convId, msg, opts) => {
    const id = genMsgId();
    let shouldRename = false;
    let nextTitle = "";
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const hasUserMessage = c.messages.some((m) => m.role === "user" && m.content.trim());
        const title =
          !hasUserMessage && msg.role === "user" && msg.content.trim() && isGenericTitle(c.title)
            ? deriveTopicTitle(msg.content)
            : c.title;
        shouldRename = title !== c.title;
        nextTitle = title;
        return {
          ...c,
          messages: [
            ...c.messages,
            { ...msg, id, timestamp: Date.now() },
          ],
          title,
        };
      }),
    }));
    if ((opts?.persist ?? true) && !convId.startsWith("conv-")) {
      window.api.sessions.addTurn(convId, msg.role, msg.content).catch(() => {});
      if (shouldRename && nextTitle) {
        window.api.sessions.rename(convId, nextTitle).catch(() => {});
      }
    }
    return id;
  },

  appendToLastMessage: (convId, text) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            content: last.content + text,
          };
        }
        return { ...c, messages: msgs };
      }),
    }));
  },

  setStreaming: (convId, msgId, streaming) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === msgId ? { ...m, streaming } : m,
          ),
        };
      }),
    }));
  },

  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
}));

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}
