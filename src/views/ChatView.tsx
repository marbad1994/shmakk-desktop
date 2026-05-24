import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  Copy,
  RefreshCw,
  Download,
  Square,
  PenSquare,
} from "lucide-react";
import { ThinkingPanel } from "../components/ThinkingPanel";
import { ToolCard } from "../components/ToolCard";
import type { ToolCall } from "../components/ToolCard";
import { CodeBlock } from "../components/CodeBlock";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Composer } from "../components/Composer";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useVoiceStore } from "../stores/voiceStore";
import { sendMessageStreaming } from "../services/ai";
import "./ChatView.css";

/* ─── Pending tool confirmation ─────────────────── */

interface PendingTool {
  toolCall: ToolCall;
  resolve: (approved: boolean) => void;
}

let pendingToolGlobal: PendingTool | null = null;
let onPendingToolChange: (() => void) | null = null;

function setPendingTool(pt: PendingTool | null) {
  pendingToolGlobal = pt;
  onPendingToolChange?.();
}

function usePendingTool() {
  const [, setTick] = useState(0);
  useEffect(() => {
    onPendingToolChange = () => setTick((n) => n + 1);
    return () => {
      onPendingToolChange = null;
    };
  }, []);
  return {
    pending: pendingToolGlobal,
    clear: () => setPendingTool(null),
  };
}

/* ─── Component ──────────────────────────────────── */

