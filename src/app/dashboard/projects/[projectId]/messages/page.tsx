import { Suspense } from "react";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { describeStatus, listMessages } from "@/lib/email/messages";
import { EmptyState } from "@/components/ui/empty";
import { StatusPill } from "@/components/ui/pill";
import { PageSkeleton } from "@/components/ui/skeleton";

async function MessagesContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireOwnedProject(projectId);
  const messages = await listMessages(projectId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-medium tracking-tight">Messages</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
          Newest first. “Accepted” means the provider took the message —
          delivery itself is unconfirmed unless the timeline says otherwise.
        </p>
      </div>

      {messages.length > 0 ? (
        <ul className="divide-y divide-[#1c1917]/10 rounded-2xl border border-[#1c1917]/10 bg-white shadow-sm">
          {messages.map((message) => {
            const described = describeStatus(message.status);
            return (
              <li key={message.id}>
                <a
                  href={`/dashboard/projects/${projectId}/messages/${message.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-[#faf7f0] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#b3402a]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{message.subject}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[#1c1917]/55">
                      to {message.recipient_email} ·{" "}
                      {new Date(message.created_at).toLocaleString()}
                      {message.error_code ? ` · ${message.error_code}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={described.tone} label={described.label} />
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No messages yet"
          body={
            <>
              Send one via <code className="rounded bg-[#1c1917]/8 px-1 py-0.5 font-mono text-[0.9em]">POST /v1/emails</code> or
              fire an event into an enabled workflow — it will appear here with its timeline.
            </>
          }
        />
      )}
    </div>
  );
}

export default function MessagesPage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={0} />}>
      <MessagesContent params={params} />
    </Suspense>
  );
}
