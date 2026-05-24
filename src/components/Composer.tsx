import { useState, useRef, useEffect } from "react";
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react";
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
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
}

export function Composer({
  value, onChange, onSend, placeholder = "Type a message...",
  disabled = false, generating = false, onStop, onKeyDown, header, children,
}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const snippets = await Promise.all(Array.from(files).slice(0, 5).map(async (file) => {
      const text = await file.text().catch(() => "");
      const content = text.slice(0, 8000);
      return `\n\nAttached file: ${file.name}\n\`\`\`\n${content}${text.length > content.length ? "\n...truncated" : ""}\n\`\`\``;
    }));
    onChange(`${value}${snippets.join("")}`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleVoice = async () => {
    if (isListening) return;
    const text = await startListening();
    if (text.trim()) onChange(value ? `${value} ${text}` : text);
  };

  return (
    <div className={`shmakk-composer ${generating ? "shmakk-composer-generating" : ""}`}>
      <div className="shmakk-composer-input">
        <input
          ref={fileRef}
          className="shmakk-file-input"
          type="file"
          multiple
          onChange={(e) => handleAttachFiles(e.target.files)}
        />
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
          <button className="shmakk-tool-btn" onClick={() => fileRef.current?.click()} title="Attach files" type="button">
            <Paperclip size={14} strokeWidth={1.5} />
          </button>
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
          <span className={`shmakk-composer-hint ${generating ? "shmakk-composer-hint-live" : ""}`}>
            {generating ? <><span className="shmakk-generating-dot" />Generating</> : "Enter to send"}
          </span>
          {generating && onStop ? (
            <button className="shmakk-stop-btn" onClick={onStop} type="button" title="Stop generation" aria-label="Stop generation">
              <Square size={13} strokeWidth={2} fill="currentColor" />
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
