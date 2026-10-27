import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { TemplateService } from "@/lib/templates/service";
import { getWorkflow, updateWorkflow, WorkflowError } from "@/lib/workflows/service";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

async function updateWorkflowAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const workflowId = String(formData.get("workflowId") ?? "");
  await requireOwnedProject(projectId);
  const parseJson = (raw: string): unknown => {
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new WorkflowError("workflow_invalid", "A JSON field is not valid JSON.", 422);
    }
  };
  try {
    await updateWorkflow(projectId, workflowId, {
      name: String(formData.get("name") ?? ""),
      trigger_event: String(formData.get("trigger_event") ?? ""),
      conditions: parseJson(String(formData.get("conditions") ?? "")),
      template_id: String(formData.get("template_id") ?? ""),
      recipient_path: String(formData.get("recipient_path") ?? "data.email"),
      variable_mappings: parseJson(String(formData.get("variable_mappings") ?? "")),
      delay_seconds: Number(String(formData.get("delay_seconds") ?? "0")),
      enabled: formData.get("enabled") === "on",
    });
  } catch (error) {
    const message =
      error instanceof WorkflowError ? error.message : "Could not update the workflow.";
    redirect(
      `/dashboard/projects/${projectId}/workflows/${workflowId}?error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/dashboard/projects/${projectId}/workflows?saved=1`);
}

async function EditWorkflowContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; workflowId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId, workflowId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const [workflow, templates] = await Promise.all([
    getWorkflow(projectId, workflowId),
    new TemplateService().listPublished(projectId),
  ]);
  if (!workflow) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/projects/${projectId}/workflows`}
          className="text-sm font-medium text-[#1c1917]/55 underline underline-offset-4 hover:text-[#1c1917]"
        >
          ← Workflows
        </Link>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-tight">
          Edit — {workflow.name}
        </h2>
        <p className="mt-1 font-mono text-xs text-[#1c1917]/50">
          v{workflow.version} · {project.name}
        </p>
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}

      <section className="rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Edit workflow">
        <form action={updateWorkflowAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="workflowId" value={workflowId} />
          <TextField label="Name" name="name" required defaultValue={workflow.name} autoComplete="off" />
          <TextField
            label="Trigger event"
            name="trigger_event"
            required
            defaultValue={workflow.trigger_event}
            autoComplete="off"
            mono
          />
          <SelectField label="Template (published)" name="template_id" required defaultValue={workflow.template_id ?? ""}>
            <option value="">Select a template…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.slug} (v{template.version})
              </option>
            ))}
          </SelectField>
          <TextField label="Recipient path" name="recipient_path" defaultValue={workflow.recipient_path} autoComplete="off" mono />
          <div className="sm:col-span-2">
            <TextAreaField
              label="Conditions (JSON)"
              name="conditions"
              rows={3}
              mono
              defaultValue={JSON.stringify(workflow.conditions)}
            />
          </div>
          <div className="sm:col-span-2">
            <TextAreaField
              label="Variable mappings (JSON)"
              name="variable_mappings"
              rows={3}
              mono
              defaultValue={JSON.stringify(workflow.variable_mappings)}
            />
          </div>
          <TextField
            label="Delay (seconds, 0–86400)"
            name="delay_seconds"
            inputMode="numeric"
            defaultValue={workflow.delay_seconds}
            autoComplete="off"
            mono
          />
          <div className="flex items-end pb-2">
            <CheckboxField name="enabled" defaultChecked={workflow.enabled} label="Enabled" />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Saving workflow…" className="w-full sm:w-auto">
              Save workflow
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function EditWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; workflowId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-48" cards={0} />}>
      <EditWorkflowContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
