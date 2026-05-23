import { type LucideIcon, type LucideProps } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import "./IconButton.css";

type IconButtonVariant = "ghost" | "default";
type IconButtonSize = "sm" | "md";

interface IconButtonProps extends ComponentPropsWithoutRef<"button"> {
  icon: LucideIcon;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  label: string;
  iconProps?: LucideProps;
}

export function IconButton({
  icon: Icon,
  size = "md",
  variant = "ghost",
  label,
  className = "",
  iconProps,
  ...props
}: IconButtonProps) {
  const classes = [
    "icon-btn",
    `icon-btn-${size}`,
    variant !== "ghost" ? `icon-btn-${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} aria-label={label} title={label} {...props}>
      <Icon size={size === "sm" ? 14 : 16} strokeWidth={1.5} {...iconProps} />
    </button>
  );
}
