/** Wax-seal brand mark: seal-red disc, cream M, thin ring. Mirrors the favicon. */
export function SealMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" fill="#b3402a" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#7e2a1b" strokeWidth="2" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#f7f2e7" strokeWidth="1.5" opacity="0.7" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fill="#f7f2e7"
        fontSize="26"
        fontWeight="800"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        M
      </text>
    </svg>
  );
}
