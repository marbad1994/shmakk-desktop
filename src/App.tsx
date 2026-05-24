import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./views/AppShell";
import { ChatView } from "./views/ChatView";
import { CoworkView } from "./views/CoworkView";
import { DesignView } from "./views/DesignView";
import { CodeView } from "./views/CodeView";
import { SettingsView } from "./views/SettingsView";
import { SessionSearchView } from "./views/SessionSearchView";
import { MemoryRulesView } from "./views/MemoryRulesView";
import { SkillsBrowserView } from "./views/SkillsBrowserView";
import { EditViewerView } from "./views/EditViewerView";
import { WorkflowsView } from "./views/WorkflowsView";
import { PlansTasksView } from "./views/PlansTasksView";
import { ProjectsView } from "./views/ProjectsView";
import { ArtifactsView } from "./views/ArtifactsView";
import { ToolsView } from "./views/ToolsView";
import { useChatStore } from "./stores/chatStore";
import { useProjectStore } from "./stores/projectStore";
import { useSkillsStore } from "./stores/skillsStore";
import { useSettingsStore } from "./stores/settingsStore";
import "./styles/modes.css";

export function App() {
  const chatLoaded = useChatStore((s) => s.loaded);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadProjectFiles = useProjectStore((s) => s.loadProjectFiles);
  const loadSkills = useSkillsStore((s) => s.loadSkills);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSessions();
    loadProjectFiles();
    loadSkills();
    loadSettings();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ChatView />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="cowork" element={<CoworkView />} />
          <Route path="design" element={<DesignView />} />
          <Route path="code" element={<CodeView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="sessions" element={<SessionSearchView />} />
          <Route path="memory" element={<MemoryRulesView />} />
          <Route path="skills" element={<SkillsBrowserView />} />
          <Route path="edit" element={<EditViewerView />} />
          <Route path="workflows" element={<WorkflowsView />} />
          <Route path="plans" element={<PlansTasksView />} />
          <Route path="projects" element={<ProjectsView />} />
          <Route path="artifacts" element={<ArtifactsView />} />
          <Route path="tools" element={<ToolsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