export function ChatView() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const loaded = useChatStore((s) => s.loaded);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const addConversation = useChatStore((s) => s.addConversation);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const setActive = useChatStore((s) => s.setActive);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);

  const providerId = useSettingsStore((s) => s.providerId);
  const model = useSettingsStore((s) => s.model);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [stsActive, setStsActive] = useState(false);
  const [stsState, setStsState] = useState<"listening" | "thinking" | "speaking" | "off">("off");

  // Command palette
  const [allCommands, setAllCommands] = useState<Array<{ name: string; plugin: string; description: string }>>([]);
  const [cmdPaletteIdx, setCmdPaletteIdx] = useState(0);

  const messagesEnd = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { pending, clear: clearPending } = usePendingTool();

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Clear editing state on conversation switch
  useEffect(() => {
    setEditingMessageId(null);
  }, [activeId]);

  // Auto-scroll to bottom (sticky: only if near bottom)
  useEffect(() => {
    if (!userScrolledUp) {
      messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeConv?.messages, userScrolledUp]);

  /* ── Scroll handler ────────────────────────────── */

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist < 100;
    setUserScrolledUp(!nearBottom);
    setShowScrollBtn(!nearBottom);
  }, []);

  const scrollToBottom = () => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
    setShowScrollBtn(false);
  };

  /* ── Tool confirmation handler ─────────────────── */

  const createToolConfirmHandler = useCallback(
    () =>
      async (tool: ToolCall): Promise<boolean> => {
        return new Promise((resolve) => {
          setPendingTool({ toolCall: tool, resolve });
        });
      },
    [],
  );

  /* ── Send ──────────────────────────────────────── */

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    let convId = activeId;
    if (!convId) {
      convId = await addConversation();
      setActive(convId);
    }

    // If editing, rewind the conversation before the edited message
    if (editingMessageId && convId) {
      const conv = useChatStore.getState().conversations.find(
        (c) => c.id === convId,
      );
      if (conv) {
        const msgIdx = conv.messages.findIndex(
          (m) => m.id === editingMessageId,
        );
        if (msgIdx >= 0) {
          useChatStore.setState((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === convId ? { ...c, messages: c.messages.slice(0, msgIdx) } : c,
            ),
          }));
        }
      }
      setEditingMessageId(null);
    }

    setInput("");
    addMessage(convId, { role: "user", content: text });
    setSending(true);

    const assistantMsgId = addMessage(convId, {
      role: "assistant",
      content: "",
      streaming: true,
    }, { persist: false });
    setStreamingMessageId(assistantMsgId);

    try {
      const active = useChatStore.getState().conversations.find(
        (c) => c.id === convId,
      );
      const history =
        active?.messages.filter((m) => m.id !== assistantMsgId) ?? [];

      await sendMessageStreaming(
        { providerId, model },
        history.map((m) => ({ role: m.role, content: m.content })),
        text,
        {
          onToken: (token) => {
            appendToLastMessage(convId, token);
          },
          onToolConfirm: createToolConfirmHandler(),
          onDone: () => finishSend(convId, assistantMsgId),
          onError: (errMsg) => {
            setStreaming(convId, assistantMsgId, false);
            setStreamingMessageId(null);
            setSending(false);
            if (errMsg !== "cancelled") {
              appendToLastMessage(convId, `Error: ${errMsg}`);
            }
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreaming(convId, assistantMsgId, false);
      setStreamingMessageId(null);
      setSending(false);
      if (msg !== "cancelled") {
        appendToLastMessage(convId, `Error: ${msg}`);
      }
    }
  };

  const finishSend = (convId: string, msgId: string) => {
    setStreaming(convId, msgId, false);
    setStreamingMessageId(null);
    setSending(false);
    const conv = useChatStore.getState().conversations.find(
      (c) => c.id === convId,
    );
    const lastMsg = conv?.messages[conv.messages.length - 1];
    if (lastMsg && convId && !convId.startsWith("conv-")) {
      window.api.sessions
        .addTurn(convId, "assistant", lastMsg.content)
        .catch(() => {});
    }
  };

  /* ── Retry ─────────────────────────────────────── */

  const handleRetryMessage = async () => {
    const msgs = activeConv?.messages ?? [];
    const lastUserIdx = [...msgs]
      .reverse()
      .findIndex((m) => m.role === "user");
    if (lastUserIdx < 0 || !activeId || sending) return;

    const userMsg = msgs[msgs.length - 1 - lastUserIdx];
    setSending(true);

    const assistantMsgId = addMessage(activeId, {
      role: "assistant",
      content: "",
      streaming: true,
    }, { persist: false });

    try {
      const history = msgs.slice(0, msgs.length - 1 - lastUserIdx);
      await sendMessageStreaming(
        { providerId, model },
        history.map((m) => ({ role: m.role, content: m.content })),
        userMsg.content,
        {
          onToken: (token) => {
            appendToLastMessage(activeId, token);
          },
          onToolConfirm: createToolConfirmHandler(),
          onDone: () => finishSend(activeId, assistantMsgId),
          onError: (errMsg) => {
            setStreaming(activeId, assistantMsgId, false);
            setSending(false);
            if (errMsg !== "cancelled") {
              appendToLastMessage(activeId, `Error: ${errMsg}`);
            }
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreaming(activeId, assistantMsgId, false);
      setSending(false);
      if (msg !== "cancelled") {
        appendToLastMessage(activeId, `Error: ${msg}`);
      }
    }
  };

  /* ── Stop generation ───────────────────────────── */

  const handleStop = () => {
    window.api.chat.cancel();
    if (streamingMessageId && activeId) {
      setStreaming(activeId, streamingMessageId, false);
      setStreamingMessageId(null);
    }
    setSending(false);
    clearPending();
  };

  /* ── Keyboard ──────────────────────────────────── */

  const selectCommand = (cmd: typeof allCommands[number]) => {
    setInput(`/${cmd.name} `);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Command palette navigation
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
        setInput("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Copy ──────────────────────────────────────── */

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  /* ── Edit message ──────────────────────────────── */

  const handleEditMessage = (msg: { id: string; content: string }) => {
    setEditingMessageId(msg.id);
    setInput(msg.content);
    inputRef.current?.focus();
  };

  /* ── Export ────────────────────────────────────── */

  const handleExport = () => {
    if (!activeConv) return;
    const md = activeConv.messages
      .map((m) => {
        const role = m.role === "user" ? "## You" : "## shmakk";
        return `${role}\n\n${m.content}\n`;
      })
      .join("---\n\n");
    const header = `# ${activeConv.title}\n\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n`;
    const blob = new Blob([header + md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConv.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Attachment paste handler ──────────────────── */

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fileItems = Array.from(items).filter((i) => i.kind === "file");
    if (fileItems.length === 0) return;
    // File paste handling: read images as data URLs inline
    for (const item of fileItems) {
      const file = item.getAsFile();
      if (!file) continue;
    }
  };

  /* ── STS event listeners ─────────────────────────── */

  useEffect(() => {
    const unsubState = window.api.voice.onSTSState((data) => {
      setStsState(data.state);
      if (data.state === "off") setStsActive(false);
    });
    const unsubTrans = window.api.voice.onSTSTranscription((data) => {
      // Auto-send transcribed text as a user message
      const text = data.text.trim();
      if (!text) return;
      // Find or create conversation
      let convId = useChatStore.getState().activeId;
      if (!convId) {
        addConversation().then((id) => {
          useChatStore.getState().setActive(id);
          autoSendSts(id, text);
        });
      } else {
        autoSendSts(convId, text);
      }
    });
    return () => {
      unsubState();
      unsubTrans();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoSendSts = async (convId: string, text: string) => {
    addMessage(convId, { role: "user", content: text });
    setSending(true);

    const assistantMsgId = addMessage(convId, {
      role: "assistant",
      content: "",
      streaming: true,
    }, { persist: false });
    setStreamingMessageId(assistantMsgId);

    try {
      const active = useChatStore.getState().conversations.find(
        (c) => c.id === convId,
      );
      const history =
        active?.messages.filter((m) => m.id !== assistantMsgId) ?? [];

      await sendMessageStreaming(
        { providerId, model },
        history.map((m) => ({ role: m.role, content: m.content })),
        text,
        {
          onToken: (token) => {
            appendToLastMessage(convId, token);
          },
          onToolConfirm: createToolConfirmHandler(),
          onDone: () => finishSend(convId, assistantMsgId),
          onError: (errMsg) => {
            setStreaming(convId, assistantMsgId, false);
            setStreamingMessageId(null);
            setSending(false);
            if (errMsg !== "cancelled") {
              appendToLastMessage(convId, `Error: ${errMsg}`);
            }
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreaming(convId, assistantMsgId, false);
      setStreamingMessageId(null);
      setSending(false);
      if (msg !== "cancelled") {
        appendToLastMessage(convId, `Error: ${msg}`);
      }
    }
  };

  const handleToggleSTS = async () => {
    if (stsActive) {
      window.api.voice.stopSTS();
      setStsActive(false);
      setStsState("off");
      return;
    }
    if (!voiceChecked) await checkVoiceAvailability();
    const result = await window.api.voice.startSTS();
    if (result.ok) {
      setStsActive(true);
      setStsState("listening");
    }
  };

  /* ── Keyboard shortcuts ──────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;

      // Escape: cancel streaming or dismiss tool confirm
      if (e.key === "Escape") {
        if (streamingMessageId) handleStop();
        if (pendingToolGlobal) {
          pendingToolGlobal.resolve(false);
          setPendingTool(null);
        }
        return;
      }

      if (mod && e.key.toLowerCase() === "n" && !inInput) {
        e.preventDefault();
        addConversation().then((id) => setActive(id));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streamingMessageId, addConversation, setActive]);

  /* ── Load commands for / palette ─────────────────── */

  useEffect(() => {
    window.api.commands.list().then((r) => setAllCommands(r.commands)).catch(() => {});
  }, []);

  // Detect / prefix in input
  const slashMatch = input.match(/^\/(\S*)$/);
  const showCmdPalette = !!slashMatch;
  const cmdFilter = slashMatch ? slashMatch[1].toLowerCase() : "";
  const filteredCommands = showCmdPalette
    ? allCommands.filter((c) => c.name.toLowerCase().includes(cmdFilter)).slice(0, 8)
    : [];
  useEffect(() => { setCmdPaletteIdx(0); }, [cmdFilter]);

  /* ── Voice availability check ──────────────────── */

  const voiceChecked = useVoiceStore((s) => s.checked);
  const checkVoiceAvailability = useVoiceStore((s) => s.checkAvailability);
  useEffect(() => {
    if (!voiceChecked) checkVoiceAvailability();
  }, [voiceChecked, checkVoiceAvailability]);

  /* ── Auto-resize textarea ──────────────────────── */

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  /* ── Composer button ───────────────────────────── */

  const renderSendButton = () => {
    if (sending && streamingMessageId) {
      return (
        <button
          className="stop-btn"
          onClick={handleStop}
          type="button"
          title="Stop generation"
        >
          <Square size={14} strokeWidth={2} fill="currentColor" />
          Stop
        </button>
      );
    }
    return (
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={!input.trim() || sending}
        type="button"
      >
        <ArrowUp size={16} strokeWidth={2} />
      </button>
    );
  };

  /* ── Empty state ───────────────────────────────── */

  if (!activeConv) {
    return (
      <div className="chat-window">
        <div className="chat-main">
          <div className="chat-empty-state">
            <div className="chat-empty-glyph">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2>Start a session</h2>
            <p>
              Ask shmakk to build something, fix a bug, or explain code in this
              workspace. Capital letters bypass the autocorrect.
            </p>
            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              placeholder="Describe what you want to build or fix..."
              disabled={sending}
              generating={!!(sending && streamingMessageId)}
              onStop={handleStop}
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
          </div>
        </div>
      </div>
    );
  }

  /* ── Normal view ───────────────────────────────── */

  const lastUserMsg = [...activeConv.messages]
    .reverse()
    .find((m) => m.role === "user");

  return (
    <div className="chat-window">
      <div className="chat-main">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-title">{activeConv.title}</div>
          <button
            className="chat-header-btn"
            title="Retry last"
            onClick={handleRetryMessage}
            disabled={sending}
          >
            <RefreshCw size={14} strokeWidth={1.5} />
          </button>
          <button
            className="chat-header-btn"
            title="Export"
            onClick={handleExport}
            disabled={activeConv.messages.length === 0}
          >
            <Download size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Messages */}
        <div
          className="chat-messages"
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
        >
          {activeConv.messages.length === 0 && !loaded ? (
            <div className="chat-placeholder">
              <p className="text-muted">Loading session...</p>
            </div>
          ) : (
            <>
              {activeConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`msg ${msg.role === "user" ? "msg-user" : "msg-assistant"}`}
                >
                  {msg.role === "user" ? (
                    <div className="msg-user-wrap">
                      <div className="msg-user-bubble">{msg.content}</div>
                      {!msg.streaming &&
                        msg.id === lastUserMsg?.id &&
                        !sending && (
                          <button
                            className="msg-edit-btn"
                            onClick={() => handleEditMessage(msg)}
                            title="Edit message"
                          >
                            <PenSquare size={12} strokeWidth={1.5} />
                          </button>
                        )}
                    </div>
                  ) : (
                    <>
                      <div className="msg-avatar">S</div>
                      <div className="msg-content">
                        <span className="msg-role-tag mono">shmakk</span>

                        {msg.thinking && (
                          <ThinkingPanel>{msg.thinking}</ThinkingPanel>
                        )}

                        {msg.content && (
                          <MarkdownRenderer
                            content={msg.content}
                            className="msg-text"
                          />
                        )}

                        {msg.streaming && <span className="msg-cursor" />}

                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="msg-tools">
                            {msg.toolCalls.map((tc: ToolCall) => (
                              <ToolCard
                                key={tc.id}
                                toolCall={tc}
                                onAllow={() => {}}
                                onDeny={() => {}}
                              />
                            ))}
                          </div>
                        )}

                        {msg.codeBlocks && msg.codeBlocks.length > 0 && (
                          <div className="msg-code-blocks">
                            {msg.codeBlocks.map((cb, i) => (
                              <CodeBlock
                                key={i}
                                code={cb.code}
                                language={cb.language}
                                filename={cb.filename}
                              />
                            ))}
                          </div>
                        )}

                        {/* Message actions (hover reveal) */}
                        {!msg.streaming && msg.content && (
                          <div className="msg-actions">
                            <button
                              className="msg-action"
                              onClick={() => handleCopyMessage(msg.content)}
                            >
                              <Copy size={12} strokeWidth={1.5} />
                              Copy
                            </button>
                            <button
                              className="msg-action"
                              onClick={handleRetryMessage}
                              disabled={sending}
                            >
                              <RefreshCw size={12} strokeWidth={1.5} />
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
              <div ref={messagesEnd} />
            </>
          )}
        </div>

        {/* Pending tool confirmation */}
        {pending && (
          <div className="msg-tools-pending">
            <ToolCard
              toolCall={pending.toolCall}
              onAllow={() => {
                pending.resolve(true);
                setPendingTool(null);
              }}
              onDeny={() => {
                pending.resolve(false);
                setPendingTool(null);
              }}
            />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            className="scroll-bottom-btn"
            onClick={scrollToBottom}
            type="button"
          >
            <ArrowUp
              size={14}
              strokeWidth={2}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
        )}

        {/* Composer */}
        <Composer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          placeholder={editingMessageId ? "Edit your message..." : "Reply to shmakk..."}
          disabled={sending}
          generating={!!(sending && streamingMessageId)}
          onStop={handleStop}
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
      </div>
    </div>
  );
}
