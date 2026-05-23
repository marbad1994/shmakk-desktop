import type { ComponentPropsWithoutRef } from "react";
import "./Input.css";

interface InputProps extends ComponentPropsWithoutRef<"input"> {}

export function Input({ className = "", ...props }: InputProps) {
  return <input className={`input ${className}`} {...props} />;
}
