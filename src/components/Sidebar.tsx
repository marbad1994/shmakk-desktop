import { useCallback, useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Archive,
  ChevronLeft,
  Code,
  Copy,
  FolderKanban,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useChatStore } from "../stores/chatStore";
import "./Sidebar.css";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface SidebarProject {
  id: string;
  name: string;
}

const modeItems: NavItem[] = [
  { label: "Chat", path: "/chat", icon: <MessageSquare size={16} strokeWidth={1.5} /> },
  { label: "Cowork", path: "/cowork", icon: <Users size={16} strokeWidth={1.5} /> },
  { label: "Design", path: "/design", icon: <DesignModeIcon /> },
  { label: "Code", path: "/code", icon: <Code size={16} strokeWidth={1.5} /> },
];

const utilityItems: NavItem[] = [
  { label: "Search", path: "/sessions", icon: <Search size={15} strokeWidth={1.5} /> },
  { label: "Artifacts", path: "/artifacts", icon: <Archive size={15} strokeWidth={1.5} /> },
  { label: "Tools", path: "/tools", icon: <Wrench size={15} strokeWidth={1.5} /> },
  { label: "Settings", path: "/settings", icon: <Settings size={15} strokeWidth={1.5} /> },
];

function formatWhen(ts: number): string {
  const normalized = ts < 10_000_000_000 ? ts * 1000 : ts;
  const diff = Date.now() - normalized;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function modeFromPath(pathname: string): string {
  const mode = pathname === "/" ? "chat" : pathname.slice(1).split("/")[0];
  return ["chat", "cowork", "design", "code"].includes(mode) ? mode : "chat";
}

function DesignModeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="10.5" r="2" />
      <circle cx="8.5" cy="7.5" r="2" />
      <circle cx="6.5" cy="12.5" r="2" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.86-.13 2.75-.38A10.02 10.02 0 0 0 22 12c0-5.5-4.5-10-10-10z" />
    </svg>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const location = useLocation();

  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const addConversation = useChatStore((s) => s.addConversation);
  const forkConversation = useChatStore((s) => s.forkConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);

  const loadSidebarProjects = useCallback(() => {
    window.api.projects.list().then((items) => {
      setProjects(items.map((p) => ({ id: p.id, name: p.name })).slice(0, 4));
    }).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    loadSidebarProjects();
    window.addEventListener("shmakk:projects-changed", loadSidebarProjects);
    return () => window.removeEventListener("shmakk:projects-changed", loadSidebarProjects);
  }, [loadSidebarProjects]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const currentMode = modeFromPath(location.pathname);
  const filteredConvos = conversations.filter((c) =>
    (c.mode || "chat") === currentMode
  );
  const recentConvos = filteredConvos.slice(0, 24);

  const submitRename = async (id: string) => {
    if (renameValue.trim()) {
      await updateConversation(id, { title: renameValue.trim() });
    }
    setRenamingId(null);
  };

  const handleFork = async (id: string) => {
    const newId = await forkConversation(id);
    if (newId) setActive(newId);
  };

  const handleNewSession = async () => {
    const id = await addConversation(currentMode);
    setActive(id);
  };

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-topbar">
        {!collapsed && <span className="sidebar-brand">shmakk</span>}
        <button className="sidebar-icon-btn" onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">
          <ChevronLeft size={14} strokeWidth={1.5}
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }} />
        </button>
      </div>

      <nav className="sidebar-modes" aria-label="Modes">
        {modeItems.map((item) => {
          const isChat = item.path === "/chat";
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive || (isChat && location.pathname === "/") ? "sidebar-link-active" : ""}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && (
        <section className="sidebar-projects">
          <div className="sidebar-row-heading">
            <span>Projects</span>
            <NavLink to="/projects" className="sidebar-inline-link">Manage</NavLink>
          </div>
          <div className="sidebar-project-list">
            {projects.length === 0 ? (
              <NavLink to="/projects" className="sidebar-project-empty">Create project</NavLink>
            ) : projects.map((project) => (
              <NavLink key={project.id} to={`/projects?project=${encodeURIComponent(project.id)}`} className="sidebar-project">
                <FolderKanban size={12} strokeWidth={1.5} />
                <span>{project.name}</span>
              </NavLink>
            ))}
          </div>
        </section>
      )}

      {!collapsed && (
        <section className="sidebar-sessions">
          <div className="sidebar-row-heading">
            <span>{currentMode} sessions</span>
            <button className="sidebar-inline-button" onClick={handleNewSession} type="button">
              <Plus size={12} strokeWidth={1.7} /> New
            </button>
          </div>

          <div className="sidebar-convo-list">
            {recentConvos.map((conv) => (
              <div key={conv.id}
                className={`sidebar-convo ${conv.id === activeId ? "sidebar-convo-active" : ""}`}
                onClick={() => setActive(conv.id)}>
                {renamingId === conv.id ? (
                  <input className="sidebar-rename-input" autoFocus
                    value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRename(conv.id); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => submitRename(conv.id)}
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <span className="sidebar-convo-title">{conv.title}</span>
                )}
                <span className="sidebar-convo-when">{formatWhen(conv.createdAt)}</span>
                {renamingId !== conv.id && (
                  <div className="sidebar-convo-actions-hover">
                    <button className="sidebar-convo-action-btn" onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(conv.id);
                      setRenameValue(conv.title);
                    }} title="Rename" type="button"><Pencil size={10} /></button>
                    <button className="sidebar-convo-action-btn" onClick={(e) => {
                      e.stopPropagation();
                      handleFork(conv.id);
                    }} title="Fork" type="button"><Copy size={10} /></button>
                    <button className="sidebar-convo-action-btn" onClick={(e) => {
                      e.stopPropagation();
                      removeConversation(conv.id);
                    }} title="Delete" type="button"><Trash2 size={10} /></button>
                  </div>
                )}
              </div>
            ))}
            {recentConvos.length === 0 && (
              <div className="sidebar-convo-empty">No sessions in this mode.</div>
            )}
          </div>
        </section>
      )}

      <nav className="sidebar-utilities" aria-label="Utilities">
        {utilityItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={() => {
              const current = `${location.pathname}${location.search}`;
              const active = item.path.includes("?")
                ? current === item.path
                : location.pathname === item.path && !location.search;
              return `sidebar-link sidebar-link-utility ${active ? "sidebar-link-active" : ""}`;
            }}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
