import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService, TemplateError, type TemplateRecord } from "@/lib/templates/service";
import {
  fallbackReceipt,
  fallbackTemplate,
  fallbackWelcome,
  generateTemplate,
  generationConfigured,
  type BrandProfile,
} from "@/lib/templates/generation";
import { renderTemplate, validateVariableValues, TEMPLATE_PURPOSES } from "@/lib/email/render";

async function requireOwnedProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, brand_config, default_from_email, default_from_name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  return project;
}

function brandFromProject(project: {
  name: string;
  brand_config: unknown;
  default_from_email: string | null;
}): BrandProfile {
  const cfg = (project.brand_config ?? {}) as {
    app_name?: string;
    description?: string;
    tone?: string;
    colors?: { primary?: string; accent?: string; background?: string };
    logo_url?: string | null;
  };
  return {
    appName: cfg.app_name || project.name,
    description: cfg.description || "",
    tone: cfg.tone || "warm and concise",
    primaryColor: cfg.colors?.primary || "#0F172A",
    accentColor: cfg.colors?.accent || "#F59E0B",
    backgroundColor: cfg.colors?.background || "#ffffff",
    logoUrl: cfg.logo_url ?? null,
    supportEmail: project.default_from_email,
  };
}

function backTo(projectId: string, extra = ""): never {
  redirect(`/dashboard/projects/${projectId}/templates${extra}`);
}

async function createTemplateAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  const variablesRaw = String(formData.get("variables") ?? "[]");
  let variables: unknown = [];
  try {
    variables = JSON.parse(variablesRaw || "[]");
  } catch {
    backTo(projectId, "?error=Variables%20must%20be%20valid%20JSON.");
  }
  try {
    await new TemplateService().createDraft(projectId, {
      slug: String(formData.get("slug") ?? ""),
      name: String(formData.get("name") ?? ""),
      purpose: String(formData.get("purpose") ?? "custom"),
      subject: String(formData.get("subject") ?? ""),
      html: String(formData.get("html") ?? ""),
      text: String(formData.get("text") ?? "") || undefined,
      variables,
    });
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : "Template could not be created.";
    backTo(projectId, `?error=${encodeURIComponent(message)}`);
  }
  backTo(projectId);
}

async function generateAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const project = await requireOwnedProject(projectId);
  const purpose = String(formData.get("purpose") ?? "welcome");
  try {
    const generated = await generateTemplate(projectId, {
      brand: brandFromProject(project),
      purpose: purpose as TemplateRecord["purpose"],
    });
    const { generatedBy, model, notes, ...draft } = generated;
    await new TemplateService().createDraft(projectId, draft, {
      generated_by: generatedBy,
      model,
      notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    backTo(projectId, `?error=${encodeURIComponent(message)}`);
  }
  backTo(projectId);
}

async function seedSokoAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  const project = await requireOwnedProject(projectId);
  const brand = brandFromProject(project);
  const service = new TemplateService();
  for (const generated of [fallbackWelcome(brand), fallbackReceipt(brand)]) {
    const { generatedBy, model, notes, ...draft } = generated;
    await service.createDraft(
      projectId,
      { ...draft, name: `[Demo] ${draft.name}` },
      { generated_by: generatedBy, model, notes, seeded: true },
    );
  }
  void fallbackTemplate; // shared helper kept for generic purposes
  backTo(projectId);
}

async function publishAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  try {
    await new TemplateService().publishTemplate(projectId, String(formData.get("templateId") ?? ""));
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : "Publish failed.";
    backTo(projectId, `?error=${encodeURIComponent(message)}`);
  }
  backTo(projectId);
}

async function archiveAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  try {
    await new TemplateService().archiveTemplate(projectId, String(formData.get("templateId") ?? ""));
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : "Archive failed.";
    backTo(projectId, `?error=${encodeURIComponent(message)}`);
  }
  backTo(projectId);
}

