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
}

interface ChatStore {
  conversations: Conversation[];
  activeId: string | null;
  loaded: boolean;
  streamingMessageId: string | null;
  loadSessions: () => Promise<void>;
  loadSession: (detail: import("../types/api").SessionDetail) => void;
  addConversation: () => Promise<string>;
  removeConversation: (id: string) => void;
  setActive: (id: string) => void;
  addMessage: (convId: string, msg: Omit<Message, "id" | "timestamp">) => string;
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

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeId: null,
  loaded: false,
  streamingMessageId: null,

  loadSessions: async () => {
    try {
      const sessions = await window.api.sessions.list("chat");

      if (sessions.length === 0) {
        const id = genConvId();
        set({
          conversations: [
            {
              id,
              title: "New conversation",
              messages: [],
              createdAt: Date.now(),
            },
          ],
          activeId: id,
          loaded: true,
        });
        return;
      }

      const conversations: Conversation[] = [];
      for (const sess of sessions.slice(0, 20)) {
        const detail = await window.api.sessions.get(sess.id);
        if (!detail) continue;

        const messages: Message[] = detail.turns.map((t, i) => ({
          id: `msg-${sess.id}-${i}`,
          role: mapRole(t.role),
          content: t.content,
          timestamp: t.ts,
        }));

        conversations.push({
          id: sess.id,
          title: sess.summary || `Session ${sess.id.slice(0, 12)}`,
          messages,
          createdAt: sess.startedAt,
        });
      }

      set({
        conversations,
        activeId: conversations.length > 0 ? conversations[0].id : null,
        loaded: true,
      });
    } catch (err) {
      console.error("Failed to load sessions:", err);
      const id = genConvId();
      set({
        conversations: [
          {
            id,
            title: "New conversation",
            messages: [],
            createdAt: Date.now(),
          },
        ],
        activeId: id,
        loaded: true,
      });
    }
  },

  loadSession: (detail) => {
    const messages: Message[] = detail.turns.map((t, i) => ({
      id: `msg-${detail.id}-${i}`,
      role: mapRole(t.role),
      content: t.content,
      timestamp: t.ts,
    }));

    set((s) => {
      if (s.conversations.some((c) => c.id === detail.id)) {
        return { activeId: detail.id };
      }
      return {
        conversations: [
          ...s.conversations,
          {
            id: detail.id,
            title: detail.summary || `Session ${detail.id.slice(0, 12)}`,
            messages,
            createdAt: detail.startedAt,
          },
        ],
        activeId: detail.id,
      };
    });
  },

  addConversation: async () => {
    let dbSession: { id: string; startedAt: number; summary: string; workspace: string } | null = null;
    try {
      dbSession = await window.api.sessions.create("New conversation", "", "chat");
    } catch {
      // Fallback to local-only ID if DB fails
    }

    const id = dbSession?.id ?? genConvId();
    const createdAt = dbSession?.startedAt ?? Date.now();

    set((s) => ({
      conversations: [
        ...s.conversations,
        { id, title: "New conversation", messages: [], createdAt },
      ],
      activeId: id,
    }));
    return id;
  },

  removeConversation: (id) => {
    set((s) => {
      const filtered = s.conversations.filter((c) => c.id !== id);
      return {
        conversations: filtered,
        activeId:
          s.activeId === id
            ? filtered.length > 0
              ? filtered[0].id
              : null
            : s.activeId,
      };
    });
    if (!id.startsWith("conv-")) {
      window.api.sessions.delete(id).catch(() => {});
    }
  },

  setActive: (id) => set({ activeId: id }),

  addMessage: (convId, msg) => {
    const id = genMsgId();
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { ...msg, id, timestamp: Date.now() },
              ],
              title:
                c.messages.length === 0 && msg.role === "user"
                  ? msg.content.slice(0, 60)
                  : c.title,
            }
          : c,
      ),
    }));
    if (!convId.startsWith("conv-")) {
      window.api.sessions.addTurn(convId, msg.role, msg.content).catch(() => {});
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
