import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "../supabase/service";
import {
  sanitizeEmailHtml,
  templateDraftSchema,
  undeclaredPlaceholders,
  validateSubject,
  type TemplateDraft,
  type TemplatePurpose,
  type VariablesSchema,
} from "../email/render";

/**
 * TemplateService (Blueprint §4C, §6, §10).
 *
 * Versioning rule (documented simplification of §6): a template is identified
 * by (project_id, slug). `version` increments every time content is edited
 * after publishing. Publishing is an explicit, immutable act: once published,
 * a version's content can never change — editing creates the next draft
 * version. `current published version` = highest `version` with
 * status='published' for that slug. Drafts are never resolvable for sending.
 */

export type TemplateStatus = "draft" | "published" | "archived";

export interface TemplateRecord {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  purpose: TemplatePurpose;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  variables_schema: VariablesSchema;
  status: TemplateStatus;
  version: number;
  generation_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export class TemplateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

function toRecord(row: Record<string, unknown>): TemplateRecord {
  const rawSchema = (row.variables_schema ?? {}) as { variables?: unknown };
  return {
    ...(row as unknown as TemplateRecord),
    variables_schema: { variables: Array.isArray(rawSchema.variables) ? (rawSchema.variables as VariablesSchema["variables"]) : [] },
  };
}

function assertValidDraft(draft: TemplateDraft): void {
  const subjectIssues = validateSubject(draft.subject);
  if (subjectIssues.length) {
    throw new TemplateError("template_invalid", subjectIssues.join("; "));
  }
}

export interface TemplateContentEdits {
  name?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SavedTemplateContent {
  template: TemplateRecord;
  /** True when a published/archived version was forked into a new version. */
  forked: boolean;
  /** Placeholder names auto-declared as optional variables. */
  declared: string[];
}

export class TemplateService {
  private db: SupabaseClient;

  constructor(db: SupabaseClient = createSupabaseServiceClient()) {
    this.db = db;
  }

  async listTemplates(projectId: string, opts?: { status?: TemplateStatus }): Promise<TemplateRecord[]> {
    let query = this.db
      .from("templates")
      .select("*")
      .eq("project_id", projectId)
      .order("slug", { ascending: true })
      .order("version", { ascending: false });
    if (opts?.status) query = query.eq("status", opts.status);
    const { data, error } = await query;
    if (error) throw new TemplateError("template_list_failed", error.message);
    return (data ?? []).map((row) => toRecord(row as Record<string, unknown>));
  }

  /** Public API view: published templates only, metadata + required variables. */
  async listPublished(projectId: string): Promise<TemplateRecord[]> {
    const all = await this.listTemplates(projectId, { status: "published" });
    // Latest published version per slug.
    const latest = new Map<string, TemplateRecord>();
    for (const t of all) {
      const prev = latest.get(t.slug);
      if (!prev || t.version > prev.version) latest.set(t.slug, t);
    }
    return [...latest.values()];
  }

  async getTemplate(projectId: string, templateId: string): Promise<TemplateRecord | null> {
    const { data, error } = await this.db
      .from("templates")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", templateId)
      .maybeSingle();
    if (error) throw new TemplateError("template_read_failed", error.message);
    return data ? toRecord(data as Record<string, unknown>) : null;
  }

  /** Resolve the current published version for a slug (sending path, Day 4+). */
  async getPublishedBySlug(projectId: string, slug: string): Promise<TemplateRecord | null> {
    const { data, error } = await this.db
      .from("templates")
      .select("*")
      .eq("project_id", projectId)
      .eq("slug", slug)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new TemplateError("template_read_failed", error.message);
    return data ? toRecord(data as Record<string, unknown>) : null;
  }

