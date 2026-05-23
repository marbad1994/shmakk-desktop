import { Outlet } from "react-router-dom";
import { Titlebar } from "../components/Titlebar";
import { Sidebar } from "../components/Sidebar";
import { StatusBar } from "../components/StatusBar";
import "./AppShell.css";

export function AppShell() {
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
