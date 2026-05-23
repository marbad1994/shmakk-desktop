import { create } from "zustand";

interface VoiceState {
  ttsAvailable: boolean;
  sttAvailable: boolean;
  microphoneAvailable: boolean;
  recorder: string | null;
  isListening: boolean;
  isSpeaking: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  checked: boolean;

  checkAvailability: () => Promise<void>;
  setTtsEnabled: (v: boolean) => void;
  setSttEnabled: (v: boolean) => void;
  setTtsVoice: (voice: string) => void;
  setTtsSpeed: (speed: number) => void;
  startListening: () => Promise<string>;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  ttsAvailable: false,
  sttAvailable: false,
  microphoneAvailable: false,
  recorder: null,
  isListening: false,
  isSpeaking: false,
  ttsEnabled: false,
  sttEnabled: false,
  ttsVoice: "af_heart",
  ttsSpeed: 1.5,
  checked: false,

  checkAvailability: async () => {
    try {
      const result = await window.api.voice.checkAvailability();
      set({
        ttsAvailable: result.ttsAvailable,
        sttAvailable: result.sttAvailable,
        microphoneAvailable: result.microphoneAvailable,
        recorder: result.recorder,
        checked: true,
      });
    } catch {
      set({ checked: true });
    }
  },

  startListening: async () => {
    if (!get().microphoneAvailable) return "";
    set({ isListening: true });
    try {
      const result = await window.api.voice.recordAndTranscribe();
      set({ isListening: false });
      return result.text || "";
    } catch {
      set({ isListening: false });
      return "";
    }
  },

  stopListening: () => {
    set({ isListening: false });
  },

  speak: async (text) => {
    if (!get().ttsAvailable || !get().ttsEnabled) return;
    set({ isSpeaking: true });
    try {
      await window.api.voice.speak(text, {
        voice: get().ttsVoice,
        speed: get().ttsSpeed,
      });
    } catch { /* ignore */ }
    set({ isSpeaking: false });
  },

  stopSpeaking: () => {
    window.api.voice.stopSpeaking();
    set({ isSpeaking: false });
  },

  setTtsEnabled: (v) => set({ ttsEnabled: v }),
  setSttEnabled: (v) => set({ sttEnabled: v }),
  setTtsVoice: (voice) => set({ ttsVoice: voice }),
  setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
}));
