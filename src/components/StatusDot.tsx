import "./StatusDot.css";

export type StatusDotVariant = "online" | "offline" | "busy" | "idle" | "accent";

interface StatusDotProps {
  variant?: StatusDotVariant;
  size?: number;
}

const variantClass: Record<StatusDotVariant, string> = {
  online: "dot-online",
  offline: "dot-offline",
  busy: "dot-busy",
  idle: "dot-idle",
  accent: "dot-accent",
};

export function StatusDot({ variant = "online", size = 6 }: StatusDotProps) {
  return (
    <span
      className={`status-dot ${variantClass[variant]}`}
      style={{ width: size, height: size }}
    />
  );
}
