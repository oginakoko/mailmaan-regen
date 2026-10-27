import type { ReactNode } from "react";

/** Small labeled metric for overview and project cards. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1c1917]/10 bg-white px-4 py-3">
      <p className="text-xs font-semibold tracking-wider text-[#1c1917]/55 uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-medium text-[#1c1917]">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[#1c1917]/55">{sub}</p> : null}
    </div>
  );
}
