import { useState } from "react";
import { ChevronRight } from "lucide-react";
import "./ThinkingPanel.css";

interface ThinkingPanelProps {
  children: string;
  defaultOpen?: boolean;
}

export function ThinkingPanel({ children, defaultOpen = false }: ThinkingPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`thinking-panel${open ? " thinking-open" : ""}`}>
      <button
        className="thinking-toggle"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <ChevronRight size={12} strokeWidth={2} className="thinking-chev" />
        <span>Thinking...</span>
      </button>
      {open && (
        <div className="thinking-body">
          {children}
        </div>
      )}
    </div>
  );
}
