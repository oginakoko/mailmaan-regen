import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createApiKey, listApiKeys, revokeApiKey, API_KEY_SCOPES } from "@/lib/api-keys/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function createKeyAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const scopes = API_KEY_SCOPES.filter((scope) => formData.get(`scope_${scope}`) === "on");
  if (scopes.length === 0) {
    redirect(`/dashboard/projects/${projectId}/keys?error=Select%20at%20least%20one%20scope.`);
  }
  const { rawKey } = await createApiKey({ projectId, name, scopes: [...scopes] });
  // One-time reveal: the raw key travels exactly once, in this redirect.
  redirect(`/dashboard/projects/${projectId}/keys?created=${encodeURIComponent(rawKey)}`);
}

async function revokeKeyAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const keyId = String(formData.get("keyId") ?? "");
  await requireOwnedProject(projectId);
  await revokeApiKey({ projectId, keyId });
  redirect(`/dashboard/projects/${projectId}/keys`);
}

async function ProjectKeysContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const keys = await listApiKeys(projectId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <p className="text-sm text-zinc-500">
          <a href="/dashboard" className="underline underline-offset-4">
            ← All projects
          </a>{" "}
          ·{" "}
          <a href={`/dashboard/projects/${projectId}`} className="underline underline-offset-4">
            Project overview
          </a>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          API keys — {project.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Keys are shown once at creation and stored only as hashes. The raw
          key can never be recovered — revoke and recreate if you lose it.
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}

      {query.created ? (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Copy your new API key now — it will not be shown again.
          </p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">{query.created}</code>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Existing keys</h2>
        {keys.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{key.name ?? "Untitled key"}</p>
                  <p className="font-mono text-xs text-zinc-500">
                    {key.prefix}… · scopes: {key.scopes.join(", ") || "none"}
                    {key.revoked_at ? " · revoked" : ""}
                    {key.last_used_at ? ` · last used ${new Date(key.last_used_at).toLocaleString()}` : " · never used"}
                  </p>
                </div>
                {!key.revoked_at ? (
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="keyId" value={key.id} />
                    <button type="submit" className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
                      Revoke
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No API keys yet. Create one below to call the Mailmaan API.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Create a key</h2>
        <form action={createKeyAction} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Name (optional)</span>
            <input name="name" placeholder="production-server" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Scopes</legend>
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <input type="checkbox" name={`scope_${scope}`} defaultChecked={scope === "read"} className="h-4 w-4" />
                <span>
                  <code className="font-mono">{scope}</code>
                  {scope === "read" ? " — read project/templates/messages" : scope === "send" ? " — send email (implies read)" : " — ingest app events (implies read)"}
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Create key
          </button>
        </form>
      </section>
    </main>
  );
}

export default function ProjectKeysPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading API keys…</p>
        </main>
      }
    >
      <ProjectKeysContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
