import { create } from "zustand";

export type PanelView = "artifacts" | "files" | "layers" | null;

interface AppStore {
  sidebarCollapsed: boolean;
  rightPanel: PanelView;
  rightPanelWidth: number;
  toggleSidebar: () => void;
  setRightPanel: (panel: PanelView) => void;
  setRightPanelWidth: (w: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  sidebarCollapsed: false,
  rightPanel: null,
  rightPanelWidth: 360,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setRightPanel: (panel) =>
    set((s) => ({ rightPanel: s.rightPanel === panel ? null : panel })),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
}));
