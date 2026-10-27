import type { ReactNode } from "react";

export type BannerTone = "error" | "success" | "warn" | "info";

const TONES: Record<BannerTone, string> = {
  error: "border-[#b3402a]/30 bg-[#b3402a]/5 text-[#7e2a1b]",
  success: "border-[#1a7f37]/25 bg-[#1a7f37]/5 text-[#145f2a]",
  warn: "border-[#9a6a00]/30 bg-[#e8c87a]/15 text-[#6b4a00]",
  info: "border-[#1c1917]/20 bg-[#1c1917]/5 text-[#1c1917]",
};

/** Feedback banner wired for assistive tech: errors assert, the rest politely announce. */
export function Banner({ tone, title, children }: { tone: BannerTone; title?: string; children?: ReactNode }) {
  const assertive = tone === "error";
  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${TONES[tone]}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
    </div>
  );
}
