import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeStatus, getMessageDetail } from "@/lib/email/messages";
import { MessageSyncError, syncMessageFromUpstream } from "@/lib/email/status-sync";

async function requireOwnedProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  return project;
}

async function syncAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  await requireOwnedProject(projectId);
  try {
    const result = await syncMessageFromUpstream(projectId, messageId);
    redirect(
      `/dashboard/projects/${projectId}/messages/${messageId}?synced=${encodeURIComponent(result.outcome)}`,
    );
  } catch (error) {
    const message =
      error instanceof MessageSyncError ? error.message : "Could not sync from the provider.";
    redirect(
      `/dashboard/projects/${projectId}/messages/${messageId}?error=${encodeURIComponent(message)}`,
    );
  }
}

function toneClass(tone: string): string {
  if (tone === "ok") return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
  if (tone === "bad") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  if (tone === "warn")
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

const SYNC_NOTES: Record<string, string> = {
  updated: "Provider state applied to the timeline.",
  confirmed: "Provider agrees with the stored state — nothing changed.",
  duplicate: "This provider state was already recorded.",
  ignored: "Provider state needs no action.",
  unknown: "The provider has no record of this message (pre-recording send).",
};

async function MessageDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; messageId: string }>;
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const { projectId, messageId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const detail = await getMessageDetail(projectId, messageId);
  if (!detail) notFound();
  const described = describeStatus(detail.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a
          href={`/dashboard/projects/${projectId}/messages`}
          className="text-sm text-zinc-500 underline underline-offset-4"
        >
          ← Messages
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {detail.subject}
        </h1>
        <p className="font-mono text-xs text-zinc-500">
          {detail.id} · {project.name}
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}
      {query.synced ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Sync: {query.synced}. {SYNC_NOTES[query.synced] ?? ""}
        </p>
      ) : null}

      <section className="space-y-2 rounded-xl border border-zinc-200 px-4 py-4 text-sm dark:border-zinc-800">
        <p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${toneClass(described.tone)}`}
          >
            {described.label}
          </span>
        </p>
        <dl className="grid gap-1 pt-2 sm:grid-cols-[140px_1fr]">
          <dt className="text-zinc-500">To</dt>
          <dd className="font-mono text-xs">{detail.recipient_email}</dd>
          <dt className="text-zinc-500">From</dt>
          <dd className="font-mono text-xs">{detail.from_email}</dd>
          <dt className="text-zinc-500">Provider</dt>
          <dd className="font-mono text-xs">
            {detail.provider}
            {detail.provider_message_id ? ` · ${detail.provider_message_id}` : " · (never accepted)"}
          </dd>
          {detail.error_code ? (
            <>
              <dt className="text-zinc-500">Error</dt>
              <dd className="font-mono text-xs text-red-700 dark:text-red-300">
                {detail.error_code}
                {detail.error_message ? ` — ${detail.error_message}` : ""}
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-500">Queued</dt>
          <dd className="text-xs">{detail.queued_at ? new Date(detail.queued_at).toLocaleString() : "—"}</dd>
          <dt className="text-zinc-500">Accepted</dt>
          <dd className="text-xs">{detail.accepted_at ? new Date(detail.accepted_at).toLocaleString() : "—"}</dd>
          <dt className="text-zinc-500">Delivered</dt>
          <dd className="text-xs">
            {detail.delivered_at ? new Date(detail.delivered_at).toLocaleString() : "Unconfirmed"}
          </dd>
          <dt className="text-zinc-500">Request ID</dt>
          <dd className="font-mono text-xs">{detail.request_id ?? "—"}</dd>
        </dl>
        {detail.provider_message_id ? (
          <form action={syncAction} className="pt-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="messageId" value={messageId} />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Sync from provider
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Timeline</h2>
        {detail.timeline.length > 0 ? (
          <ol className="space-y-2">
            {detail.timeline.map((event) => (
              <li
                key={event.id}
                className="rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {event.event_type}{" "}
                  <span className="font-normal text-zinc-500">· {event.source}</span>
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : "—"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">No events recorded.</p>
        )}
      </section>
    </main>
  );
}

export default function MessageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; messageId: string }>;
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading message…</p>
        </main>
      }
    >
      <MessageDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
