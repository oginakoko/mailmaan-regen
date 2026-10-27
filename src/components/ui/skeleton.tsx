import type { ReactNode } from "react";

/** Pulse placeholder. Keep shapes close to the content they stand in for. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-[#1c1917]/10 ${className}`} />;
}

/** Shared loading shell: title + lines + cards, used by every loading.tsx. */
export function PageSkeleton({ titleWidth = "w-56", cards = 3 }: { titleWidth?: string; cards?: number }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className={`h-8 ${titleWidth}`} />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </main>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#1c1917]/10 bg-white p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}
