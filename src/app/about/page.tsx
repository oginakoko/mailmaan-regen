import Link from "next/link";
import type { Metadata } from "next";
import { SealMark } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "About — the thinking behind Mailmaan",
  description:
    "Why Mailmaan exists: email infrastructure for AI-built software, by Philip Ogina.",
};

const PRINCIPLES = [
  {
    title: "Integration should be simple",
    body: "Clear instructions, predictable APIs and working examples — not vague docs and scattered manual setup.",
  },
  {
    title: "Reliability should be part of the product",
    body: "Retries, idempotency, provider errors and durable records. A successful API response is never confused with proof of receipt.",
  },
  {
    title: "AI should be useful, not decorative",
    body: "AI drafts templates and helps diagnose failures through real system state — it never fabricates sends or invents explanations.",
  },
  {
    title: "The developer remains in control",
    body: "Scoped permissions, secure credentials, human sign-off on consequential operations. No silent changes outside those bounds.",
  },
  {
    title: "One coherent system",
    body: "Templates, events, workflows, sending, history and diagnostics form one connected system — not tools to stitch together.",
  },
];

const LIVE_TODAY = [
  "TypeScript SDK and MCP tools for AI agents",
  "AI template drafting from one-line briefs",
  "Event-driven workflows with variable mapping",
  "Managed delivery through your own mailbox",
  "Truthful timelines with provider-sync diagnostics",
  "Dashboard, docs and the live Soko demo",
];

