import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Titlebar } from "../components/Titlebar";
import { Sidebar } from "../components/Sidebar";
import { StatusBar } from "../components/StatusBar";
import { useChatStore } from "../stores/chatStore";
import "./AppShell.css";

const MODES = ["chat", "cowork", "design", "code"];

export function AppShell() {
  const location = useLocation();
  const currentPath = location.pathname === "/" ? "/chat" : location.pathname;
  const loadModeSession = useChatStore((s) => s.loadModeSession);

  useEffect(() => {
    const mode = MODES.find((m) => currentPath.startsWith("/" + m));
    if (mode) {
      loadModeSession(mode);
    }
  }, [currentPath]);

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
