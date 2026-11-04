"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Demo submit button with automatic pending state: disables itself,
 * shows a spinner and swaps the label while the server action runs,
 * so slow checkouts and AI calls never look dead (or invite spam-clicks).
 */
export function PendingButton({
  children,
  pendingLabel,
  tone = "dark",
  className = "",
  ...rest
}: {
  children: ReactNode;
  pendingLabel: ReactNode;
  tone?: "dark" | "green";
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "type">) {
  const { pending } = useFormStatus();
  const tones = {
    dark: "bg-stone-900 text-white hover:bg-stone-700 disabled:bg-stone-400",
    green: "bg-[#1a7f37] text-white hover:bg-[#156b2f] disabled:bg-[#1a7f37]/60",
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-medium transition-colors disabled:cursor-wait ${tones[tone]} ${className}`}
      {...rest}
    >
      {pending ? (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}
