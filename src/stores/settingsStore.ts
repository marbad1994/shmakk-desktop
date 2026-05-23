import { create } from "zustand";

export type LlmProvider = "anthropic" | "openai" | "local";

export interface EndpointConfig {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface SettingsStore {
  provider: LlmProvider;
  providerId: string;
  model: string;
  apiKey: string;
  theme: "dark" | "light";
  fontSize: number;
  autoSave: boolean;
  telemetry: boolean;
  endpoints: EndpointConfig[];
  loaded: boolean;
  /** Load settings from shmakk config via IPC */
  loadSettings: () => Promise<void>;
  /** Add a new endpoint via IPC */
  addEndpoint: (id: string, name: string, url: string, apiKey: string) => Promise<void>;
  /** Delete an endpoint via IPC */
  deleteEndpoint: (id: string) => Promise<void>;
  /** Persist model selection to shmakk config */
  saveModel: (providerId: string, model: string) => Promise<void>;
  setProvider: (p: LlmProvider) => void;
  setModel: (m: string) => void;
  setApiKey: (k: string) => void;
  setTheme: (t: "dark" | "light") => void;
  setFontSize: (n: number) => void;
  setAutoSave: (v: boolean) => void;
  setTelemetry: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  provider: "anthropic",
  providerId: "ds",
  model: "deepseek-v4-pro",
  apiKey: "",
  theme: "dark",
  fontSize: 13,
  autoSave: true,
  telemetry: false,
  endpoints: [],
  loaded: false,

  loadSettings: async () => {
    try {
      const status = await window.api.config.status();
      const endpoints = status.providers.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        type: p.type,
      }));

      set({
        providerId: status.defaultProvider || "ds",
        model: status.model || "deepseek-v4-pro",
        endpoints,
        loaded: true,
      });
    } catch (err) {
      console.error("Failed to load settings:", err);
      set({ loaded: true });
    }
  },

  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setAutoSave: (autoSave) => set({ autoSave }),
  setTelemetry: (telemetry) => set({ telemetry }),

  addEndpoint: async (id, name, url, apiKey) => {
    await window.api.settings.addEndpoint(id, name, url, apiKey);
    // Reload endpoints
    const status = await window.api.config.status();
    set({
      endpoints: status.providers.map((p) => ({ id: p.id, name: p.name, url: p.url, type: p.type })),
    });
  },

  deleteEndpoint: async (id) => {
    await window.api.settings.deleteEndpoint(id);
    const status = await window.api.config.status();
    set({
      endpoints: status.providers.map((p) => ({ id: p.id, name: p.name, url: p.url, type: p.type })),
      providerId: status.defaultProvider || get().providerId,
    });
  },

  saveModel: async (providerId, model) => {
    set({ providerId, model });
    await window.api.chat.setProfile(providerId);
  },
}));