  async createDraft(projectId: string, raw: unknown, generationMetadata: Record<string, unknown> = {}): Promise<TemplateRecord> {
    const parsed = templateDraftSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TemplateError("template_invalid", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const draft = parsed.data;
    assertValidDraft(draft);

    const { data: existing } = await this.db
      .from("templates")
      .select("version")
      .eq("project_id", projectId)
      .eq("slug", draft.slug)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (existing?.version ?? 0) + 1;

    const { data, error } = await this.db
      .from("templates")
      .insert({
        project_id: projectId,
        slug: draft.slug,
        name: draft.name,
        purpose: draft.purpose,
        subject_template: draft.subject,
        html_template: sanitizeEmailHtml(draft.html),
        text_template: draft.text ?? null,
        variables_schema: { variables: draft.variables },
        status: "draft",
        version,
        generation_metadata: { ...generationMetadata, preview_data: draft.previewData ?? {} },
      })
      .select("*")
      .single();
    if (error || !data) throw new TemplateError("template_create_failed", error?.message ?? "unknown error");
    return toRecord(data as Record<string, unknown>);
  }

  /**
   * Edit a template. Drafts edit in place; editing a published/archived
   * template forks the next draft version so published content is immutable.
   */
  async updateTemplate(projectId: string, templateId: string, raw: unknown): Promise<TemplateRecord> {
    const current = await this.getTemplate(projectId, templateId);
    if (!current) throw new TemplateError("template_not_found", "Template not found in this project.");
    if (current.status !== "draft") {
      // Fork: new draft version with the edited content (slug must match).
      const fork = await this.createDraft(projectId, {
        ...(raw as Record<string, unknown>),
        slug: current.slug,
      });
      return fork;
    }
    const parsed = templateDraftSchema.safeParse({ ...(raw as Record<string, unknown>), slug: current.slug });
    if (!parsed.success) {
      throw new TemplateError("template_invalid", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const draft = parsed.data;
    assertValidDraft(draft);
    const { data, error } = await this.db
      .from("templates")
      .update({
        name: draft.name,
        purpose: draft.purpose,
        subject_template: draft.subject,
        html_template: sanitizeEmailHtml(draft.html),
        text_template: draft.text ?? null,
        variables_schema: { variables: draft.variables },
        generation_metadata: { ...current.generation_metadata, preview_data: draft.previewData ?? {} },
      })
      .eq("project_id", projectId)
      .eq("id", templateId)
      .eq("status", "draft")
      .select("*")
      .single();
    if (error || !data) throw new TemplateError("template_update_failed", error?.message ?? "unknown error");
    return toRecord(data as Record<string, unknown>);
  }

  /**
   * Save edited content. Name/purpose/schema carry over; new
   * `{{placeholders}}` in the edited content are auto-declared as optional
   * string variables so strict send validation keeps passing. With
   * `publish`, the saved version is published immediately, so workflows —
   * which resolve the latest published version per slug — pick it up.
   */
  async saveContent(
    projectId: string,
    templateId: string,
    edits: TemplateContentEdits,
    opts?: { publish?: boolean },
  ): Promise<SavedTemplateContent> {
    const current = await this.getTemplate(projectId, templateId);
    if (!current) throw new TemplateError("template_not_found", "Template not found in this project.");
    const declared = undeclaredPlaceholders(
      [edits.subject, edits.html, edits.text ?? ""],
      current.variables_schema,
    );
    const saved = await this.updateTemplate(projectId, templateId, {
      name: edits.name?.trim() ? edits.name.trim() : current.name,
      purpose: current.purpose,
      subject: edits.subject,
      html: edits.html,
      text: edits.text ?? undefined,
      variables: [
        ...current.variables_schema.variables,
        ...declared.map((name) => ({ name, type: "string", required: false })),
      ],
      previewData: (current.generation_metadata.preview_data ?? {}) as Record<string, unknown>,
    });
    const template = opts?.publish ? await this.publishTemplate(projectId, saved.id) : saved;
    return { template, forked: saved.id !== templateId, declared };
  }

  /** Publish a draft. Immutable afterwards; older published versions stay superseded by version order. */
  async publishTemplate(projectId: string, templateId: string): Promise<TemplateRecord> {
    const { data, error } = await this.db
      .from("templates")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("id", templateId)
      .eq("status", "draft")
      .select("*")
      .single();
    if (error || !data) {
      throw new TemplateError("template_publish_failed", "Only a draft template can be published.");
    }
    return toRecord(data as Record<string, unknown>);
  }

  async archiveTemplate(projectId: string, templateId: string): Promise<TemplateRecord> {
    const { data, error } = await this.db
      .from("templates")
      .update({ status: "archived" })
      .eq("project_id", projectId)
      .eq("id", templateId)
      .neq("status", "archived")
      .select("*")
      .single();
    if (error || !data) throw new TemplateError("template_archive_failed", "Template could not be archived.");
    return toRecord(data as Record<string, unknown>);
  }
}
