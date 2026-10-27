"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "gold" | "secondary" | "danger" | "danger-outline" | "ghost";
export type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[#1c1917] text-[#f7f2e7] hover:bg-black disabled:bg-[#1c1917]/60",
  gold: "bg-[#e8c87a] text-[#1c1917] hover:bg-[#f2d894] disabled:bg-[#e8c87a]/60",
  secondary:
    "border border-[#1c1917]/25 bg-white text-[#1c1917] hover:bg-[#1c1917]/5 disabled:opacity-60",
  danger: "bg-[#b3402a] text-white hover:bg-[#93331f] disabled:bg-[#b3402a]/60",
  "danger-outline":
    "border border-[#b3402a]/40 bg-white text-[#b3402a] hover:bg-[#b3402a]/5 disabled:opacity-60",
  ghost: "text-[#1c1917]/70 hover:bg-[#1c1917]/5 hover:text-[#1c1917] disabled:opacity-60",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-[44px] px-5 py-2.5 text-sm",
  sm: "min-h-[36px] px-3.5 py-1.5 text-sm",
};

/** Shared classes so links and dialog triggers match real buttons. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a] disabled:cursor-wait ${VARIANTS[variant]} ${SIZES[size]}`;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type SubmitButtonProps = {
  children: ReactNode;
  /** Label swapped in while the enclosing form's server action runs. Defaults to children. */
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & { className?: string };

/**
 * Submit button with automatic pending state: inside any server-action form
 * it disables itself, shows a spinner and swaps the label while the action
 * runs — no per-form wiring needed.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${buttonClass(variant, size)} ${className}`}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
}
