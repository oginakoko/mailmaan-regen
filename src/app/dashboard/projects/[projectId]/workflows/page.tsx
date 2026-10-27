import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService } from "@/lib/templates/service";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  WorkflowError,
} from "@/lib/workflows/service";

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

async function WorkflowsContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const [workflows, templates] = await Promise.all([
    listWorkflows(projectId),
    new TemplateService().listPublished(projectId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a href="/dashboard" className="text-sm text-zinc-500 underline underline-offset-4">
          ← All projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Workflows — {project.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          One event trigger → conditions → template → recipient. Runs execute
          immediately unless a delay is set; delayed runs wait for the
          reconciler. Disabled workflows never match.
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}
      {query.saved ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Workflow saved.
        </p>
      ) : null}
      {query.deleted ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Workflow and its runs deleted.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Workflows</h2>
        {workflows.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {workflows.map((workflow) => (
              <li key={workflow.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {workflow.name}{" "}
                    <span className="font-normal text-zinc-500">
                      · {workflow.enabled ? "enabled" : "disabled"} · v{workflow.version}
                    </span>
                  </p>
                  <p className="truncate font-mono text-xs text-zinc-500">
                    on {workflow.trigger_event} → {workflow.recipient_path}
                    {workflow.delay_seconds > 0 ? ` · delay ${workflow.delay_seconds}s` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    href={`/dashboard/projects/${projectId}/workflows/${workflow.id}`}
                  >
                    Edit
                  </a>
                  <form action={toggleWorkflowAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {workflow.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={deleteWorkflowAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No workflows yet. Create one below — events only trigger enabled workflows.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Create a workflow</h2>
        <form action={createWorkflowAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input name="name" required placeholder="Welcome on signup" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Trigger event</span>
            <input name="trigger_event" required placeholder="user.signed_up" className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Template (published)</span>
            <select name="template_id" required className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
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
            <input name="recipient_path" defaultValue="data.email" className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Conditions (JSON, optional)</span>
            <textarea
              name="conditions"
              rows={3}
              placeholder='{"all": [{"path": "data.plan", "equals": "pro"}]}'
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Variable mappings (JSON)</span>
            <textarea
              name="variable_mappings"
              rows={3}
              placeholder='{"firstName": {"path": "data.firstName"}, "product": {"const": "Soko"}}'
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Delay (seconds, 0–86400)</span>
            <input name="delay_seconds" inputMode="numeric" defaultValue="0" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="enabled" className="h-4 w-4" />
            <span>Enabled</span>
          </label>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Create workflow
          </button>
        </form>
      </section>
    </main>
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
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading workflows…</p>
        </main>
      }
    >
      <WorkflowsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
