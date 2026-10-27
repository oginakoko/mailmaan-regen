import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { listApiKeys } from "@/lib/api-keys/service";
import { getSmtpConfigSummary } from "@/lib/smtp/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService } from "@/lib/templates/service";

async function requireOwnedProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owner-scoped RLS does the isolation work here (Day 2 policies).
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  return project;
}

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
    <li className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            step.done
              ? "bg-green-600 text-white"
              : "border border-zinc-300 text-zinc-500 dark:border-zinc-700"
          }`}
        >
          {step.done ? "✓" : step.n}
        </span>
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {step.n}. {step.title}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{step.why}</p>
          <p className={`mt-1 text-sm ${step.done ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
            {step.status}
          </p>
        </div>
      </div>
      <a
        href={step.href}
        className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {step.cta}
      </a>
    </li>
  );
}

async function OverviewContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireOwnedProject(projectId);
  const supabase = await createSupabaseServerClient();

  const [smtp, templates, keys, messages, workflows] = await Promise.all([
    getSmtpConfigSummary(projectId),
    new TemplateService().listPublished(projectId),
    listApiKeys(projectId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("workflows").select("id").eq("project_id", projectId).eq("enabled", true),
  ]);
  const activeKeys = keys.filter((key) => !key.revoked_at);
  const messageCount = messages.count ?? 0;
  const workflowCount = workflows.data?.length ?? 0;

  const steps: Step[] = [
    {
      n: 1,
      title: "Connect your sending mailbox",
      why: "Every project sends from its own SMTP mailbox — never from a shared account. Sends are blocked until this is set.",
      done: Boolean(smtp),
      status: smtp
        ? `Connected: ${smtp.host} as ${smtp.user_masked}.`
        : "Not connected — nothing can send yet.",
      href: `/dashboard/projects/${projectId}/smtp`,
      cta: smtp ? "Manage mailbox" : "Add mailbox",
    },
    {
      n: 2,
      title: "Publish a template",
      why: "Templates are your branded emails with {{variables}} your app fills in per send.",
      done: templates.length > 0,
      status:
        templates.length > 0
          ? `${templates.length} published: ${templates.map((t) => t.slug).join(", ")}.`
          : "No published templates yet.",
      href: `/dashboard/projects/${projectId}/templates`,
      cta: templates.length > 0 ? "Manage templates" : "Create template",
    },
    {
      n: 3,
      title: "Create an API key",
      why: "Your app (or coding agent) authenticates with this key to send events and emails.",
      done: activeKeys.length > 0,
      status:
        activeKeys.length > 0
          ? `${activeKeys.length} active key${activeKeys.length === 1 ? "" : "s"}.`
          : "No API keys yet.",
      href: `/dashboard/projects/${projectId}/keys`,
      cta: activeKeys.length > 0 ? "Manage keys" : "Create key",
    },
    {
      n: 4,
      title: "Send your first email",
      why: "Fire an event or send directly. Mailmaan renders the template and delivers through your mailbox.",
      done: messageCount > 0,
      status:
        messageCount > 0
          ? `${messageCount} message${messageCount === 1 ? "" : "s"} recorded — open Messages for timelines.`
          : "No sends yet — see the example below.",
      href: `/dashboard/projects/${projectId}/messages`,
      cta: "View messages",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a href="/dashboard" className="text-sm text-zinc-500 underline underline-offset-4">
          ← All projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {project.name} — setup
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          How Mailmaan works: your app fires an event → a workflow renders a
          template → Mailmaan delivers it through <em>your</em> mailbox → every
          send keeps a truthful timeline. {doneCount} of {steps.length} steps done.
        </p>
      </header>

      <section>
        <ol className="space-y-3">
          {steps.map((step) => (
            <StepCard key={step.n} step={step} />
          ))}
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Send from your app
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Replace <code>$KEY</code> with an API key from step 3 and{" "}
          <code>$TEMPLATE</code> with a published slug from step 2:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
{`curl -X POST https://mailmaan-regen.vercel.app/v1/emails \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: first-send-1" \\
  -d '{"to":"you@example.com","template":"$TEMPLATE",
       "variables":{"name":"Ada"}}'`}
        </pre>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Prefer events? Post <code>{"{name, data}"}</code> to{" "}
          <code>/v1/events</code> and let a workflow decide what to send —{" "}
          <a
            href={`/dashboard/projects/${projectId}/workflows`}
            className="underline underline-offset-4"
          >
            {workflowCount} enabled workflow{workflowCount === 1 ? "" : "s"}
          </a>
          .
        </p>
      </section>

      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
        <a href={`/dashboard/projects/${projectId}/smtp`} className="underline underline-offset-4">SMTP</a>
        <a href={`/dashboard/projects/${projectId}/templates`} className="underline underline-offset-4">Templates</a>
        <a href={`/dashboard/projects/${projectId}/keys`} className="underline underline-offset-4">API keys</a>
        <a href={`/dashboard/projects/${projectId}/messages`} className="underline underline-offset-4">Messages</a>
        <a href={`/dashboard/projects/${projectId}/workflows`} className="underline underline-offset-4">Workflows</a>
      </nav>
    </main>
  );
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading project…</p>
        </main>
      }
    >
      <OverviewContent params={params} />
    </Suspense>
  );
}
