import type { ReactNode } from "react";
import "./Badge.css";

interface BadgeProps {
  count?: number;
  children?: ReactNode;
  variant?: "default" | "accent" | "green" | "neutral";
  className?: string;
}

export function Badge({ count, children, variant = "default", className = "" }: BadgeProps) {
  const hasContent = count !== undefined || children !== undefined;
  if (!hasContent) return null;
  if (count === 0 && children === undefined) return null;

  const classes = ["badge", `badge-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  if (children !== undefined) {
    return <span className={classes}>{children}</span>;
  }

  const display = (count as number) > 99 ? "99+" : String(count);
  return <span className={classes}>{display}</span>;
}
