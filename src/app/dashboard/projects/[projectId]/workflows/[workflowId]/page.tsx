import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService } from "@/lib/templates/service";
import { getWorkflow, updateWorkflow, WorkflowError } from "@/lib/workflows/service";

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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a
          href={`/dashboard/projects/${projectId}/workflows`}
          className="text-sm text-zinc-500 underline underline-offset-4"
        >
          ← Workflows
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit — {workflow.name}
        </h1>
        <p className="font-mono text-xs text-zinc-500">
          v{workflow.version} · {project.name}
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <form action={updateWorkflowAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="workflowId" value={workflowId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input name="name" required defaultValue={workflow.name} className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Trigger event</span>
            <input name="trigger_event" required defaultValue={workflow.trigger_event} className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Template (published)</span>
            <select name="template_id" required defaultValue={workflow.template_id ?? ""} className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">Select a template…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.slug} (v{template.version})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Recipient path</span>
            <input name="recipient_path" defaultValue={workflow.recipient_path} className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Conditions (JSON)</span>
            <textarea
              name="conditions"
              rows={3}
              defaultValue={JSON.stringify(workflow.conditions)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Variable mappings (JSON)</span>
            <textarea
              name="variable_mappings"
              rows={3}
              defaultValue={JSON.stringify(workflow.variable_mappings)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Delay (seconds, 0–86400)</span>
            <input name="delay_seconds" inputMode="numeric" defaultValue={workflow.delay_seconds} className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={workflow.enabled} className="h-4 w-4" />
            <span>Enabled</span>
          </label>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Save workflow
          </button>
        </form>
      </section>
    </main>
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
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading workflow…</p>
        </main>
      }
    >
      <EditWorkflowContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
