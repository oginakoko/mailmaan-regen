import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService, TemplateError, type TemplateRecord } from "@/lib/templates/service";
import {
  fallbackReceipt,
  fallbackWelcome,
  generateTemplate,
  generationConfigured,
  type BrandProfile,
} from "@/lib/templates/generation";
import { renderTemplate, validateVariableValues, TEMPLATE_PURPOSES } from "@/lib/email/render";
import { listWorkflows } from "@/lib/workflows/service";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

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

async function projectWithBrand(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, brand_config, default_from_email, default_from_name")
    .eq("id", projectId)
    .maybeSingle();
  return project;
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
  backTo(projectId, "?created=1");
}

async function generateAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  const project = await projectWithBrand(projectId);
  if (!project) backTo(projectId, "?error=Project%20not%20found.");
  const purpose = String(formData.get("purpose") ?? "welcome");
  const brief = String(formData.get("brief") ?? "").trim().slice(0, 500);
  try {
    const generated = await generateTemplate(projectId, {
      brand: brandFromProject(project),
      purpose: purpose as TemplateRecord["purpose"],
      ...(brief ? { brief } : {}),
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
  backTo(projectId, "?created=1");
}

async function seedSokoAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  await requireOwnedProject(projectId);
  const project = await projectWithBrand(projectId);
  if (!project) backTo(projectId, "?error=Project%20not%20found.");
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
  backTo(projectId, "?created=1");
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
  backTo(projectId, "?published=1");
}

async function saveTemplateContent(formData: FormData, publish: boolean) {
  const projectId = String(formData.get("projectId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  await requireOwnedProject(projectId);
  try {
    const { template, declared } = await new TemplateService().saveContent(
      projectId,
      templateId,
      {
        name: String(formData.get("name") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        html: String(formData.get("html") ?? ""),
        text: String(formData.get("text") ?? ""),
      },
      { publish },
    );
    const params = new URLSearchParams({ v: String(template.version), slug: template.slug });
    if (declared.length) params.set("declared", declared.join(","));
    backTo(projectId, publish ? `?saved=1&${params}` : `?draftSaved=1&${params}`);
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : "Template could not be saved.";
    backTo(projectId, `?error=${encodeURIComponent(message)}`);
  }
}

async function saveDraftAction(formData: FormData) {
  "use server";
  await saveTemplateContent(formData, false);
}

async function savePublishAction(formData: FormData) {
  "use server";
  await saveTemplateContent(formData, true);
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
  backTo(projectId, "?archived=1");
}

function GenerateDialog({ projectId, aiOn, model }: { projectId: string; aiOn: boolean; model: string | null }) {
  return (
    <Dialog
      trigger="✦ Generate with AI"
      triggerVariant="gold"
      title="Generate a template"
      description={
        aiOn ? (
          <>Drafted by Meta Muse{model ? <> (<code className="font-mono text-[0.9em]">{model}</code>)</> : null} in your brand voice. Saved as a draft — you review and publish.</>
        ) : (
          <>AI is not configured, so this saves a deterministic starter labelled as demo content — never presented as AI output.</>
        )
      }
    >
      <form action={generateAction} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <SelectField label="Purpose" name="purpose" defaultValue="welcome">
          {TEMPLATE_PURPOSES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </SelectField>
        <TextField
          label="Brief for the AI (optional)"
          name="brief"
          placeholder="e.g. thank the buyer and ask for a review"
          maxLength={500}
          autoComplete="off"
        />
        <SubmitButton variant="gold" pendingLabel={aiOn ? "Asking the AI…" : "Building draft…"} className="w-full sm:w-auto">
          Generate draft
        </SubmitButton>
      </form>
    </Dialog>
  );
}

function CreateManuallyDialog({ projectId }: { projectId: string }) {
  return (
    <Dialog
      trigger="+ New template"
      title="New template"
      description="Write the subject, HTML and variables yourself. Saved as a draft — nothing sends."
      wide
    >
      <form action={createTemplateAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="projectId" value={projectId} />
        <TextField label="Name" name="name" required placeholder="Welcome email" autoComplete="off" />
        <TextField label="Slug" name="slug" required placeholder="welcome" autoComplete="off" mono />
        <SelectField label="Purpose" name="purpose" defaultValue="welcome">
          {TEMPLATE_PURPOSES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </SelectField>
        <TextField
          label="Subject"
          name="subject"
          required
          placeholder="Welcome, {{firstName}}!"
          autoComplete="off"
          hint="{{variables}} allowed, no line breaks."
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="HTML template"
            name="html"
            required
            rows={6}
            mono
            placeholder="<p>Hi {{firstName}}</p>"
            hint="Sanitized on save; values escaped at render."
          />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField
            label="Plain-text template (optional)"
            name="text"
            rows={3}
            mono
            placeholder="Hi {{firstName}}"
          />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField
            label="Variables (JSON array)"
            name="variables"
            rows={3}
            mono
            defaultValue='[{"name":"firstName","type":"string","required":true,"example":"Asha"}]'
          />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel="Creating draft…" className="w-full sm:w-auto">
            Create draft
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function EditTemplateDialog({
  projectId,
  template,
  workflows,
}: {
  projectId: string;
  template: TemplateRecord;
  workflows: string[];
}) {
  const declared = template.variables_schema.variables;
  return (
    <Dialog
      trigger="Edit"
      triggerVariant="secondary"
      triggerSize="sm"
      title={`Edit — ${template.name}`}
      description={
        <>
          v{template.version} ({template.status}) · slug <code className="font-mono text-[0.9em]">{template.slug}</code>.
          Save &amp; publish makes the new version live for workflows immediately
          {template.status !== "draft" ? " (the published version is forked, never rewritten)" : null}.
        </>
      }
      wide
    >
      <form action={savePublishAction} className="grid gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="templateId" value={template.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" defaultValue={template.name} autoComplete="off" />
          <TextField label="Subject" name="subject" required defaultValue={template.subject_template} autoComplete="off" hint="{{variables}} allowed, no line breaks." />
        </div>
        <TextAreaField
          label="HTML template"
          name="html"
          required
          rows={8}
          mono
          defaultValue={template.html_template}
          hint="Sanitized on save; values escaped at render."
        />
        <TextAreaField
          label="Plain-text template"
          name="text"
          rows={6}
          mono
          defaultValue={template.text_template ?? ""}
          hint="Update links and wording here. Leave blank to auto-derive from the HTML."
        />
        <p className="text-sm leading-6 text-[#1c1917]/65">
          Variables:{" "}
          {declared.length ? (
            <span className="font-mono text-[0.9em]">
              {declared.map((v) => `${v.name}${v.required ? "*" : ""}`).join(", ")}
            </span>
          ) : (
            "none"
          )}{" "}
          (* required). New {"{{placeholders}}"} you add are auto-declared as optional.
        </p>
        <p className="text-sm leading-6 text-[#1c1917]/65">
          {workflows.length ? (
            <>Used by {workflows.length === 1 ? "workflow" : "workflows"}: <strong>{workflows.join(", ")}</strong> — they send the new version as soon as you save &amp; publish.</>
          ) : (
            <>No workflow points at this template yet — publishing still makes it available for sends.</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Saving & publishing…">
            Save &amp; publish
          </SubmitButton>
          <SubmitButton variant="secondary" formAction={saveDraftAction} pendingLabel="Saving draft…">
            Save draft
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function statusPill(status: string): string {
  if (status === "published") return "bg-[#1a7f37]/10 text-[#145f2a]";
  if (status === "archived") return "bg-[#1c1917]/8 text-[#1c1917]/55";
  return "bg-[#e8c87a]/25 text-[#6b4a00]";
}

async function ProjectTemplatesContent({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    error?: string;
    preview?: string;
    created?: string;
    published?: string;
    archived?: string;
    saved?: string;
    draftSaved?: string;
    v?: string;
    slug?: string;
    declared?: string;
  }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireOwnedProject(projectId);
  const service = new TemplateService();
  const templates = await service.listTemplates(projectId);
  const config = generationConfigured();

  // Workflows pin a template version id but send the latest published
  // version per slug — map template ids back to slugs for the edit UI.
  const workflows = await listWorkflows(projectId);
  const slugByTemplateId = new Map(templates.map((t) => [t.id, t.slug]));
  const workflowsBySlug = new Map<string, string[]>();
  for (const workflow of workflows) {
    if (!workflow.template_id) continue;
    const slug = slugByTemplateId.get(workflow.template_id);
    if (slug) workflowsBySlug.set(slug, [...(workflowsBySlug.get(slug) ?? []), workflow.name]);
  }

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight">Templates</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#1c1917]/65">
            Edit any version — subject, HTML and plain text. Save &amp; publish
            freezes a new version that workflows pick up immediately; published
            versions are forked, never rewritten. Nothing here sends email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GenerateDialog projectId={projectId} aiOn={config.ai} model={config.model} />
          <CreateManuallyDialog projectId={projectId} />
        </div>
      </div>

      {query.error ? <Banner tone="error">{query.error}</Banner> : null}
      {query.created ? <Banner tone="success" title="Draft saved.">Review it below, preview it, then publish.</Banner> : null}
      {query.published ? <Banner tone="success" title="Template published.">Workflows now resolve this version.</Banner> : null}
      {query.archived ? <Banner tone="info" title="Template archived.">It no longer resolves for new sends.</Banner> : null}
      {query.saved ? (
        <Banner tone="success" title={`Saved and published as v${query.v ?? "?"} — live now.`}>
          Workflows using <code className="font-mono text-[0.9em]">{query.slug}</code> send this version from here on.
          {query.declared ? <> New variables auto-declared (optional): <code className="font-mono text-[0.9em]">{query.declared}</code>.</> : null}
        </Banner>
      ) : null}
      {query.draftSaved ? (
        <Banner tone="success" title={`Draft v${query.v ?? "?"} saved.`}>
          Publish it to make it live for workflows.
          {query.declared ? <> New variables auto-declared (optional): <code className="font-mono text-[0.9em]">{query.declared}</code>.</> : null}
        </Banner>
      ) : null}

      <Banner tone={config.ai ? "info" : "warn"} title={config.ai ? "AI generation is on." : "AI generation is off."}>
        {config.ai ? (
          <>Meta Muse drafts in your brand voice (model <code className="font-mono text-[0.9em]">{config.model}</code>).</>
        ) : (
          <>No <code className="font-mono text-[0.9em]">AI_API_KEY</code>/<code className="font-mono text-[0.9em]">AI_TEMPLATE_MODEL</code> — generation saves deterministic starters labelled as demo.</>
        )}
      </Banner>

      {preview ? (
        <section className="rounded-2xl border border-[#1c1917]/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Template preview">
          <h3 className="font-display text-xl font-medium tracking-tight">
            Preview — {preview.template.name} (v{preview.template.version}, {preview.template.status})
          </h3>
          <p className="mt-1 text-sm text-[#1c1917]/65">
            Subject: <strong>{preview.subject}</strong>
          </p>
          {preview.issues.length ? (
            <div className="mt-3">
              <Banner tone="warn" title="Variable issues">{preview.issues.join("; ")}</Banner>
            </div>
          ) : null}
          <iframe
            title="Email preview"
            sandbox=""
            className="mt-3 h-96 w-full rounded-xl border border-[#1c1917]/15 bg-white"
            srcDoc={preview.html}
          />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Plain-text version</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-[#faf7f0] p-3 whitespace-pre-wrap">{preview.text}</pre>
          </details>
        </section>
      ) : null}

      {templates.length > 0 ? (
        <ul className="divide-y divide-[#1c1917]/10 rounded-2xl border border-[#1c1917]/10 bg-white shadow-sm">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {t.name}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPill(t.status)}`}>
                    {t.status}
                  </span>
                  {t.generation_metadata?.generated_by === "fallback" ? (
                    <span className="rounded-full bg-[#e8c87a]/25 px-2.5 py-0.5 text-xs font-semibold text-[#6b4a00]">
                      demo content
                    </span>
                  ) : null}
                  {t.generation_metadata?.generated_by === "muse" ? (
                    <span className="rounded-full bg-[#1c1917]/8 px-2.5 py-0.5 font-mono text-xs text-[#1c1917]/65">
                      AI · {String(t.generation_metadata.model ?? "")}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 font-mono text-xs text-[#1c1917]/55">
                  {t.slug} · v{t.version} · {t.purpose}
                </p>
                <p className="mt-0.5 text-xs text-[#1c1917]/55">
                  required: {t.variables_schema.variables.filter((v) => v.required).map((v) => v.name).join(", ") || "none"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#1c1917]/25 px-3.5 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a]"
                  href={`/dashboard/projects/${projectId}/templates?preview=${t.id}`}
                >
                  Preview
                </a>
                <EditTemplateDialog projectId={projectId} template={t} workflows={workflowsBySlug.get(t.slug) ?? []} />
                {t.status === "draft" ? (
                  <form action={publishAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="templateId" value={t.id} />
                    <SubmitButton size="sm" pendingLabel="Publishing…">
                      Publish
                    </SubmitButton>
                  </form>
                ) : null}
                {t.status !== "archived" ? (
                  <form action={archiveAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="templateId" value={t.id} />
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Archiving…">
                      Archive
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No templates yet"
          body="Generate one with the AI in your brand voice, or write one by hand."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <GenerateDialog projectId={projectId} aiOn={config.ai} model={config.model} />
              <CreateManuallyDialog projectId={projectId} />
            </div>
          }
        />
      )}

      <form action={seedSokoAction} className="flex justify-start">
        <input type="hidden" name="projectId" value={projectId} />
        <SubmitButton variant="secondary" pendingLabel="Adding demo templates…">
          Add Soko demo templates (welcome + receipt)
        </SubmitButton>
      </form>
    </div>
  );
}

export default function ProjectTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    error?: string;
    preview?: string;
    created?: string;
    published?: string;
    archived?: string;
    saved?: string;
    draftSaved?: string;
    v?: string;
    slug?: string;
    declared?: string;
  }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={0} />}>
      <ProjectTemplatesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
