import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Power, PowerOff, RefreshCw, Search, X } from "lucide-react";
import { useSkillsStore } from "../stores/skillsStore";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { StatusDot } from "../components/StatusDot";
import "./SkillsBrowserView.css";

type StatusFilter = "all" | "enabled" | "disabled";

export function SkillsBrowserView() {
  const searchQuery = useSkillsStore((s) => s.searchQuery);
  const setSearch = useSkillsStore((s) => s.setSearch);
  const toggleEnabled = useSkillsStore((s) => s.toggleEnabled);
  const loadSkills = useSkillsStore((s) => s.loadSkills);
  const skills = useSkillsStore((s) => s.skills);
  const loaded = useSkillsStore((s) => s.loaded);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      counts.set(skill.category || "General", (counts.get(skill.category || "General") || 0) + 1);
    }
    return [
      { name: "All", count: skills.length },
      ...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    ];
  }, [skills]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return skills.filter((skill) => {
      if (category !== "All" && (skill.category || "General") !== category) return false;
      if (statusFilter === "enabled" && !skill.enabled) return false;
      if (statusFilter === "disabled" && skill.enabled) return false;
      if (!q) return true;
      return [skill.name, skill.description, skill.category, skill.author, skill.id]
        .some((field) => (field || "").toLowerCase().includes(q));
    });
  }, [skills, category, statusFilter, searchQuery]);

  const selected = skills.find((s) => s.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (selectedId && !filtered.some((skill) => skill.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null);
    }
  }, [filtered, selectedId]);

  const handleToggle = async (id: string) => {
    setBusyId(id);
    await toggleEnabled(id);
    setBusyId(null);
  };

  return (
    <div className="sk-app">
      <div className="chat-header">
        <div className="chat-title">Skills</div>
        <div className="sk-search-wrap">
          <Search size={13} strokeWidth={1.5} />
          <Input
            className="sk-search"
            placeholder="Search name, category, description..."
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sk-status-tabs">
          {(["all", "enabled", "disabled"] as const).map((filter) => (
            <button key={filter} className={`sk-tab ${statusFilter === filter ? "sk-tab-active" : ""}`}
              onClick={() => setStatusFilter(filter)} type="button">
              {filter}
            </button>
          ))}
        </div>
        <button className="sk-refresh" onClick={() => loadSkills()} type="button" title="Reload skills">
          <RefreshCw size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="sk-body">
        <aside className="sk-categories">
          {categories.map((cat) => (
            <button key={cat.name} className={`sk-category ${category === cat.name ? "sk-category-active" : ""}`}
              onClick={() => setCategory(cat.name)} type="button">
              <span>{cat.name}</span>
              <span>{cat.count}</span>
            </button>
          ))}
        </aside>

        <div className="sk-list">
          {!loaded ? (
            <div className="sk-empty">Loading skills...</div>
          ) : filtered.length === 0 ? (
            <div className="sk-empty">No skills match these filters.</div>
          ) : filtered.map((skill) => (
            <button key={skill.id} className={`sk-row ${skill.id === selected?.id ? "sk-row-active" : ""}`}
              onClick={() => setSelectedId(skill.id)} type="button">
              <div className="sk-row-main">
                <span className="sk-row-name">{skill.name}</span>
                <span className="sk-row-desc">{skill.description || skill.id}</span>
              </div>
              <span className="sk-row-category">{skill.category || "General"}</span>
              <span className="sk-row-status">
                <StatusDot variant={skill.enabled ? "online" : "offline"} size={6} />
                {skill.enabled ? "Enabled" : "Disabled"}
              </span>
            </button>
          ))}
        </div>

        <aside className="sk-detail">
          {selected ? (
            <div className="sk-detail-content">
              <div className="sk-detail-top">
                <div>
                  <h3 className="sk-detail-name">{selected.name}</h3>
                  <div className="sk-detail-meta-row">
                    <span>{selected.category || "General"}</span>
                    <span>v{selected.version}</span>
                  </div>
                </div>
                <button className="sk-detail-close" onClick={() => setSelectedId(null)} type="button">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              <p className="sk-detail-desc">{selected.description || "No description available."}</p>
              <div className="sk-detail-kv">
                <span>ID</span><code>{selected.id}</code>
                <span>Author</span><code>{selected.author}</code>
                <span>Status</span><code>{selected.enabled ? "enabled" : "disabled"}</code>
              </div>

              {selected.source && (
                <a href={selected.source} className="sk-detail-link" target="_blank" rel="noopener">
                  <ExternalLink size={12} /> Source
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
                    disabled={busyId === selected.id}
                    onClick={() => handleToggle(selected.id)}
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
            <div className="sk-detail-empty">Select a skill.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
