import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import {
  deleteSmtpConfig,
  getSmtpConfigSummary,
  SmtpConfigError,
  upsertSmtpConfig,
  type SmtpConfigSummary,
} from "@/lib/smtp/service";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { CheckboxField, TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

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

function MailboxDialog({ projectId, config }: { projectId: string; config: SmtpConfigSummary | null }) {
  return (
    <Dialog
      trigger={config ? "Update mailbox" : "+ Connect mailbox"}
      title={config ? "Update mailbox" : "Connect mailbox"}
      description="The password is encrypted at rest and never shown back. Common presets: Gmail (smtp.gmail.com:587, app password), Outlook (smtp.office365.com:587), or port 465 with SSL."
      wide
    >
      <form action={saveSmtpAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="projectId" value={projectId} />
        <TextField
          label="SMTP host"
          name="host"
          required
          placeholder="smtp.gmail.com"
          defaultValue={config?.host ?? ""}
          autoComplete="off"
          mono
        />
        <TextField
          label="Port"
          name="port"
          required
          inputMode="numeric"
          placeholder="587"
          defaultValue={config?.port ?? 587}
          autoComplete="off"
          mono
        />
        <div className="sm:col-span-2">
          <CheckboxField
            name="secure"
            defaultChecked={config?.secure ?? false}
            label="Use implicit SSL (port 465)"
            hint="Leave off for STARTTLS (port 587)."
          />
        </div>
        <TextField
          label="SMTP username"
          name="user"
          required
          autoComplete="username"
          placeholder="you@example.com"
        />
        <TextField
          label={config ? "SMTP password (blank keeps stored)" : "SMTP password"}
          name="pass"
          type="password"
          required={!config}
          autoComplete="new-password"
          placeholder={config ? "••••••••" : "app password"}
        />
        <TextField
          label="From email"
          name="from_email"
          type="email"
          required
          placeholder="hello@example.com"
          defaultValue={config?.from_email ?? ""}
          autoComplete="off"
        />
        <TextField
          label="From name (optional)"
          name="from_name"
          placeholder="Example"
          defaultValue={config?.from_name ?? ""}
          autoComplete="off"
        />
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel="Saving mailbox…" className="w-full sm:w-auto">
            Save mailbox
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
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
  await requireOwnedProject(projectId);
  const config = await getSmtpConfigSummary(projectId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight">Sending mailbox</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
            Every project sends from its own mailbox — never from a shared
            account. Sends are blocked until one is connected.
          </p>
        </div>
        <MailboxDialog projectId={projectId} config={config} />
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}
      {query.saved ? (
        <Banner tone="success" title="Mailbox saved.">New sends from this project will use it.</Banner>
      ) : null}
      {query.deleted ? (
        <Banner tone="warn" title="Mailbox removed.">Sends are blocked until you add one again.</Banner>
      ) : null}

      {config ? (
        <section className="rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Current mailbox">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1a7f37]/10 px-2.5 py-1 text-xs font-semibold text-[#145f2a]">
              Connected
            </span>
            <p className="font-mono text-sm font-semibold">
              {config.host}:{config.port} {config.secure ? "(SSL)" : "(STARTTLS)"}
            </p>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-[#1c1917]/55">Username</dt>
            <dd className="font-mono text-xs">{config.user_masked}</dd>
            <dt className="text-[#1c1917]/55">From</dt>
            <dd className="font-mono text-xs">
              {config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email}
            </dd>
            <dt className="text-[#1c1917]/55">Password</dt>
            <dd className="text-xs text-[#1c1917]/55">•••••••• (encrypted, never displayed)</dd>
            <dt className="text-[#1c1917]/55">Updated</dt>
            <dd className="text-xs">{new Date(config.updated_at).toLocaleString()}</dd>
          </dl>
          <div className="mt-4 border-t border-[#1c1917]/10 pt-4">
            <ConfirmForm
              action={deleteSmtpAction}
              label="Remove mailbox"
              confirmLabel="Click again to remove"
            >
              <input type="hidden" name="projectId" value={projectId} />
            </ConfirmForm>
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-dashed border-[#1c1917]/25 bg-white/60 px-6 py-10 text-center" aria-label="No mailbox">
          <p className="font-display text-xl font-medium">No mailbox connected</p>
          <p className="mx-auto max-w-md text-sm leading-6 text-[#1c1917]/65">
            Sends for this project are blocked until you save one. It takes a minute —
            host, port, username, app password.
          </p>
          <div className="flex justify-center pt-2">
            <MailboxDialog projectId={projectId} config={config} />
          </div>
        </section>
      )}
    </div>
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
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={0} />}>
      <SmtpContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
