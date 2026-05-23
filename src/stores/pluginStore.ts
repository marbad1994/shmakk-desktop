import { create } from "zustand";
import type { InstalledPlugin, PluginInstallResult } from "../types/api";

interface PluginStore {
  plugins: InstalledPlugin[];
  loaded: boolean;
  installError: string | null;
  loadPlugins: () => Promise<void>;
  installFromFolder: () => Promise<PluginInstallResult>;
  uninstallPlugin: (name: string) => Promise<boolean>;
  clearError: () => void;
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  plugins: [],
  loaded: false,
  installError: null,

  loadPlugins: async () => {
    try {
      const plugins = await window.api.plugins.list();
      set({ plugins, loaded: true });
    } catch (err) {
      console.error("Failed to load plugins:", err);
      set({ loaded: true });
    }
  },

  installFromFolder: async () => {
    set({ installError: null });
    try {
      const result = await window.api.plugins.installFromFolder();
      if (result.error) {
        set({ installError: result.error });
        return result;
      }
      // Reload plugin list
      await get().loadPlugins();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      set({ installError: msg });
      return { error: msg };
    }
  },

  uninstallPlugin: async (name: string) => {
    try {
      const ok = await window.api.plugins.uninstall(name);
      if (ok) await get().loadPlugins();
      return ok;
    } catch (err) {
      console.error("Failed to uninstall plugin:", err);
      return false;
    }
  },

  clearError: () => set({ installError: null }),
}));
