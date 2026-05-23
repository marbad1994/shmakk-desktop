import { create } from "zustand";

export interface FileEntry {
  path: string;
  status: "modified" | "added" | "deleted" | "unchanged";
  content: string;
}

export interface DesignLayer {
  id: string;
  name: string;
  type: "frame" | "text" | "shape" | "image";
  visible: boolean;
  children?: DesignLayer[];
}

interface ProjectStore {
  files: FileEntry[];
  activeFilePath: string | null;
  loaded: boolean;
  designLayers: DesignLayer[];
  activeLayerId: string | null;
  /** Load project files from the workspace */
  loadProjectFiles: () => Promise<void>;
  /** Read a specific file's content */
  loadFileContent: (filePath: string) => Promise<void>;
  setActiveFile: (path: string) => void;
  setActiveLayer: (id: string) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  files: [],
  activeFilePath: null,
  loaded: false,

  designLayers: [],
  activeLayerId: null,

  loadProjectFiles: async () => {
    try {
      const projectFiles = await window.api.workspace.getProjectFiles();
      const files: FileEntry[] = projectFiles.map((f) => ({
        path: f.path,
        status: f.status as FileEntry["status"],
        content: "",
      }));

      set({
        files,
        activeFilePath: files.length > 0 ? files[0].path : null,
        loaded: true,
      });
    } catch (err) {
      console.error("Failed to load project files:", err);
      set({ loaded: true });
    }
  },

  loadFileContent: async (filePath: string) => {
    try {
      const content = await window.api.workspace.readFile(filePath);
      if (content !== null) {
        set((s) => ({
          files: s.files.map((f) =>
            f.path === filePath ? { ...f, content } : f,
          ),
        }));
      }
    } catch (err) {
      console.error(`Failed to read file "${filePath}":`, err);
    }
  },

  setActiveFile: (path) => {
    set({ activeFilePath: path });
    // Auto-load content when selecting a file
    const file = get().files.find((f) => f.path === path);
    if (file && !file.content) {
      get().loadFileContent(path);
    }
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),
}));
