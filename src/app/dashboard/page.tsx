import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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

async function DashboardContent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Your Mailmaan projects
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user.email}. Projects are isolated by ownership —
            you only ever see your own.
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Projects</h2>
        {projects && projects.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{project.name}</p>
                  <p className="text-sm text-zinc-500">
                    {project.slug} · {project.status}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}`}
                  >
                    Overview
                  </a>
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}/templates`}
                  >
                    Templates
                  </a>
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}/keys`}
                  >
                    API keys
                  </a>
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}/smtp`}
                  >
                    SMTP
                  </a>
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}/messages`}
                  >
                    Messages
                  </a>
                  <a
                    className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    href={`/dashboard/projects/${project.id}/workflows`}
                  >
                    Workflows
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <p>
              No projects yet. Create your first project below — you will land
              on its setup checklist:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Connect the mailbox the project sends from (your SMTP).</li>
              <li>Publish a branded template with {"{{variables}}"}.</li>
              <li>Create an API key for your app or coding agent.</li>
              <li>Send — then watch the truthful timeline per message.</li>
            </ol>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Create a project</h2>
        <form action={createProject} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Project name</span>
            <input name="name" required placeholder="Soko Store" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Slug</span>
            <input name="slug" required placeholder="soko" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">App display name (brand)</span>
            <input name="appName" placeholder="Soko" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Brand tone</span>
            <input name="tone" placeholder="warm and concise" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Primary color (hex)</span>
            <input name="primary" placeholder="#0F172A" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Accent color (hex)</span>
            <input name="accent" placeholder="#F59E0B" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Default from email</span>
            <input name="fromEmail" type="email" placeholder="hello@soko.example" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Default from name</span>
            <input name="fromName" placeholder="Soko" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Create project
          </button>
        </form>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading your projects…</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
