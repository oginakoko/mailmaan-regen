import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { describeStatus, getMessageDetail } from "@/lib/email/messages";
import { MessageSyncError, syncMessageFromUpstream } from "@/lib/email/status-sync";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pill";
import { PageSkeleton } from "@/components/ui/skeleton";

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
  await requireOwnedProject(projectId);
  const detail = await getMessageDetail(projectId, messageId);
  if (!detail) notFound();
  const described = describeStatus(detail.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/projects/${projectId}/messages`}
          className="text-sm font-medium text-[#1c1917]/55 underline underline-offset-4 hover:text-[#1c1917]"
        >
          ← Messages
        </Link>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-tight">{detail.subject}</h2>
        <p className="mt-1 truncate font-mono text-xs text-[#1c1917]/50">{detail.id}</p>
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}
      {query.synced ? (
        <Banner tone="success" title={`Sync: ${query.synced}.`}>
          {SYNC_NOTES[query.synced] ?? ""}
        </Banner>
      ) : null}

      <section className="rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Message evidence">
        <p>
          <StatusPill tone={described.tone} label={described.label} />
        </p>
        <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-[#1c1917]/55">To</dt>
          <dd className="font-mono text-xs">{detail.recipient_email}</dd>
          <dt className="text-[#1c1917]/55">From</dt>
          <dd className="font-mono text-xs">{detail.from_email}</dd>
          <dt className="text-[#1c1917]/55">Provider</dt>
          <dd className="font-mono text-xs">
            {detail.provider}
            {detail.provider_message_id ? ` · ${detail.provider_message_id}` : " · (never accepted)"}
          </dd>
          {detail.error_code ? (
            <>
              <dt className="text-[#1c1917]/55">Error</dt>
              <dd className="font-mono text-xs font-semibold text-[#7e2a1b]">
                {detail.error_code}
                {detail.error_message ? ` — ${detail.error_message}` : ""}
              </dd>
            </>
          ) : null}
          <dt className="text-[#1c1917]/55">Queued</dt>
          <dd className="text-xs">{detail.queued_at ? new Date(detail.queued_at).toLocaleString() : "—"}</dd>
          <dt className="text-[#1c1917]/55">Accepted</dt>
          <dd className="text-xs">{detail.accepted_at ? new Date(detail.accepted_at).toLocaleString() : "—"}</dd>
          <dt className="text-[#1c1917]/55">Delivered</dt>
          <dd className="text-xs">
            {detail.delivered_at ? new Date(detail.delivered_at).toLocaleString() : "Unconfirmed"}
          </dd>
          <dt className="text-[#1c1917]/55">Request ID</dt>
          <dd className="font-mono text-xs">{detail.request_id ?? "—"}</dd>
        </dl>
        {detail.provider_message_id ? (
          <form action={syncAction} className="mt-4 border-t border-[#1c1917]/10 pt-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="messageId" value={messageId} />
            <SubmitButton variant="secondary" pendingLabel="Asking the provider…">
              Sync from provider
            </SubmitButton>
          </form>
        ) : null}
      </section>

      <section aria-label="Timeline">
        <h3 className="text-sm font-semibold tracking-wider text-[#1c1917]/55 uppercase">Timeline</h3>
        {detail.timeline.length > 0 ? (
          <ol className="mt-3 space-y-2">
            {detail.timeline.map((event) => (
              <li
                key={event.id}
                className="rounded-xl border border-[#1c1917]/10 bg-white px-4 py-3 text-sm shadow-sm"
              >
                <p className="font-semibold">
                  {event.event_type}{" "}
                  <span className="font-normal text-[#1c1917]/55">· {event.source}</span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#1c1917]/55">
                  {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : "—"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[#1c1917]/55">No events recorded.</p>
        )}
      </section>
    </div>
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
    <Suspense fallback={<PageSkeleton titleWidth="w-56" cards={0} />}>
      <MessageDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
