import { useState, useEffect } from "react";
import { Clock, ExternalLink, Trash2, ChevronRight, Calendar } from "lucide-react";
import { SearchInput } from "../components/SearchInput";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { useChatStore } from "../stores/chatStore";
import type { SessionSummary } from "../types/api";
import "./SessionSearchView.css";

// Group by date
function groupByDate(items: SessionSummary[]): [string, SessionSummary[]][] {
  const map = new Map<string, SessionSummary[]>();
  for (const item of items) {
    const date = new Date(item.startedAt).toISOString().slice(0, 10);
    const existing = map.get(date) ?? [];
    existing.push(item);
    map.set(date, existing);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function SessionSearchView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "week" | "month">("all");

  useEffect(() => {
    window.api.sessions.list().then((list) => {
      setSessions(list);
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, []);

  const handleOpen = async () => {
    if (!selectedId) return;
    const detail = await window.api.sessions.get(selectedId);
    if (!detail) return;

    const { loadSession } = useChatStore.getState();
    loadSession(detail);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await window.api.sessions.delete(selectedId);
    setSessions((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  let filtered = query
    ? sessions.filter(
        (s) =>
          (s.summary || "").toLowerCase().includes(query.toLowerCase()) ||
          s.id.toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  if (dateFilter === "week") {
    filtered = filtered.filter((s) => s.startedAt >= weekAgo);
  } else if (dateFilter === "month") {
    filtered = filtered.filter((s) => s.startedAt >= monthAgo);
  }

  const grouped = groupByDate(filtered);
  const selected = sessions.find((s) => s.id === selectedId);

  return (
    <div className="ss-app">
      <div className="chat-header">
        <div className="chat-title">Sessions</div>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search sessions..."
          className="ss-search"
        />
        <div className="ss-date-filters">
          {(["all", "week", "month"] as const).map((d) => (
            <button
              key={d}
              className={`ss-date-filter ${dateFilter === d ? "ss-date-filter-active" : ""}`}
              onClick={() => setDateFilter(d)}
              type="button"
            >
              {d === "all" ? "All time" : d === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-body">
        <div className="ss-list">
          {!loaded ? (
            <div className="ss-empty">
              <p className="text-muted">Loading sessions...</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="ss-empty">
              <p className="text-muted">No sessions found.</p>
            </div>
          ) : (
            grouped.map(([date, items]) => (
              <div key={date} className="ss-group">
                <div className="ss-group-header">
                  <Calendar size={12} strokeWidth={1.5} />
                  <span className="ss-group-date">{date}</span>
                  <Badge variant="neutral">{items.length}</Badge>
                </div>
                {items.map((session) => (
                  <div
                    key={session.id}
                    className={`ss-item ${session.id === selectedId ? "ss-item-active" : ""}`}
                    onClick={() => setSelectedId(session.id)}
                  >
                    <div className="ss-item-icon">
                      <Clock size={16} strokeWidth={1.5} />
                    </div>
                    <div className="ss-item-main">
                      <span className="ss-item-name">
                        {session.summary || `Session ${session.id.slice(0, 12)}`}
                      </span>
                      <span className="ss-item-id mono">{session.id}</span>
                    </div>
                    <div className="ss-item-meta">
                      <Badge variant="neutral">{session.turnCount} turns</Badge>
                      <ChevronRight size={12} className="text-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Session detail panel */}
        <div className="ss-detail">
          {selected ? (
            <div className="ss-detail-content">
              <div className="ss-detail-header">
                <div>
                  <h3 className="ss-detail-name">
                    {selected.summary || `Session ${selected.id.slice(0, 12)}`}
                  </h3>
                  <span className="ss-detail-id mono">{selected.id}</span>
                </div>
                <div className="ss-detail-actions">
                  <Button variant="ghost" size="sm" onClick={handleOpen}>
                    <ExternalLink size={12} /> Open
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDelete}>
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              </div>

              <div className="ss-detail-stats">
                <div className="ss-detail-stat">
                  <span className="ss-stat-val">{selected.turnCount}</span>
                  <span className="ss-stat-label">Turns</span>
                </div>
                <div className="ss-detail-stat">
                  <span className="ss-stat-val">
                    {new Date(selected.startedAt).toLocaleDateString()}
                  </span>
                  <span className="ss-stat-label">Date</span>
                </div>
                {selected.workspace && (
                  <div className="ss-detail-stat">
                    <span className="ss-stat-val mono" style={{ fontSize: "11px" }}>
                      {selected.workspace}
                    </span>
                    <span className="ss-stat-label">Workspace</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="ss-detail-empty">
              <p className="text-muted">Select a session to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
