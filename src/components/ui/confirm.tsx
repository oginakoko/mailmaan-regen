"use client";

import { useState, type ReactNode } from "react";
import { SubmitButton } from "./button";

type ConfirmFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  /** Label of the resting button, e.g. "Revoke". */
  label: ReactNode;
  /** Label once armed, e.g. "Click again to revoke". */
  confirmLabel: ReactNode;
  children?: ReactNode;
};

/**
 * Two-click destructive action: first click arms (button turns solid
 * danger and asks for confirmation), second click submits the real form.
 * Resets if focus leaves. No fake deletes — the same server action runs.
 */
export function ConfirmForm({ action, label, confirmLabel, children }: ConfirmFormProps) {
  const [armed, setArmed] = useState(false);
  return (
    <form
      action={async (formData) => {
        await action(formData);
        setArmed(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setArmed(false);
      }}
    >
      {children}
      {armed ? (
        <SubmitButton variant="danger" size="sm" pendingLabel="Working…">
          {confirmLabel}
        </SubmitButton>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-live="polite"
          className="inline-flex min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-full border border-[#b3402a]/40 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#b3402a] transition-colors hover:bg-[#b3402a]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
        >
          {label}
        </button>
      )}
    </form>
  );
}
