import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Users,
  PenTool,
  Code,
  Puzzle,
  Clock,
  Database,
  Workflow,
  Settings,
  Archive,
  ChevronLeft,
  Plus,
  Search,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { Badge } from "./Badge";
import { useChatStore } from "../stores/chatStore";
import { useProjectStore } from "../stores/projectStore";
import "./Sidebar.css";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  count?: number;
}

const workspaceItems: NavItem[] = [
  { label: "Chat", path: "/chat", icon: <MessageSquare size={16} strokeWidth={1.5} /> },
  { label: "Cowork", path: "/cowork", icon: <Users size={16} strokeWidth={1.5} /> },
  { label: "Design", path: "/design", icon: <PenTool size={16} strokeWidth={1.5} /> },
  { label: "Code", path: "/code", icon: <Code size={16} strokeWidth={1.5} /> },
];

const shmakkItems: NavItem[] = [
  { label: "Skills", path: "/skills", icon: <Puzzle size={16} strokeWidth={1.5} /> },
  { label: "Sessions", path: "/sessions", icon: <Clock size={16} strokeWidth={1.5} /> },
  { label: "Memory & Rules", path: "/memory", icon: <Database size={16} strokeWidth={1.5} /> },
  { label: "Workflows", path: "/workflows", icon: <Workflow size={16} strokeWidth={1.5} /> },
  { label: "Settings", path: "/settings", icon: <Settings size={16} strokeWidth={1.5} /> },
  { label: "Artifacts", path: "/artifacts", icon: <Archive size={16} strokeWidth={1.5} /> },
];

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [convoSearch, setConvoSearch] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const location = useLocation();

  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const addConversation = useChatStore((s) => s.addConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const loadProjectFiles = useProjectStore((s) => s.loadProjectFiles);

  useEffect(() => {
    window.api.workspace.getRoot().then(setWorkspaceRoot);
  }, []);

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

  const folderName = workspaceRoot.split("/").pop() || workspaceRoot;

  const handleOpenFolder = async () => {
    const dir = await window.api.dialog.selectDirectory();
    if (dir) {
      await window.api.workspace.setRoot(dir);
      setWorkspaceRoot(dir);
      loadProjectFiles();
    }
  };

  const filteredConvos = conversations.filter((c) =>
    c.title.toLowerCase().includes(convoSearch.toLowerCase()),
  );
  const recentConvos = filteredConvos.slice(0, collapsed ? 0 : 12);

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-section">workspace</div>

      {workspaceItems.map((item) => {
        const isChat = item.path === "/chat";
        const convCount = isChat ? conversations.length : undefined;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item ${isActive || (isChat && location.pathname === "/") ? "nav-item-active" : ""}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && (convCount ?? item.count) !== undefined && (
              <Badge variant="neutral">{convCount ?? item.count}</Badge>
            )}
          </NavLink>
        );
      })}

      {!collapsed && workspaceRoot && (
        <div className="sidebar-workspace">
          <FolderOpen size={12} strokeWidth={1.5} className="sidebar-workspace-icon" />
          <span className="sidebar-workspace-name" title={workspaceRoot}>{folderName}</span>
          <button className="sidebar-workspace-btn" onClick={handleOpenFolder} type="button" title="Open folder...">Open</button>
        </div>
      )}

      <div className="sidebar-section">shmakk</div>

      {shmakkItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `nav-item ${isActive ? "nav-item-active" : ""}`
          }
        >
          <span className="nav-icon">{item.icon}</span>
          {!collapsed && <span className="nav-label">{item.label}</span>}
          {!collapsed && item.count !== undefined && (
            <Badge variant="neutral">{item.count}</Badge>
          )}
        </NavLink>
      ))}

      {/* Conversations section */}
      {!collapsed && (
        <>
          <div className="sidebar-section">conversations</div>

          <div className="sidebar-convo-actions">
            <button
              className="sidebar-new-chat"
              onClick={async () => {
                const id = await addConversation();
                setActive(id);
              }}
              type="button"
            >
              <Plus size={14} strokeWidth={1.5} />
              New chat
            </button>
          </div>

          {conversations.length > 0 && (
            <div className="sidebar-convo-search">
              <Search size={12} strokeWidth={1.5} className="sidebar-search-icon" />
              <input
                type="text"
                className="sidebar-search-input"
                placeholder="Search..."
                value={convoSearch}
                onChange={(e) => setConvoSearch(e.target.value)}
              />
            </div>
          )}

          {recentConvos.length > 0 && (
            <div className="sidebar-convo-list">
              {recentConvos.map((conv) => (
                <div
                  key={conv.id}
                  className={`sidebar-convo ${conv.id === activeId ? "sidebar-convo-active" : ""}`}
                  onClick={() => setActive(conv.id)}
                >
                  <span className="sidebar-convo-title">{conv.title}</span>
                  <span className="sidebar-convo-when">{formatWhen(conv.createdAt)}</span>
                  <button
                    className="sidebar-convo-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConversation(conv.id);
                    }}
                    title="Delete conversation"
                    type="button"
                  >
                    <Trash2 size={11} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              {recentConvos.length === 0 && convoSearch && (
                <div className="sidebar-convo-empty">
                  <span className="text-muted">No matches</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">M</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">marcus</span>
              <span className="sidebar-user-role mono">arch · fish</span>
            </div>
          </div>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={16}
            strokeWidth={1.5}
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          />
        </button>
      </div>
    </aside>
  );
}
