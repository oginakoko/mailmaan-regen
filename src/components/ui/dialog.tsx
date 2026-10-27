"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

type DialogProps = {
  /** Text (or node) rendered inside the trigger button. */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  wide?: boolean;
};

/**
 * Button-triggered modal built on the native <dialog>: top-layer,
 * focus handling and Escape-to-close come from the platform. Clicking
 * the backdrop closes too. Server-action forms work unchanged inside.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerVariant = "primary",
  triggerSize = "md",
  wide = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClick = (event: MouseEvent) => {
      // Native dialogs don't close on backdrop click; add it without
      // breaking form submits (only close when the dialog itself is hit).
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", onClick);
    return () => dialog.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClass(triggerVariant, triggerSize)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className={`m-auto max-h-[calc(100vh-2rem)] rounded-2xl border border-[#1c1917]/15 bg-[#faf7f0] p-0 text-[#1c1917] shadow-2xl backdrop:bg-[#1c1917]/60 backdrop:backdrop-blur-[2px] ${
          wide ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]"
        }`}
      >
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-display text-2xl font-medium tracking-tight">
                {title}
              </h2>
              {description ? <div className="mt-1 text-sm leading-6 text-[#1c1917]/65">{description}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close dialog"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-[#1c1917]/60 hover:bg-[#1c1917]/5 hover:text-[#1c1917] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </dialog>
    </>
  );
}
