import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectStats, type ProjectStats } from "@/lib/dashboard/projects";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

async function createProject(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const appName = String(formData.get("appName") ?? "").trim();
  const tone = String(formData.get("tone") ?? "").trim();
  const primary = String(formData.get("primary") ?? "").trim();
  const accent = String(formData.get("accent") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim();

  if (!name || !slug) redirect("/dashboard?error=Project%20name%20and%20slug%20are%20required.");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: created, error } = await supabase.from("projects").insert({
    owner_user_id: user.id,
    name,
    slug,
    brand_config: {
      app_name: appName || name,
      description: "",
      tone,
      colors: { primary, accent, background: "#ffffff" },
      logo_url: null,
    },
    default_from_email: fromEmail || null,
    default_from_name: fromName || null,
  }).select("id").single();
  if (error || !created) {
    redirect(`/dashboard?error=${encodeURIComponent(error?.message ?? "Could not create the project.")}`);
  }
  redirect(`/dashboard/projects/${created.id}`);
}

function NewProjectForm() {
  return (
    <form action={createProject} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Project name" name="name" required placeholder="Soko Store" autoComplete="off" />
        <TextField
          label="Slug"
          name="slug"
          required
          placeholder="soko"
          autoComplete="off"
          hint="Lowercase letters, numbers, dashes. Used in URLs."
        />
      </div>
      <details className="rounded-xl border border-[#1c1917]/10 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Brand profile <span className="font-normal text-[#1c1917]/55">(optional — the AI uses this for templates)</span>
        </summary>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <TextField label="App display name" name="appName" placeholder="Soko" autoComplete="off" />
          <TextField label="Brand tone" name="tone" placeholder="warm and concise" autoComplete="off" />
          <TextField label="Primary color" name="primary" placeholder="#0F172A" autoComplete="off" mono />
          <TextField label="Accent color" name="accent" placeholder="#F59E0B" autoComplete="off" mono />
        </div>
      </details>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Default from email" name="fromEmail" type="email" placeholder="hello@soko.example" autoComplete="off" />
        <TextField label="Default from name" name="fromName" placeholder="Soko" autoComplete="off" />
      </div>
      <SubmitButton pendingLabel="Creating project…" className="w-full sm:w-auto">
        Create project
      </SubmitButton>
    </form>
  );
}

function NewProjectDialog() {
  return (
    <Dialog
      trigger="+ New project"
      title="New project"
      description="A project is one app: its own mailbox, templates, workflows and API keys."
      wide
    >
      <NewProjectForm />
    </Dialog>
  );
}

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
};

function SetupProgress({ stats }: { stats: ProjectStats }) {
  const steps = [
    stats.smtpConnected,
    stats.templatesPublished > 0,
    stats.keysActive > 0,
    stats.messagesTotal > 0,
  ];
  const done = steps.filter(Boolean).length;
  return (
    <div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[#1c1917]/10"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-label={`${done} of 4 setup steps done`}
      >
        <div className="h-full rounded-full bg-[#1a7f37] transition-all" style={{ width: `${(done / 4) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-[#1c1917]/55">
        {done === 4 ? "Sending — all systems live." : `${done} of 4 setup steps done.`}
      </p>
    </div>
  );
}

function ProjectCard({ project, stats }: { project: ProjectRow; stats: ProjectStats }) {
  return (
    <article className="flex flex-col rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-medium tracking-tight">
            <Link href={`/dashboard/projects/${project.id}`} className="hover:underline hover:underline-offset-4">
              {project.name}
            </Link>
          </h2>
          <p className="mt-0.5 truncate font-mono text-xs text-[#1c1917]/55">{project.slug}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            project.status === "active"
              ? "bg-[#1a7f37]/10 text-[#145f2a]"
              : "bg-[#1c1917]/8 text-[#1c1917]/60"
          }`}
        >
          {project.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[#faf7f0] px-2 py-2.5">
          <dt className="text-[11px] font-semibold tracking-wide text-[#1c1917]/55 uppercase">Sent</dt>
          <dd className="font-display text-xl font-medium">{stats.messagesTotal}</dd>
        </div>
        <div className="rounded-lg bg-[#faf7f0] px-2 py-2.5">
          <dt className="text-[11px] font-semibold tracking-wide text-[#1c1917]/55 uppercase">Attention</dt>
          <dd className={`font-display text-xl font-medium ${stats.attention > 0 ? "text-[#b3402a]" : ""}`}>
            {stats.attention}
          </dd>
        </div>
        <div className="rounded-lg bg-[#faf7f0] px-2 py-2.5">
          <dt className="text-[11px] font-semibold tracking-wide text-[#1c1917]/55 uppercase">In flight</dt>
          <dd className="font-display text-xl font-medium">{stats.inFlight}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-5 text-[#1c1917]/60">
        {stats.templatesPublished} published template{stats.templatesPublished === 1 ? "" : "s"} ·{" "}
        {stats.workflowsEnabled} enabled workflow{stats.workflowsEnabled === 1 ? "" : "s"} ·{" "}
        {stats.keysActive} active key{stats.keysActive === 1 ? "" : "s"} ·{" "}
        mailbox {stats.smtpConnected ? "connected" : "not set"}
        {stats.lastSentAt ? ` · last send ${new Date(stats.lastSentAt).toLocaleDateString()}` : " · no sends yet"}
      </p>

      <div className="mt-4">
        <SetupProgress stats={stats} />
      </div>

      <div className="mt-4 flex gap-2 border-t border-[#1c1917]/10 pt-4">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full bg-[#1c1917] px-4 text-sm font-semibold text-[#f7f2e7] transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
        >
          Open
        </Link>
        <Link
          href={`/dashboard/projects/${project.id}/messages`}
          className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full border border-[#1c1917]/20 px-4 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
        >
          Messages
        </Link>
      </div>
    </article>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });

  const rows: ProjectRow[] = projects ?? [];
  const stats = await Promise.all(rows.map((row) => getProjectStats(row.id)));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[#1c1917]/50 uppercase">
            Signed in as {user.email}
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">Projects</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
            One project per app — each with its own mailbox, templates and keys.
            You only ever see your own.
          </p>
        </div>
        <NewProjectDialog />
      </header>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}

      {rows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((project, i) => (
            <ProjectCard key={project.id} project={project} stats={stats[i] ?? {
              messagesTotal: 0, ok: 0, attention: 0, inFlight: 0, lastSentAt: null,
              templatesPublished: 0, workflowsEnabled: 0, keysActive: 0, smtpConnected: false,
            }} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No projects yet"
          body={
            <>
              <p>Create your first project — you will land on its setup checklist:</p>
              <ol className="mx-auto mt-3 max-w-sm list-decimal space-y-1 pl-5 text-left">
                <li>Connect the mailbox the project sends from (your SMTP).</li>
                <li>Publish a branded template with {"{{variables}}"}.</li>
                <li>Create an API key for your app or coding agent.</li>
                <li>Send — then watch the truthful timeline per message.</li>
              </ol>
            </>
          }
          action={<NewProjectDialog />}
        />
      )}
    </main>
  );
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-48" cards={2} />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
