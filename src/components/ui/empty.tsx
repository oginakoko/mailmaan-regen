import type { ReactNode } from "react";

/** Guidance-first empty state: what this is, what to do, and the action. */
export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[#1c1917]/25 bg-white/60 px-6 py-10 text-center">
      <p className="font-display text-xl font-medium text-[#1c1917]">{title}</p>
      <div className="mx-auto max-w-md text-sm leading-6 text-[#1c1917]/65">{body}</div>
      {action ? <div className="flex justify-center pt-2">{action}</div> : null}
    </div>
  );
}
