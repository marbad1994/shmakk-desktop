import type { Message } from "../stores/chatStore";
import type { ToolCall } from "../components/ToolCard";

export interface LlmConfig {
  providerId: string;
  model: string;
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolConfirm: (tool: ToolCall) => Promise<boolean>;
  onDone: (finalContent: string) => void;
  onError: (error: string) => void;
}

/**
 * Send a message to the AI via the Electron main process with streaming.
 * Tokens arrive via the onToken callback. Tool confirmations arrive via
 * onToolConfirm, which must return a promise that resolves with the user's
 * approval decision.
 */
export async function sendMessageStreaming(
  config: LlmConfig,
  history: Pick<Message, "role" | "content">[],
  userMessage: string,
  callbacks: StreamCallbacks,
  sessionId?: string,
): Promise<void> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let fullContent = "";
  const unsubToken = window.api.chat.onToken((text) => {
    fullContent += text;
    callbacks.onToken(text);
  });

  const unsubToolConfirm = window.api.chat.onToolConfirm(async (payload) => {
    const approved = await callbacks.onToolConfirm({
      id: payload.tool.id,
      tool: payload.tool.name,
      summary: payload.tool.description || payload.tool.name,
      safety: (payload.tool.safety as ToolCall["safety"]) || "safe",
      params: { args: payload.tool.args },
    });
    window.api.chat.respondToolConfirm(payload.tool.id, approved);
  });

  const unsubToolAuto = window.api.chat.onToolAutoApproved((payload) => {
    callbacks.onToken(`\n[auto-approved: ${payload.tool.name}]\n`);
  });

  try {
    const result = await window.api.chat.send(
      config.providerId,
      config.model,
      messages,
      sessionId,
    );

    if (result.error) {
      callbacks.onError(result.error);
      return;
    }

    if (!fullContent) {
      const content = result.reply || result.content || "";
      if (content) {
        callbacks.onToken(content);
      }
    }

    callbacks.onDone(fullContent || result.reply || result.content || "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    callbacks.onError(msg);
  } finally {
    unsubToken();
    unsubToolConfirm();
    unsubToolAuto();
  }
}

export async function sendMessage(
  config: LlmConfig,
  history: Pick<Message, "role" | "content">[],
  userMessage: string,
  sessionId?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let content = "";
    sendMessageStreaming(config, history, userMessage, {
      onToken: (text) => { content += text; },
      onToolConfirm: async () => false,
      onDone: () => resolve(content),
      onError: (err) => reject(new Error(err)),
    }, sessionId);
  });
}
