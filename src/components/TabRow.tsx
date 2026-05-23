import type { LucideIcon } from "lucide-react";
import "./TabRow.css";

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface TabRowProps {
  tabs: Tab[];
  activeId: string | null;
  onChange: (id: string) => void;
  className?: string;
}

export function TabRow({ tabs, activeId, onChange, className = "" }: TabRowProps) {
  return (
    <div className={`tab-row ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const classes = ["tab-row-item", isActive ? "tab-row-active" : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={tab.id}
            className={classes}
            onClick={() => onChange(tab.id)}
            role="tab"
            aria-selected={isActive}
          >
            {tab.icon && (
              <tab.icon size={14} strokeWidth={1.5} className="tab-row-icon" />
            )}
            <span className="tab-row-label">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="tab-row-count">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
