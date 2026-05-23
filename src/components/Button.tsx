import type { ComponentPropsWithoutRef } from "react";
import "./Button.css";

type ButtonVariant = "default" | "primary" | "ghost";
type ButtonSize = "default" | "sm" | "xs";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    variant !== "default" ? `btn-${variant}` : "",
    size !== "default" ? `btn-${size}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
