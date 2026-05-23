import { useState } from "react";
import { Download, Power, PowerOff, X, ExternalLink } from "lucide-react";
import { useSkillsStore } from "../stores/skillsStore";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { StatusDot } from "../components/StatusDot";
import "./SkillsBrowserView.css";

export function SkillsBrowserView() {
  const searchQuery = useSkillsStore((s) => s.searchQuery);
  const setSearch = useSkillsStore((s) => s.setSearch);
  const toggleEnabled = useSkillsStore((s) => s.toggleEnabled);
  const skills = useSkillsStore((s) => s.skills);
  const loaded = useSkillsStore((s) => s.loaded);
  const [filter, setFilter] = useState<"all" | "installed" | "enabled">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = searchQuery.toLowerCase();
  const filtered = skills.filter((sk) => {
    if (filter === "installed" && !sk.installed) return false;
    if (filter === "enabled" && !sk.enabled) return false;
    if (q && !sk.name.toLowerCase().includes(q) && !sk.description.toLowerCase().includes(q) && !sk.category.toLowerCase().includes(q)) return false;
    return true;
  });

  const selected = skills.find((s) => s.id === selectedId);

  return (
    <div className="sk-app">
      <div className="chat-header">
        <div className="chat-title">Skills Browser</div>
        <Input
          className="sk-search"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="sk-filters">
          {(["all", "installed", "enabled"] as const).map((f) => (
            <Chip key={f} active={filter === f} className="sk-filter-chip" onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </div>

      <div className="sk-body">
        <div className="sk-grid">
          {!loaded ? (
            <div className="sk-empty">
              <p className="text-muted">Loading skills...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sk-empty">
              <p className="text-muted">No skills found.</p>
            </div>
          ) : (
            filtered.map((skill) => (
            <div
              key={skill.id}
              className={`sk-card ${skill.id === selectedId ? "sk-card-selected" : ""}`}
              onClick={() => setSelectedId(skill.id)}
            >
              <div className="sk-card-header">
                <span className="sk-card-name">{skill.name}</span>
                <span className="sk-card-version mono">{skill.version}</span>
              </div>
              <p className="sk-card-desc">{skill.description}</p>
              <div className="sk-card-meta">
                <Chip>{skill.category}</Chip>
                <span className="sk-card-author mono">{skill.author}</span>
                <div className="sk-card-status">
                  <StatusDot variant={skill.enabled ? "online" : "offline"} size={6} />
                  <span>{skill.enabled ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>
          )))}
        </div>

        {/* Detail panel */}
        <div className="sk-detail">
          {selected ? (
            <div className="sk-detail-content">
              <div className="sk-detail-top">
                <div>
                  <h3 className="sk-detail-name">{selected.name}</h3>
                  <div className="sk-detail-meta-row">
                    <span className="sk-detail-version mono">v{selected.version}</span>
                    <Chip>{selected.category}</Chip>
                    <span className="sk-detail-author mono">{selected.author}</span>
                  </div>
                </div>
                <button
                  className="sk-detail-close"
                  onClick={() => setSelectedId(null)}
                  type="button"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              <p className="sk-detail-desc">{selected.description}</p>

              {selected.source && (
                <a href={selected.source} className="sk-detail-link" target="_blank" rel="noopener">
                  <ExternalLink size={11} /> Source
                </a>
              )}

              <div className="sk-detail-actions">
                {!selected.installed ? (
                  <Button variant="primary" size="sm">
                    <Download size={12} /> Install
                  </Button>
                ) : (
                  <Button
                    variant={selected.enabled ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => toggleEnabled(selected.id)}
                  >
                    {selected.enabled ? (
                      <><PowerOff size={12} /> Disable</>
                    ) : (
                      <><Power size={12} /> Enable</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="sk-detail-empty">
              <p className="text-muted">Select a skill to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
