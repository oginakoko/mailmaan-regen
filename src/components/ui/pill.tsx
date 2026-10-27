/** Paper Atlas tone pill for message statuses (tones from messages.describeStatus). */
export function statusPill(tone: string): string {
  if (tone === "ok") return "bg-[#1a7f37]/10 text-[#145f2a]";
  if (tone === "bad") return "bg-[#b3402a]/10 text-[#7e2a1b]";
  if (tone === "warn") return "bg-[#e8c87a]/25 text-[#6b4a00]";
  return "bg-[#1c1917]/8 text-[#1c1917]/60";
}

export function StatusPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusPill(tone)}`}>
      {label}
    </span>
  );
}
