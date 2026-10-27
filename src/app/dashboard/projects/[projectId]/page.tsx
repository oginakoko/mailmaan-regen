import Link from "next/link";
import { Suspense } from "react";
import { getProjectStats, requireOwnedProject } from "@/lib/dashboard/projects";
import { getSmtpConfigSummary } from "@/lib/smtp/service";
import { TemplateService } from "@/lib/templates/service";
import { CopyButton } from "@/components/ui/copy";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";

type Step = {
  n: number;
  title: string;
  why: string;
  done: boolean;
  status: string;
  href: string;
  cta: string;
};

function StepCard({ step }: { step: Step }) {
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            step.done ? "bg-[#1a7f37] text-white" : "border border-[#1c1917]/25 text-[#1c1917]/55"
          }`}
        >
          {step.done ? "✓" : step.n}
        </span>
        <div>
          <p className="font-semibold">
            <span className="sr-only">{step.done ? "Done: " : `Step ${step.n}: `}</span>
            {step.title}
          </p>
          <p className="mt-0.5 max-w-xl text-sm leading-6 text-[#1c1917]/65">{step.why}</p>
          <p className={`mt-1.5 text-sm font-medium ${step.done ? "text-[#145f2a]" : "text-[#9a6a00]"}`}>
            {step.status}
          </p>
        </div>
      </div>
      <Link
        href={step.href}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#1c1917]/25 px-5 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
      >
        {step.cta}
      </Link>
    </li>
  );
}

const CURL_SNIPPET = `curl -X POST https://mailmaan-regen.vercel.app/v1/emails \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: first-send-1" \\
  -d '{"to":"you@example.com","template":"$TEMPLATE",
       "variables":{"name":"Ada"}}'`;

async function OverviewContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireOwnedProject(projectId);

  const [stats, smtp, templates] = await Promise.all([
    getProjectStats(projectId),
    getSmtpConfigSummary(projectId),
    new TemplateService().listPublished(projectId),
  ]);

  const steps: Step[] = [
    {
      n: 1,
      title: "Connect your sending mailbox",
      why: "Every project sends from its own SMTP mailbox — never from a shared account. Sends are blocked until this is set.",
      done: stats.smtpConnected,
      status: smtp
        ? `Connected: ${smtp.host} as ${smtp.user_masked}.`
        : "Not connected — nothing can send yet.",
      href: `/dashboard/projects/${projectId}/smtp`,
      cta: stats.smtpConnected ? "Manage mailbox" : "Add mailbox",
    },
    {
      n: 2,
      title: "Publish a template",
      why: "Templates are your branded emails with {{variables}} your app fills in per send.",
      done: stats.templatesPublished > 0,
      status:
        stats.templatesPublished > 0
          ? `${stats.templatesPublished} published: ${templates.map((t) => t.slug).join(", ")}.`
          : "No published templates yet.",
      href: `/dashboard/projects/${projectId}/templates`,
      cta: stats.templatesPublished > 0 ? "Manage templates" : "Create template",
    },
    {
      n: 3,
      title: "Create an API key",
      why: "Your app (or coding agent) authenticates with this key to send events and emails.",
      done: stats.keysActive > 0,
      status:
        stats.keysActive > 0
          ? `${stats.keysActive} active key${stats.keysActive === 1 ? "" : "s"}.`
          : "No active API keys — revoked keys don't count.",
      href: `/dashboard/projects/${projectId}/keys`,
      cta: stats.keysActive > 0 ? "Manage keys" : "Create key",
    },
    {
      n: 4,
      title: "Send your first email",
      why: "Fire an event or send directly. Mailmaan renders the template and delivers through your mailbox.",
      done: stats.messagesTotal > 0,
      status:
        stats.messagesTotal > 0
          ? `${stats.messagesTotal} message${stats.messagesTotal === 1 ? "" : "s"} recorded — open Messages for timelines.`
          : "No sends yet — see the example below.",
      href: `/dashboard/projects/${projectId}/messages`,
      cta: "View messages",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Project stats">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Messages" value={stats.messagesTotal} sub={stats.lastSentAt ? `last ${new Date(stats.lastSentAt).toLocaleDateString()}` : "no sends yet"} />
          <Stat
            label="Needs attention"
            value={<span className={stats.attention > 0 ? "text-[#b3402a]" : undefined}>{stats.attention}</span>}
            sub="failed · bounced · delayed"
          />
          <Stat label="Templates live" value={stats.templatesPublished} sub="published versions" />
          <Stat label="Workflows on" value={stats.workflowsEnabled} sub="enabled triggers" />
        </div>
      </section>

      <section aria-label="Setup checklist">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-medium tracking-tight">Setup checklist</h2>
          <p className="text-sm text-[#1c1917]/60">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <ol className="space-y-3">
          {steps.map((step) => (
            <StepCard key={step.n} step={step} />
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Send from your app">
        <h2 className="font-display text-xl font-medium tracking-tight">Send from your app</h2>
        <p className="mt-1 text-sm leading-6 text-[#1c1917]/65">
          Replace <code className="rounded bg-[#1c1917]/8 px-1 py-0.5 font-mono text-[0.85em]">$KEY</code> with an API key from step 3 and{" "}
          <code className="rounded bg-[#1c1917]/8 px-1 py-0.5 font-mono text-[0.85em]">$TEMPLATE</code> with a published slug from step 2:
        </p>
        <div className="relative mt-3">
          <pre className="overflow-x-auto rounded-xl bg-[#1c1917] p-4 pr-24 font-mono text-xs leading-6 text-[#f7f2e7]">
            {CURL_SNIPPET}
          </pre>
          <div className="absolute top-3 right-3">
            <CopyButton text={CURL_SNIPPET} />
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#1c1917]/65">
          New here? Read the{" "}
          <Link href="/docs/developer-guide" className="font-semibold underline underline-offset-4">
            developer guide
          </Link>{" "}
          (5-minute setup, event design rules, agent path). Prefer events? Post{" "}
          <code className="rounded bg-[#1c1917]/8 px-1 py-0.5 font-mono text-[0.85em]">{"{name, data}"}</code> to{" "}
          <code className="rounded bg-[#1c1917]/8 px-1 py-0.5 font-mono text-[0.85em]">/v1/events</code> and let a{" "}
          <Link href={`/dashboard/projects/${projectId}/workflows`} className="font-semibold underline underline-offset-4">
            workflow
          </Link>{" "}
          decide what to send.
        </p>
      </section>
    </div>
  );
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={4} />}>
      <OverviewContent params={params} />
    </Suspense>
  );
}
