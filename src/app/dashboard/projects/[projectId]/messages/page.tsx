import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeStatus, listMessages } from "@/lib/email/messages";

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

function toneClass(tone: string): string {
  if (tone === "ok") return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
  if (tone === "bad") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  if (tone === "warn")
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

async function MessagesContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireOwnedProject(projectId);
  const messages = await listMessages(projectId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a href="/dashboard" className="text-sm text-zinc-500 underline underline-offset-4">
          ← All projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Messages — {project.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Newest first. “Accepted” means the provider took the message —
          delivery itself is unconfirmed unless the timeline says otherwise.
        </p>
      </header>

      {messages.length > 0 ? (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {messages.map((message) => {
            const described = describeStatus(message.status);
            return (
              <li key={message.id}>
                <a
                  href={`/dashboard/projects/${projectId}/messages/${message.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {message.subject}
                    </p>
                    <p className="truncate font-mono text-xs text-zinc-500">
                      to {message.recipient_email} ·{" "}
                      {new Date(message.created_at).toLocaleString()}
                      {message.error_code ? ` · ${message.error_code}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${toneClass(described.tone)}`}
                  >
                    {described.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No messages yet. Send one via <code className="font-mono">POST /v1/emails</code>.
        </p>
      )}
    </main>
  );
}

export default function MessagesPage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading messages…</p>
        </main>
      }
    >
      <MessagesContent params={params} />
    </Suspense>
  );
}
