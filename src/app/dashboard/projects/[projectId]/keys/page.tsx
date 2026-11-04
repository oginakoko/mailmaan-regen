import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createApiKey, listApiKeys, revokeApiKey, API_KEY_SCOPES } from "@/lib/api-keys/service";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { CheckboxField, TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

const SCOPE_HELP: Record<string, string> = {
  read: "Read project, templates and messages.",
  send: "Send email (implies read).",
  events: "Ingest app events (implies read).",
  templates: "Generate AI template drafts (does not imply read).",
};

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
  redirect(`/dashboard/projects/${projectId}/keys?revoked=1`);
}

function NewKeyDialog({ projectId }: { projectId: string }) {
  return (
    <Dialog
      trigger="+ New key"
      title="New API key"
      description="Keys are shown once and stored only as hashes. Give each caller the smallest scopes it needs."
    >
      <form action={createKeyAction} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <TextField label="Name (optional)" name="name" placeholder="production-server" autoComplete="off" />
        <fieldset className="space-y-2.5">
          <legend className="text-sm font-semibold">Scopes</legend>
          {API_KEY_SCOPES.map((scope) => (
            <CheckboxField
              key={scope}
              name={`scope_${scope}`}
              defaultChecked={scope === "read"}
              label={<code className="font-mono text-[0.9em]">{scope}</code>}
              hint={SCOPE_HELP[scope] ?? ""}
            />
          ))}
        </fieldset>
        <SubmitButton pendingLabel="Creating key…" className="w-full sm:w-auto">
          Create key
        </SubmitButton>
      </form>
    </Dialog>
  );
}

async function ProjectKeysContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ created?: string; error?: string; revoked?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireOwnedProject(projectId);
  const keys = await listApiKeys(projectId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight">API keys</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
            A lost key can never be recovered — revoke it and create a new one.
          </p>
        </div>
        <NewKeyDialog projectId={projectId} />
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}
      {query.revoked ? <Banner tone="success" title="Key revoked.">Calls using it now fail closed.</Banner> : null}

      {query.created ? (
        <Banner tone="warn" title="Copy your new API key now — it will not be shown again.">
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">
              {query.created}
            </code>
            <CopyButton text={query.created} />
          </div>
        </Banner>
      ) : null}

      {keys.length > 0 ? (
        <ul className="divide-y divide-[#1c1917]/10 rounded-2xl border border-[#1c1917]/10 bg-white shadow-sm">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {key.name ?? "Untitled key"}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      key.revoked_at
                        ? "bg-[#1c1917]/8 text-[#1c1917]/55"
                        : "bg-[#1a7f37]/10 text-[#145f2a]"
                    }`}
                  >
                    {key.revoked_at ? "Revoked" : "Active"}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-[#1c1917]/55">
                  {key.prefix}… · scopes: {key.scopes.join(", ") || "none"}
                </p>
                <p className="mt-0.5 text-xs text-[#1c1917]/55">
                  {key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleString()}` : "Never used"}
                </p>
              </div>
              {!key.revoked_at ? (
                <div className="shrink-0">
                  <ConfirmForm
                    action={revokeKeyAction}
                    label="Revoke"
                    confirmLabel="Click again to revoke"
                  >
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="keyId" value={key.id} />
                  </ConfirmForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No API keys yet"
          body="Create one to call the Mailmaan API from your app or coding agent."
          action={<NewKeyDialog projectId={projectId} />}
        />
      )}
    </div>
  );
}

export default function ProjectKeysPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ created?: string; error?: string; revoked?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={0} />}>
      <ProjectKeysContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
