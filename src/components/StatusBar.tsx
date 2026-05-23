import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { StatusDot } from "./StatusDot";
import "./StatusBar.css";

export function StatusBar() {
  const activeId = useChatStore((s) => s.activeId);
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === activeId));
  const model = useSettingsStore((s) => s.model);
  const providerId = useSettingsStore((s) => s.providerId);

  const turnCount = conv?.messages.length ?? 0;
  const sessionLabel = activeId ? activeId.split("-").slice(1).join("-").slice(0, 20) : "none";

  return (
    <div className="status-bar">
      <div className="sb-group">
        <StatusDot variant="online" size={6} />
        {model || providerId || "shmakk"}
      </div>
      <div className="sb-sep" />
      <div className="sb-group">{turnCount} messages</div>
      <div className="sb-spacer" />
      <div className="sb-group mono">session: {sessionLabel}</div>
    </div>
  );
}