const ON_ROADMAP = [
  "Scheduled and recurring sends",
  "Additional delivery providers",
  "Team workspaces and roles",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#faf7f0] font-body text-[#1c1917]">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#1c1917]/15 pb-4">
          <Link href="/" className="font-display text-2xl tracking-tight">
            Mailmaan
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium" aria-label="Site">
            <Link href="/" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Home
            </Link>
            <Link href="/demo/soko" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Live demo
            </Link>
            <Link href="/docs" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Docs
            </Link>
            <Link href="/dashboard" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Dashboard
            </Link>
          </nav>
        </header>

        <main className="mx-auto mt-16 w-full max-w-2xl pb-24">
          <p className="text-xs font-semibold tracking-[0.25em] text-[#b3402a]">
            THE THINKING BEHIND MAILMAAN
          </p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] font-medium tracking-tight text-balance sm:text-6xl">
            Email should be infrastructure, not another project.
          </h1>

          <div className="mt-10 space-y-6 text-lg leading-8 text-[#1c1917]/85">
            <p className="text-xl leading-9 text-[#1c1917]">
              I&rsquo;m Philip Ogina, a software builder interested in making the
              infrastructure behind applications simpler to build with, easier to
              operate and more reliable.
            </p>
            <p>
              As AI changes how software gets made, I believe the next challenge
              is not just generating more code. It is making sure the systems
              that code depends on actually work together.
            </p>
            <p>
              Email is a good example. A welcome message, a password reset or a
              payment receipt sounds simple. But connecting templates,
              application events, delivery providers, background jobs, retries
              and delivery tracking can turn a small feature into a collection
              of separate engineering tasks.
            </p>
            <p>Mailmaan is my attempt to rethink that experience.</p>
          </div>

          <blockquote className="my-14 border-l-2 border-[#b3402a] pl-6 sm:pl-8">
            <p className="font-display text-2xl leading-snug font-medium text-balance sm:text-3xl">
              What if an application could have an email infrastructure layer
              that an AI coding agent could discover, connect to, configure and
              operate as naturally as it works with a database or an API?
            </p>
            <cite className="mt-3 block text-sm font-semibold tracking-wide text-[#1c1917]/55 not-italic uppercase">
              The original idea
            </cite>
          </blockquote>

          <h2 className="font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Built for the way software is being built now.
          </h2>
          <div className="mt-6 space-y-6 text-lg leading-8 text-[#1c1917]/85">
            <p>
              AI coding agents can already help create substantial parts of an
              application. But when an application needs to send email reliably,
              the agent still needs infrastructure it can integrate with and
              operate through clear, dependable interfaces.
            </p>
            <p>Mailmaan is being designed to provide that layer.</p>
            <p>
              Instead of treating email as a collection of one-off integrations,
              Mailmaan brings together programmatic access, templates,
              event-driven workflows, managed delivery and message
              observability. The ambition is to let an AI agent help implement
              the integration while Mailmaan provides the underlying system
              responsible for executing and tracking it.
            </p>
          </div>

          <h2 className="mt-16 font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Not another AI wrapper. An actual engine.
          </h2>
          <div className="mt-6 space-y-6 text-lg leading-8 text-[#1c1917]/85">
            <p>AI-generated code is useful, but it is not the infrastructure itself.</p>
            <p>
              Mailmaan is being built around real application services, persisted
              message records, background processing and delivery-provider
              events. AI should help developers create and operate workflows;
              the system must remain responsible for enforcing permissions,
              executing jobs and reporting what actually happened.
            </p>
            <p>
              The goal is straightforward: an integration that is easy to create
              and a system that can be trusted to explain its own behavior.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-[#1c1917]/10 bg-white p-6 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.2em] text-[#1c1917]/55 uppercase">
              What Mailmaan is not
            </p>
            <ul className="mt-4 space-y-3 text-[17px] leading-7">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-[#b3402a]">×</span>
                A marketing platform with an AI chatbot bolted on.
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-[#b3402a]">×</span>
                An HTML email generator, an SMTP wrapper, or a pile of snippets.
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-[#1a7f37]">✓</span>
                Agent-native email infrastructure — APIs, SDKs and tools first,
                with the dashboard as the control surface.
              </li>
            </ul>
          </div>

          <h2 className="mt-16 font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            The principles behind it.
          </h2>
          <ol className="mt-6 divide-y divide-[#1c1917]/10 border-y border-[#1c1917]/10">
            {PRINCIPLES.map((principle, i) => (
              <li key={principle.title} className="flex gap-5 py-5">
                <span aria-hidden="true" className="font-display text-xl text-[#b3402a]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-lg font-semibold">{principle.title}</p>
                  <p className="mt-1 leading-7 text-[#1c1917]/70">{principle.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="mt-16 font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Where this goes next.
          </h2>
          <div className="mt-6 space-y-6 text-lg leading-8 text-[#1c1917]/85">
            <p>
              I want Mailmaan to make email as approachable to AI-built
              applications as the other infrastructure services they already
              depend on.
            </p>
            <p>
              A developer should be able to connect it to an application,
              describe the event that needs to trigger an email, and work with
              an agent to configure the integration. From there, Mailmaan
              should handle the execution and give the developer a clear view
              of every message&rsquo;s progress.
            </p>
            <p>
              That is the direction I&rsquo;m building towards: not simply
              helping people write email code, but making email infrastructure
              easier to integrate, operate and understand.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#1c1917] p-6 text-[#f7f2e7]">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#e8c87a] uppercase">
                Working today
              </p>
              <ul className="mt-4 space-y-2.5 text-[15px] leading-6">
                {LIVE_TODAY.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="text-[#e8c87a]">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#1c1917]/15 bg-white p-6">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#1c1917]/55 uppercase">
                On the roadmap
              </p>
              <ul className="mt-4 space-y-2.5 text-[15px] leading-6 text-[#1c1917]/75">
                {ON_ROADMAP.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="text-[#b3402a]">→</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-[#1c1917]/55">
                Direction, not promises — the list above is what the current
                release actually does.
              </p>
            </div>
          </div>

          <div className="mt-20 text-center">
            <p className="font-display text-3xl leading-tight font-medium text-balance sm:text-4xl">
              Build the application. Let Mailmaan handle the email infrastructure.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/demo/soko"
                className="inline-flex min-h-[44px] items-center rounded-full bg-[#e8c87a] px-6 text-sm font-semibold text-[#1c1917] transition-colors hover:bg-[#f2d894] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
              >
                Fly the live demo
              </Link>
              <Link
                href="/docs"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[#1c1917]/25 px-6 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
              >
                Read the docs
              </Link>
            </div>
            <p className="mt-10 flex items-center justify-center gap-2.5 text-[#1c1917]/70">
              <SealMark className="h-6 w-6" />
              <span className="font-display text-lg italic">— Philip Ogina</span>
            </p>
          </div>
        </main>

        <footer className="flex flex-col gap-3 border-t border-[#1c1917]/15 pt-6 pb-4 text-sm text-[#1c1917]/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg text-[#1c1917]">Mailmaan</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 font-medium" aria-label="Footer">
            <Link href="/" className="hover:text-[#1c1917]">Home</Link>
            <Link href="/demo/soko" className="hover:text-[#1c1917]">Live demo</Link>
            <Link href="/docs" className="hover:text-[#1c1917]">Docs</Link>
            <Link href="/dashboard" className="hover:text-[#1c1917]">Dashboard</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
