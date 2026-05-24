import { create } from "zustand";

export interface Skill {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  installed: boolean;
  enabled: boolean;
  source?: string;
}

interface SkillsStore {
  skills: Skill[];
  searchQuery: string;
  loaded: boolean;
  loadSkills: () => Promise<void>;
  setSearch: (query: string) => void;
  toggleEnabled: (id: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  searchQuery: "",
  loaded: false,

  loadSkills: async () => {
    try {
      const entries = await window.api.skills.list();
      const skills: Skill[] = entries.map((e) => ({
        id: e.id,
        name: e.name,
        version: e.version,
        author: e.author,
        description: e.description,
        category: e.category,
        installed: e.installed,
        enabled: e.enabled,
        source: e.source,
      }));
      set({ skills, loaded: true });
    } catch (err) {
      console.error("Failed to load skills:", err);
      set({ loaded: true });
    }
  },

  setSearch: (query) => set({ searchQuery: query }),

  toggleEnabled: async (id) => {
    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    const newEnabled = !skill.enabled;

    // Optimistic update
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.id === id ? { ...sk, enabled: newEnabled } : sk,
      ),
    }));

    // Persist via IPC
    try {
      const ok = await window.api.skills.toggle(id, newEnabled);
      if (!ok) throw new Error("Skill toggle was not persisted");
    } catch (err) {
      console.error("Failed to toggle skill:", err);
      // Revert
      set((s) => ({
        skills: s.skills.map((sk) =>
          sk.id === id ? { ...sk, enabled: !newEnabled } : sk,
        ),
      }));
    }
  },
}));
