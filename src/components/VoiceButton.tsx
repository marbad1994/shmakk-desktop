import { Mic, Square } from "lucide-react";
import { useVoiceStore } from "../stores/voiceStore";
import "./VoiceButton.css";

export function VoiceButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const microphoneAvailable = useVoiceStore((s) => s.microphoneAvailable);
  const sttEnabled = useVoiceStore((s) => s.sttEnabled);
  const isListening = useVoiceStore((s) => s.isListening);
  const startListening = useVoiceStore((s) => s.startListening);
  const stopListening = useVoiceStore((s) => s.stopListening);
  const checkAvailability = useVoiceStore((s) => s.checkAvailability);
  const checked = useVoiceStore((s) => s.checked);

  if (!checked) return null;
  if (!microphoneAvailable || !sttEnabled) return null;

  const handleClick = async () => {
    if (isListening) {
      stopListening();
      return;
    }
    const text = await startListening();
    if (text.trim()) {
      onTranscribed(text);
    }
  };

  return (
    <button
      className={`voice-btn ${isListening ? "voice-btn-recording" : ""}`}
      onClick={handleClick}
      title={isListening ? "Listening..." : "Voice input"}
      type="button"
    >
      {isListening ? (
        <Square size={13} strokeWidth={2} fill="currentColor" />
      ) : (
        <Mic size={14} strokeWidth={1.5} />
      )}
    </button>
  );
}
