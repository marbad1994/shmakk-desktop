import { useChatStore } from "../stores/chatStore";

interface ProjectContextProject {
  id: string;
  name: string;
  description: string;
  rules: string;
  settings: Record<string, unknown>;
}

function enabled(value: unknown): boolean {
  return value === true;
}

export async function buildActiveProjectContext(): Promise<string> {
  const activeId = useChatStore.getState().activeId;
  if (!activeId || activeId.startsWith("conv-")) return "";

  const projects = await window.api.projects.getForSession(activeId).catch(() => []) as ProjectContextProject[];
  const project = projects[0];
  if (!project) return "";

  const shareKnowledge = enabled(project.settings?.shareKnowledge);
  const shareMemory = enabled(project.settings?.shareMemory);
  if (!shareKnowledge && !shareMemory) return "";

  const parts: string[] = [`## Project context: ${project.name}`];
  if (project.description) parts.push(`Description: ${project.description}`);
  if (shareMemory && project.rules) parts.push(`Project rules:\n${project.rules.slice(0, 2000)}`);

  if (shareKnowledge) {
    const sessions = await window.api.projects.getSessions(project.id).catch(() => []);
    const others = sessions.filter((s) => s.id !== activeId).slice(0, 4);
    for (const session of others) {
      const detail = await window.api.sessions.get(session.id).catch(() => null);
      if (!detail) continue;
      const turns = detail.turns.slice(-6).map((turn) =>
        `${turn.role}: ${turn.content.slice(0, 700)}`
      ).join("\n");
      if (turns) parts.push(`Linked ${session.mode || "chat"} session: ${session.summary || session.id}\n${turns}`);
    }
  }

  return `${parts.join("\n\n")}\n\n`;
}

export async function withActiveProjectContext(prompt: string): Promise<string> {
  const context = await buildActiveProjectContext();
  if (!context) return prompt;
  return `${context}## Current request\n${prompt}`;
}
