import type { ComponentPropsWithoutRef, ReactNode } from "react";
import "./Chip.css";

interface ChipProps extends ComponentPropsWithoutRef<"span"> {
  active?: boolean;
  children: ReactNode;
  className?: string;
  asButton?: boolean;
}

export function Chip({
  active = false,
  children,
  className = "",
  asButton = false,
  onClick,
  ...props
}: ChipProps) {
  const classes = ["chip", active ? "chip-active" : "", className]
    .filter(Boolean)
    .join(" ");

  if (onClick || asButton) {
    return (
      <button
        className={classes}
        onClick={onClick}
        type="button"
        {...(props as ComponentPropsWithoutRef<"button">)}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
