import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteSmtpConfig,
  getSmtpConfigSummary,
  SmtpConfigError,
  upsertSmtpConfig,
} from "@/lib/smtp/service";

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

async function saveSmtpAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  try {
    await upsertSmtpConfig(projectId, {
      host: String(formData.get("host") ?? ""),
      port: String(formData.get("port") ?? ""),
      secure: formData.get("secure") === "on",
      user: String(formData.get("user") ?? ""),
      pass: String(formData.get("pass") ?? ""),
      from_email: String(formData.get("from_email") ?? ""),
      from_name: String(formData.get("from_name") ?? ""),
    });
  } catch (error) {
    const message =
      error instanceof SmtpConfigError ? error.message : "Could not save the SMTP mailbox.";
    redirect(`/dashboard/projects/${projectId}/smtp?error=${encodeURIComponent(message)}`);
  }
  redirect(`/dashboard/projects/${projectId}/smtp?saved=1`);
}

async function deleteSmtpAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  await deleteSmtpConfig(projectId);
  redirect(`/dashboard/projects/${projectId}/smtp?deleted=1`);
}

async function SmtpContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const config = await getSmtpConfigSummary(projectId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a href="/dashboard" className="text-sm text-zinc-500 underline underline-offset-4">
          ← All projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          SMTP mailbox — {project.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every project sends from its own mailbox — never from a shared
          account. The password is encrypted at rest and is never shown back;
          leave it blank to keep the stored one. Common presets: Gmail
          (smtp.gmail.com:587, app password), Outlook (smtp.office365.com:587),
          or port 465 with SSL enabled.
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}
      {query.saved ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Mailbox saved. New sends from this project will use it.
        </p>
      ) : null}
      {query.deleted ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Mailbox removed. Sends are blocked until you add one again.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Current mailbox
        </h2>
        {config ? (
          <div className="space-y-1 rounded-xl border border-zinc-200 px-4 py-4 text-sm dark:border-zinc-800">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {config.host}:{config.port} {config.secure ? "(SSL)" : "(STARTTLS)"}
            </p>
            <p className="font-mono text-xs text-zinc-500">
              user: {config.user_masked} · from: {config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email}
            </p>
            <p className="text-xs text-zinc-500">
              password: •••••••• (encrypted, never displayed) · updated{" "}
              {new Date(config.updated_at).toLocaleString()}
            </p>
            <form action={deleteSmtpAction} className="pt-2">
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              >
                Remove mailbox
              </button>
            </form>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No mailbox configured — sends for this project are blocked until you
            save one below.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {config ? "Replace mailbox" : "Add mailbox"}
        </h2>
        <form action={saveSmtpAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">SMTP host</span>
            <input
              name="host"
              required
              placeholder="smtp.gmail.com"
              defaultValue={config?.host ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Port</span>
            <input
              name="port"
              required
              inputMode="numeric"
              placeholder="587"
              defaultValue={config?.port ?? 587}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="secure"
              defaultChecked={config?.secure ?? false}
              className="h-4 w-4"
            />
            <span>Use implicit SSL (port 465). Leave off for STARTTLS (port 587).</span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">SMTP username</span>
            <input
              name="user"
              required
              autoComplete="username"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">
              SMTP password{config ? " (blank keeps stored)" : ""}
            </span>
            <input
              name="pass"
              type="password"
              required={!config}
              autoComplete="new-password"
              placeholder={config ? "••••••••" : "app password"}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">From email</span>
            <input
              name="from_email"
              type="email"
              required
              placeholder="hello@example.com"
              defaultValue={config?.from_email ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">From name (optional)</span>
            <input
              name="from_name"
              placeholder="Example"
              defaultValue={config?.from_name ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Save mailbox
          </button>
        </form>
      </section>
    </main>
  );
}

export default function SmtpPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading mailbox…</p>
        </main>
      }
    >
      <SmtpContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
