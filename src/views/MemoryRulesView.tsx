import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { SegmentedControl } from "../components/SegmentedControl";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import type { Segment } from "../components/SegmentedControl";
import "./MemoryRulesView.css";

interface Entry {
  id: string;
  type: "memory" | "rule";
  label: string;
  content: string;
  category?: string;
}

const SEGMENTS: Segment[] = [
  { value: "memory", label: "Memory" },
  { value: "rules", label: "Rules" },
];

const CATEGORIES = ["project", "tools", "conventions", "security", "general"];

function parseRulesToEntries(raw: string): Entry[] {
  // Split the rules file into sections by top-level headings
  const sections = raw.split(/(?=^#{1,2}\s)/m);
  const entries: Entry[] = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const heading = lines[0].replace(/^#{1,2}\s+/, "").trim();
    const body = lines.slice(1).join("\n").trim();
    if (!heading) continue;
    entries.push({
      id: `rule-${entries.length}`,
      type: "rule",
      label: heading,
      content: body || heading,
      category: guessCategory(heading + " " + body),
    });
  }
  return entries;
}

function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("security") || lower.includes("port") || lower.includes("secret")) return "security";
  if (lower.includes("code") || lower.includes("style") || lower.includes("format")) return "conventions";
  if (lower.includes("tool") || lower.includes("shell") || lower.includes("fish") || lower.includes("bash")) return "tools";
  if (lower.includes("project") || lower.includes("workspace") || lower.includes("repo")) return "project";
  return "general";
}

export function MemoryRulesView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [segment, setSegment] = useState("rules");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    window.api.rules.get().then((raw) => {
      if (raw) {
        setEntries(parseRulesToEntries(raw));
      }
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, []);

  const active = entries.find((e) => e.id === activeId);

  const memories = entries.filter((e) => e.type === "memory");
  const rules = entries.filter((e) => e.type === "rule");
  let visibleEntries = segment === "memory" ? memories : rules;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    visibleEntries = visibleEntries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q),
    );
  }

  if (categoryFilter) {
    visibleEntries = visibleEntries.filter((e) => e.category === categoryFilter);
  }

  const handleSelect = (entry: Entry) => {
    setActiveId(entry.id);
    setEditContent(entry.content);
  };

  const handleSave = async () => {
    if (!active) return;
    // Update local state
    const updated = entries.map((e) =>
      e.id === active.id ? { ...e, content: editContent } : e,
    );
    setEntries(updated);

    // Save all rules back to the rules file
    const allRules = updated.filter((e) => e.type === "rule");
    const raw = allRules.map((r) => `## ${r.label}\n\n${r.content}`).join("\n\n");
    try {
      await window.api.rules.set(raw);
    } catch (err) {
      console.error("Failed to save rules:", err);
    }
  };

  return (
    <div className="mr-app">
      <div className="chat-header">
        <div className="chat-title">Memory &amp; Rules</div>
        <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />
      </div>

      <div className="mr-body">
        <div className="mr-list">
          <div className="mr-search-wrap">
            <Search size={12} strokeWidth={1.5} className="mr-search-icon" />
            <input
              className="mr-search"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="mr-categories">
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              >
                {cat}
              </Chip>
            ))}
          </div>

          <div className="mr-list-section">
            {segment === "memory" ? "Memories" : "Rules"}
            <Badge variant="neutral">{visibleEntries.length}</Badge>
          </div>

          {!loaded ? (
            <div className="mr-list-empty">
              <p className="text-muted">Loading...</p>
            </div>
          ) : (
            <>
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`mr-item ${entry.id === activeId ? "mr-item-active" : ""}`}
                  onClick={() => handleSelect(entry)}
                >
                  <span className="mr-item-label">{entry.label}</span>
                  {entry.category && (
                    <span className="mr-item-cat mono">{entry.category}</span>
                  )}
                </div>
              ))}
              {visibleEntries.length === 0 && (
                <div className="mr-list-empty">
                  <p className="text-muted">No entries found.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mr-editor">
          {active ? (
            <>
              <div className="mr-editor-header">
                <div className="mr-editor-meta">
                  <span className="mr-editor-type mono">
                    {active.type === "rule" ? "Rule" : "Memory"}
                  </span>
                  {active.category && (
                    <Chip>{active.category}</Chip>
                  )}
                </div>
                <span className="mr-editor-label">{active.label}</span>
              </div>
              <textarea
                className="mr-editor-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
              <div className="mr-editor-actions">
                <Button variant="ghost" size="sm">Export</Button>
                <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
              </div>
            </>
          ) : (
            <div className="mr-editor-empty">
              <p className="text-muted">Select a memory or rule to edit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
