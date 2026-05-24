import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FolderKanban, Link, MessageSquare, Plus, Trash2, Unlink } from "lucide-react";
import { Button } from "../components/Button";
import { useChatStore } from "../stores/chatStore";
import "./ProjectsView.css";

interface Project {
  id: string;
  name: string;
  description: string;
  rules: string;
  settings: ProjectSettings;
  createdAt: number;
}

interface ProjectSettings {
  shareMemory?: boolean;
  shareKnowledge?: boolean;
  shareArtifacts?: boolean;
}

interface ProjSession {
  id: string;
  summary: string;
  mode: string;
  turnCount: number;
  startedAt: number;
}

function normalizeTs(ts: number): number {
  return ts < 10_000_000_000 ? ts * 1000 : ts;
}

function modePath(mode?: string): string {
  return `/${["chat", "cowork", "design", "code"].includes(mode || "") ? mode : "chat"}`;
}

function notifyProjectsChanged() {
  window.dispatchEvent(new Event("shmakk:projects-changed"));
}

export function ProjectsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadSession = useChatStore((s) => s.loadSession);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ProjSession[]>([]);
  const [allSessions, setAllSessions] = useState<ProjSession[]>([]);
  const [newName, setNewName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftRules, setDraftRules] = useState("");
  const [showAddSessions, setShowAddSessions] = useState(false);

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const selectedSettings: ProjectSettings = {
    shareMemory: false,
    shareKnowledge: false,
    shareArtifacts: true,
    ...(selected?.settings || {}),
  };
  const linkableSessions = useMemo(
    () => allSessions.filter((s) => !sessions.some((linked) => linked.id === s.id)).slice(0, 40),
    [allSessions, sessions],
  );

  const loadProjects = async (preferredId?: string) => {
    try {
      const rows = await window.api.projects.list();
      setProjects(rows);
      const requestedId = searchParams.get("project");
      const nextId = preferredId || requestedId || selectedId || rows[0]?.id || null;
      setSelectedId(nextId && rows.some((p) => p.id === nextId) ? nextId : rows[0]?.id || null);
    } catch {
      setProjects([]);
      setSelectedId(null);
    }
  };

  const loadProjectSessions = async (projectId: string) => {
    try {
      const linked = await window.api.projects.getSessions(projectId);
      const raw = await window.api.sessions.list();
      setSessions(linked.map((s) => ({ ...s, mode: s.mode || "chat" })));
      setAllSessions(raw.map((r) => ({
        id: r.id,
        summary: r.summary || "Untitled session",
        mode: r.mode || "chat",
        turnCount: r.turnCount,
        startedAt: r.startedAt,
      })));
    } catch {
      setSessions([]);
      setAllSessions([]);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    const requestedId = searchParams.get("project");
    if (requestedId && requestedId !== selectedId && projects.some((p) => p.id === requestedId)) {
      setSelectedId(requestedId);
    }
  }, [searchParams, projects, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (searchParams.get("project") !== selectedId) {
      setSearchParams({ project: selectedId }, { replace: true });
    }
    loadProjectSessions(selectedId);
  }, [selectedId]);

  useEffect(() => {
    setDraftName(selected?.name || "");
    setDraftDesc(selected?.description || "");
    setDraftRules(selected?.rules || "");
  }, [selected?.id]);

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await window.api.projects.create(name);
    setNewName("");
    await loadProjects(created.id);
    notifyProjectsChanged();
  };

  const saveSelected = async (data: Partial<Pick<Project, "name" | "description" | "rules">>) => {
    if (!selected) return;
    await window.api.projects.update(selected.id, data);
    await loadProjects(selected.id);
    notifyProjectsChanged();
  };

  const updateProjectSetting = async (key: keyof ProjectSettings, value: boolean) => {
    if (!selected) return;
    const settings = { ...selectedSettings, [key]: value };
    await window.api.projects.update(selected.id, { settings });
    await loadProjects(selected.id);
    notifyProjectsChanged();
  };

  const openSession = async (session: ProjSession) => {
    const detail = await window.api.sessions.get(session.id);
    if (!detail) return;
    loadSession(detail);
    navigate(modePath(detail.mode || session.mode));
  };

  const createLinkedSession = async () => {
    if (!selected) return;
    const root = await window.api.workspace.getRoot();
    const created = await window.api.sessions.create("New session", root, "chat");
    if (!created?.id) return;
    await window.api.projects.addSession(selected.id, created.id);
    await loadProjectSessions(selected.id);
  };

  return (
    <div className="projects-view">
      <aside className="proj-sidebar">
        <div className="proj-sidebar-header">
          <span>Projects</span>
          <span>{projects.length}</span>
        </div>
        <div className="proj-create-row">
          <input className="proj-create-input" placeholder="New project" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createProject(); }} />
          <Button variant="ghost" size="sm" onClick={createProject} disabled={!newName.trim()}>
            <Plus size={12} />
          </Button>
        </div>
        <div className="proj-list">
          {projects.map((project) => (
            <button key={project.id} className={`proj-item ${project.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(project.id)} type="button">
              <FolderKanban size={13} strokeWidth={1.5} />
              <span>{project.name}</span>
              <span className="proj-item-count">
                {project.id === selectedId ? sessions.length : ""}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="proj-content">
        {selected ? (
          <>
            <header className="proj-header">
              <div>
                <input className="proj-name-input" value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    const name = draftName.trim();
                    if (name && name !== selected.name) saveSelected({ name });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") { setDraftName(selected.name); e.currentTarget.blur(); }
                  }} />
                <input className="proj-desc-input" value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  onBlur={() => {
                    if (draftDesc !== selected.description) saveSelected({ description: draftDesc });
                  }}
                  placeholder="Description"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") { setDraftDesc(selected.description); e.currentTarget.blur(); }
                  }} />
              </div>
              <div className="proj-header-meta">
                <span>{new Date(normalizeTs(selected.createdAt)).toLocaleDateString()}</span>
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (!confirm(`Delete project "${selected.name}"?`)) return;
                  await window.api.projects.delete(selected.id);
                  await loadProjects();
                  notifyProjectsChanged();
                }}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </header>

            <section className="proj-section">
              <div className="proj-section-header">
                <span>Shared context</span>
              </div>
              <div className="proj-toggle-list">
                <label className="proj-toggle-row">
                  <input type="checkbox" checked={!!selectedSettings.shareKnowledge}
                    onChange={(e) => updateProjectSetting("shareKnowledge", e.target.checked)} />
                  <span>
                    <strong>Share knowledge between linked sessions</strong>
                    <em>Chat, Code, Design, and Cowork can use the project conversation context when this is on.</em>
                  </span>
                </label>
                <label className="proj-toggle-row">
                  <input type="checkbox" checked={!!selectedSettings.shareMemory}
                    onChange={(e) => updateProjectSetting("shareMemory", e.target.checked)} />
                  <span>
                    <strong>Share memory/rules</strong>
                    <em>Use project rules as working memory instead of treating the project as a simple folder.</em>
                  </span>
                </label>
                <label className="proj-toggle-row">
                  <input type="checkbox" checked={selectedSettings.shareArtifacts !== false}
                    onChange={(e) => updateProjectSetting("shareArtifacts", e.target.checked)} />
                  <span>
                    <strong>Share project artifacts</strong>
                    <em>Files promoted to this project are visible to all linked sessions without touching the workspace.</em>
                  </span>
                </label>
              </div>
            </section>

            <section className="proj-section">
              <div className="proj-section-header">
                <span>Project rules</span>
                <Button variant="ghost" size="sm" onClick={() => saveSelected({ rules: draftRules })}>
                  Save rules
                </Button>
              </div>
              <textarea className="proj-rules-input" value={draftRules}
                onChange={(e) => setDraftRules(e.target.value)}
                placeholder="Rules, project context, constraints, and preferences shared by sessions in this project."
                rows={7} />
            </section>

            <section className="proj-section">
              <div className="proj-section-header">
                <span>Linked sessions</span>
                <div className="proj-section-actions">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddSessions((v) => !v)}>
                    <Link size={12} /> Add existing
                  </Button>
                  <Button variant="ghost" size="sm" onClick={createLinkedSession}>
                    <Plus size={12} /> New session
                  </Button>
                </div>
              </div>

              <div className="proj-session-list">
                {sessions.length === 0 ? (
                  <div className="proj-empty-inline">No sessions linked yet.</div>
                ) : sessions.map((session) => (
                  <div key={session.id} className="proj-session-row">
                    <button className="proj-session-main" onClick={() => openSession(session)} type="button">
                      <MessageSquare size={13} strokeWidth={1.5} />
                      <span className="proj-mode-badge">{session.mode || "chat"}</span>
                      <span>{session.summary || "Untitled session"}</span>
                    </button>
                    <span className="proj-session-meta">{session.turnCount} turns</span>
                    <button className="proj-row-icon" onClick={async () => {
                      await window.api.projects.removeSession(selected.id, session.id);
                      await loadProjectSessions(selected.id);
                    }} title="Unlink session" type="button">
                      <Unlink size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {showAddSessions && (
              <section className="proj-section">
                <div className="proj-section-header">
                  <span>Available sessions</span>
                </div>
                <div className="proj-session-list">
                  {linkableSessions.length === 0 ? (
                    <div className="proj-empty-inline">No unlinked sessions available.</div>
                  ) : linkableSessions.map((session) => (
                    <div key={session.id} className="proj-session-row">
                      <button className="proj-session-main" onClick={() => openSession(session)} type="button">
                        <MessageSquare size={13} strokeWidth={1.5} />
                        <span className="proj-mode-badge">{session.mode || "chat"}</span>
                        <span>{session.summary || "Untitled session"}</span>
                      </button>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await window.api.projects.addSession(selected.id, session.id);
                        await loadProjectSessions(selected.id);
                      }}>
                        <Link size={12} /> Link
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="proj-empty">
            <FolderKanban size={34} strokeWidth={1} />
            <h3>No project selected</h3>
            <p>Create a project to group related sessions and keep project-specific rules in one place.</p>
          </div>
        )}
      </main>
    </div>
  );
}
