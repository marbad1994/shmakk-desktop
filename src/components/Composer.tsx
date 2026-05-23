import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Square, ChevronDown, Mic } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { useVoiceStore } from "../stores/voiceStore";
import "./Composer.css";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  generating?: boolean;
  onStop?: () => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
}

export function Composer({
  value, onChange, onSend, placeholder = "Type a message...",
  disabled = false, generating = false, onStop, header, children,
}: ComposerProps) {
  const providerId = useSettingsStore((s) => s.providerId);
  const model = useSettingsStore((s) => s.model);
  const endpoints = useSettingsStore((s) => s.endpoints);
  const saveModel = useSettingsStore((s) => s.saveModel);
  const [modelDropOpen, setModelDropOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const voiceChecked = useVoiceStore((s) => s.checked);
  const checkVoiceAvailability = useVoiceStore((s) => s.checkAvailability);
  const microphoneAvailable = useVoiceStore((s) => s.microphoneAvailable);
  const sttEnabled = useVoiceStore((s) => s.sttEnabled);
  const isListening = useVoiceStore((s) => s.isListening);
  const startListening = useVoiceStore((s) => s.startListening);
  const [stsActive, setStsActive] = useState(false);
  const [stsState, setStsState] = useState<"listening" | "thinking" | "speaking" | "off">("off");

  useEffect(() => { if (!voiceChecked) checkVoiceAvailability(); }, [voiceChecked, checkVoiceAvailability]);

  useEffect(() => {
    const unsubState = window.api.voice.onSTSState((data) => {
      setStsState(data.state);
      if (data.state === "off") setStsActive(false);
    });
    return () => { unsubState(); };
  }, []);

  const handleToggleSTS = async () => {
    if (stsActive) { window.api.voice.stopSTS(); setStsActive(false); setStsState("off"); return; }
    if (!voiceChecked) await checkVoiceAvailability();
    const result = await window.api.voice.startSTS();
    if (result.ok) { setStsActive(true); setStsState("listening"); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelDropOpen(false);
    };
    if (modelDropOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelDropOpen]);

  useEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleVoice = async () => {
    if (isListening) return;
    const text = await startListening();
    if (text.trim()) onChange(value ? `${value} ${text}` : text);
  };

  return (
    <div className="shmakk-composer">
      <div className="shmakk-composer-input">
        {header}
        <textarea
          ref={inputRef}
          className="shmakk-composer-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        {children}
        <div className="shmakk-composer-row">
          {endpoints.length > 1 && (
            <div className="shmakk-model-pick" ref={modelRef}>
              <button className="shmakk-model-btn" onClick={() => setModelDropOpen(!modelDropOpen)} type="button">
                <span className="shmakk-model-label mono">{providerId}</span>
                <ChevronDown size={10} strokeWidth={2}
                  style={{ transform: modelDropOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s ease" }}
                />
              </button>
              {modelDropOpen && (
                <div className="shmakk-model-drop">
                  {endpoints.map((ep) => (
                    <button key={ep.id} className={`shmakk-model-item ${ep.id === providerId ? "shmakk-model-item-active" : ""}`}
                      onClick={() => { saveModel(ep.id, model); setModelDropOpen(false); }} type="button">
                      <span>{ep.name}</span><span className="shmakk-model-type mono">{ep.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {voiceChecked && microphoneAvailable && sttEnabled && (
            <button className={`shmakk-voice-btn ${isListening ? "shmakk-voice-active" : ""}`}
              onClick={handleVoice} title="Voice input" type="button">
              <Mic size={14} strokeWidth={1.5} />
            </button>
          )}
          {voiceChecked && (
            <button className={`shmakk-sts-btn ${stsActive ? "shmakk-sts-active" : ""} shmakk-sts-${stsState}`}
              onClick={handleToggleSTS} title={stsActive ? `STS: ${stsState}` : "Speech-to-speech"} type="button">
              <span className="shmakk-sts-dot" /><span className="shmakk-sts-label mono">{stsActive ? stsState : "STS"}</span>
            </button>
          )}
          <div className="shmakk-composer-spacer" />
          <span className="shmakk-composer-hint mono">{generating ? "Generating..." : "Enter to send"}</span>
          {generating && onStop ? (
            <button className="shmakk-stop-btn" onClick={onStop} type="button">
              <Square size={14} strokeWidth={2} fill="currentColor" /> Stop
            </button>
          ) : (
            <button className="shmakk-send-btn" onClick={onSend} disabled={!value.trim() || disabled} type="button">
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
