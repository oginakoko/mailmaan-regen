import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs — Mailmaan",
  description: "Developer guide, Soko demo build notes, and API reference.",
};

const CARDS = [
  {
    href: "/docs/developer-guide",
    title: "Developer guide",
    body: "Connect your app in five minutes: the mental model, dashboard setup, event design rules, the agent/MCP path, limits and errors.",
  },
  {
    href: "/docs/soko-demo",
    title: "Soko demo build",
    body: "The live storefront as example implementation: cron-free stage advancement, idempotent events, per-order quotes, the AI finale.",
  },
  {
    href: "/docs/api",
    title: "API reference",
    body: "Every endpoint with method, scope, request shape and status codes. Base URL, auth, idempotency, rate limits.",
  },
];

export default function DocsIndexPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Docs</h1>
      <p className="mt-3 max-w-xl leading-8 text-[#1c1917]/70">
        Everything a developer — human or agent — needs to send honest email
        through Mailmaan.
      </p>
      <div className="mt-8 space-y-4">
        {CARDS.map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="block rounded-lg border border-[#1c1917]/15 bg-white p-6 transition-colors hover:border-[#1a7f37]/50"
          >
            <span className="font-display text-2xl font-medium">{card.title}</span>
            <span className="mt-2 block leading-7 text-[#1c1917]/70">{card.body}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