async function ProjectTemplatesContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; preview?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await requireOwnedProject(projectId);
  const service = new TemplateService();
  const templates = await service.listTemplates(projectId);
  const config = generationConfigured();

  // Optional server-side preview (same renderer as the real send path).
  let preview: { template: TemplateRecord; subject: string; html: string; text: string; issues: string[] } | null = null;
  if (query.preview) {
    const template = templates.find((t) => t.id === query.preview) ?? null;
    if (template) {
      const values = (template.generation_metadata?.preview_data ?? {}) as Record<string, unknown>;
      const issues = validateVariableValues(template.variables_schema, values);
      preview = {
        template,
        issues,
        ...renderTemplate({
          subject: template.subject_template,
          html: template.html_template,
          text: template.text_template,
          values,
        }),
      };
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <a href="/dashboard" className="text-sm text-zinc-500 underline underline-offset-4">
          ← All projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Templates — {project.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drafts are editable. Publishing freezes a version forever; workflows
          always resolve the latest published version. Nothing here sends email.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          AI generation:{" "}
          {config.ai ? (
            <span>
              Meta Muse configured (model <code className="font-mono">{config.model}</code>).
            </span>
          ) : (
            <span>
              not configured (no <code className="font-mono">AI_API_KEY</code>/
              <code className="font-mono">AI_TEMPLATE_MODEL</code>) — generation uses
              deterministic templates <strong>labelled as fallback/demo</strong>,
              never presented as AI output.
            </span>
          )}
        </p>
      </header>

      {query.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{query.error}</p>
      ) : null}

      {preview ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Preview — {preview.template.name} (v{preview.template.version}, {preview.template.status})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Subject: <strong>{preview.subject}</strong>
          </p>
          {preview.issues.length ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Variable issues: {preview.issues.join("; ")}
            </p>
          ) : null}
          <iframe
            title="Email preview"
            sandbox=""
            className="h-96 w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
            srcDoc={preview.html}
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Plain-text version</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-50 p-3 whitespace-pre-wrap dark:bg-zinc-900">{preview.text}</pre>
          </details>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Templates</h2>
        {templates.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {t.name} <span className="font-mono text-xs text-zinc-500">({t.slug} · v{t.version})</span>
                  </p>
                  <p className="text-sm text-zinc-500">
                    {t.purpose} · {t.status}
                    {t.generation_metadata?.generated_by === "fallback" ? " · [Demo] fallback content" : ""}
                    {t.generation_metadata?.generated_by === "muse" ? ` · AI (${String(t.generation_metadata.model ?? "")})` : ""}
                    {" · "}required: {t.variables_schema.variables.filter((v) => v.required).map((v) => v.name).join(", ") || "none"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    href={`/dashboard/projects/${projectId}/templates?preview=${t.id}`}
                  >
                    Preview
                  </a>
                  {t.status === "draft" ? (
                    <form action={publishAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="templateId" value={t.id} />
                      <button type="submit" className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
                        Publish
                      </button>
                    </form>
                  ) : null}
                  {t.status !== "archived" ? (
                    <form action={archiveAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="templateId" value={t.id} />
                      <button type="submit" className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                        Archive
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No templates yet. Generate one below or add the labelled Soko demo pair.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Generate a template</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Uses your project brand profile. Results are saved as <strong>drafts</strong> —
          review, edit and publish them yourself. Generation never sends email.
        </p>
        <form action={generateAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Purpose</span>
            <select name="purpose" className="block rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" defaultValue="welcome">
              {TEMPLATE_PURPOSES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Generate draft
          </button>
        </form>
        <form action={seedSokoAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <button type="submit" className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Add Soko demo templates (welcome + receipt)
          </button>
        </form>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Create manually</h2>
        <form action={createTemplateAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input name="name" required placeholder="Welcome email" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Slug</span>
            <input name="slug" required placeholder="welcome" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Purpose</span>
            <select name="purpose" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" defaultValue="welcome">
              {TEMPLATE_PURPOSES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Subject ({"{{variables}}"} allowed, no line breaks)</span>
            <input name="subject" required placeholder="Welcome, {{firstName}}!" className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">HTML template (sanitized on save; values escaped at render)</span>
            <textarea name="html" required rows={6} placeholder="<p>Hi {{firstName}}</p>" className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Plain-text template (optional)</span>
            <textarea name="text" rows={3} placeholder={"Hi {{firstName}}"} className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Variables (JSON array)</span>
            <textarea name="variables" rows={3} defaultValue={'[{"name":"firstName","type":"string","required":true,"example":"Asha"}]'} className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Create draft
          </button>
        </form>
      </section>
    </main>
  );
}

export default function ProjectTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; preview?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
          <p className="text-sm text-zinc-500">Loading templates…</p>
        </main>
      }
    >
      <ProjectTemplatesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
