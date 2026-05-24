import { useChatStore } from "../stores/chatStore";
import "./StatusBar.css";

export function StatusBar() {
  const activeId = useChatStore((s) => s.activeId);
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === activeId));

  const turnCount = conv?.messages.length ?? 0;

  return (
    <div className="status-bar">
      <div className="sb-group">{turnCount} messages</div>
      <div className="sb-spacer" />
    </div>
  );
}
