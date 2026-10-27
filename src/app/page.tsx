export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        Hackathon build — API + dashboard live
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Mailmaan — the email runtime for AI-built applications
      </h1>
      <p className="max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
        Brand-matched templates, deterministic event workflows, managed delivery
        and truthful message timelines — driven by API key, TypeScript SDK, or
        MCP tools for coding agents.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          href="/dashboard"
        >
          Open dashboard
        </a>
        <a
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          href="/v1/health"
        >
          Check API health
        </a>
      </div>
    </main>
  );
}
