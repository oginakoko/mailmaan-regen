"use client";

import { useState } from "react";

/** Copy-to-clipboard with visible confirmation and a legacy fallback. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const area = document.createElement("textarea");
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand("copy");
          area.remove();
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      aria-live="polite"
      className="inline-flex min-h-[36px] shrink-0 cursor-pointer items-center rounded-full border border-[#1c1917]/25 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#1c1917] transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
