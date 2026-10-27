import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { TemplateService } from "@/lib/templates/service";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  WorkflowError,
} from "@/lib/workflows/service";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

function parseJsonField(raw: string, field: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return field === "conditions" ? { all: [] } : {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new WorkflowError("workflow_invalid", `${field} must be valid JSON.`, 422);
  }
}

function formToInput(formData: FormData): Record<string, unknown> {
  return {
    name: String(formData.get("name") ?? ""),
    trigger_event: String(formData.get("trigger_event") ?? ""),
    conditions: parseJsonField(String(formData.get("conditions") ?? ""), "conditions"),
    template_id: String(formData.get("template_id") ?? ""),
    recipient_path: String(formData.get("recipient_path") ?? "data.email"),
    variable_mappings: parseJsonField(
      String(formData.get("variable_mappings") ?? ""),
      "variable_mappings",
    ),
    delay_seconds: Number(String(formData.get("delay_seconds") ?? "0")),
    enabled: formData.get("enabled") === "on",
  };
}

async function createWorkflowAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  try {
    await createWorkflow(projectId, formToInput(formData));
  } catch (error) {
    const message =
      error instanceof WorkflowError ? error.message : "Could not create the workflow.";
    redirect(`/dashboard/projects/${projectId}/workflows?error=${encodeURIComponent(message)}`);
  }
  redirect(`/dashboard/projects/${projectId}/workflows?saved=1`);
}

async function toggleWorkflowAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const workflowId = String(formData.get("workflowId") ?? "");
  const project = await requireOwnedProject(projectId);
  const existing = await getWorkflow(project.id, workflowId);
  if (!existing) notFound();
  await updateWorkflow(projectId, workflowId, {
    name: existing.name,
    trigger_event: existing.trigger_event,
    conditions: existing.conditions,
    template_id: existing.template_id,
    recipient_path: existing.recipient_path,
    variable_mappings: existing.variable_mappings,
    delay_seconds: existing.delay_seconds,
    enabled: !existing.enabled,
  });
  redirect(`/dashboard/projects/${projectId}/workflows`);
}

async function deleteWorkflowAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const workflowId = String(formData.get("workflowId") ?? "");
  await requireOwnedProject(projectId);
  await deleteWorkflow(projectId, workflowId);
  redirect(`/dashboard/projects/${projectId}/workflows?deleted=1`);
}

function NewWorkflowDialog({
  projectId,
  templates,
}: {
  projectId: string;
  templates: { id: string; slug: string; version: number }[];
}) {
  return (
    <Dialog
      trigger="+ New workflow"
      title="New workflow"
      description="One event trigger → conditions → template → recipient. Disabled workflows never match."
      wide
    >
      <form action={createWorkflowAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="projectId" value={projectId} />
        <TextField label="Name" name="name" required placeholder="Welcome on signup" autoComplete="off" />
        <TextField
          label="Trigger event"
          name="trigger_event"
          required
          placeholder="user.signed_up"
          autoComplete="off"
          mono
        />
        <SelectField label="Template (published)" name="template_id" required defaultValue="">
          <option value="">Select a template…</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.slug} (v{template.version})
            </option>
          ))}
        </SelectField>
        <TextField label="Recipient path" name="recipient_path" defaultValue="data.email" autoComplete="off" mono />
        <div className="sm:col-span-2">
          <TextAreaField
            label="Conditions (JSON, optional)"
            name="conditions"
            rows={3}
            mono
            placeholder='{"all": [{"path": "data.plan", "equals": "pro"}]}'
          />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField
            label="Variable mappings (JSON)"
            name="variable_mappings"
            rows={3}
            mono
            placeholder='{"firstName": {"path": "data.firstName"}, "product": {"const": "Soko"}}'
            hint="Map template variables to event data paths or constants."
          />
        </div>
        <TextField
          label="Delay (seconds, 0–86400)"
          name="delay_seconds"
          inputMode="numeric"
          defaultValue="0"
          autoComplete="off"
          mono
        />
        <div className="flex items-end pb-2">
          <CheckboxField name="enabled" label="Enabled" />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel="Creating workflow…" className="w-full sm:w-auto">
            Create workflow
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

async function WorkflowsContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireOwnedProject(projectId);
  const [workflows, templates] = await Promise.all([
    listWorkflows(projectId),
    new TemplateService().listPublished(projectId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight">Workflows</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
            Runs execute immediately unless a delay is set; delayed runs wait
            for the reconciler. Disabled workflows never match.
          </p>
        </div>
        <NewWorkflowDialog projectId={projectId} templates={templates} />
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}
      {query.saved ? <Banner tone="success" title="Workflow saved." /> : null}
      {query.deleted ? <Banner tone="info" title="Workflow and its runs deleted." /> : null}

      {workflows.length > 0 ? (
        <ul className="divide-y divide-[#1c1917]/10 rounded-2xl border border-[#1c1917]/10 bg-white shadow-sm">
          {workflows.map((workflow) => (
            <li key={workflow.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {workflow.name}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      workflow.enabled
                        ? "bg-[#1a7f37]/10 text-[#145f2a]"
                        : "bg-[#1c1917]/8 text-[#1c1917]/55"
                    }`}
                  >
                    {workflow.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <span className="font-mono text-xs font-normal text-[#1c1917]/50">v{workflow.version}</span>
                </p>
                <p className="mt-1 truncate font-mono text-xs text-[#1c1917]/55">
                  on {workflow.trigger_event} → {workflow.recipient_path}
                  {workflow.delay_seconds > 0 ? ` · delay ${workflow.delay_seconds}s` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#1c1917]/25 px-3.5 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
                  href={`/dashboard/projects/${projectId}/workflows/${workflow.id}`}
                >
                  Edit
                </a>
                <form action={toggleWorkflowAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingLabel={workflow.enabled ? "Disabling…" : "Enabling…"}
                  >
                    {workflow.enabled ? "Disable" : "Enable"}
                  </SubmitButton>
                </form>
                <ConfirmForm
                  action={deleteWorkflowAction}
                  label="Delete"
                  confirmLabel="Click again to delete"
                >
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                </ConfirmForm>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No workflows yet"
          body="Events only trigger enabled workflows — create one to connect your app's happenings to a template."
          action={<NewWorkflowDialog projectId={projectId} templates={templates} />}
        />
      )}
    </div>
  );
}

export default function WorkflowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={0} />}>
      <WorkflowsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
