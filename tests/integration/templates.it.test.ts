import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/lib/email/render";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import { fallbackWelcome, type BrandProfile } from "../../src/lib/templates/generation";
import { TemplateService } from "../../src/lib/templates/service";

/**
 * Durable integration coverage for TemplateService (Day 3 templates).
 *
 * Runs against the REAL Supabase test project using the service-role client.
 * Credentials are read manually from `.env.local` (never committed, values
 * never printed). When the service key is absent the suite is skipped —
 * there is no fake-green path. A unique probe slug per run keeps reruns
 * clean; probe rows are left archived, never published, at the end.
 */

const TEST_PROJECT_ID = "d7027a63-b1d1-46b0-b250-f663ca47d170";

function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) parsed[key] = value;
  }
  return parsed;
}

const envLocal = loadEnvLocal();
for (const [key, value] of Object.entries(envLocal)) {
  process.env[key] = value;
}

const hasServiceKey = Boolean(
  envLocal.SUPABASE_SERVICE_ROLE_KEY && envLocal.NEXT_PUBLIC_SUPABASE_URL,
);

// Same Soko brand profile as src/lib/templates/generation.test.ts.
const soko: BrandProfile = {
  appName: "Soko",
  description: "Kenyan storefront",
  tone: "warm and concise",
  primaryColor: "#0F172A",
  accentColor: "#F59E0B",
  backgroundColor: "#ffffff",
  supportEmail: "hello@soko.example",
};

describe.skipIf(!hasServiceKey)("TemplateService integration (real Supabase)", () => {
  it(
    "creates, publishes, forks on edit, and archives a Soko welcome template",
    async () => {
      const service = new TemplateService(createSupabaseServiceClient());
      const probeSlug = `welcome-probe-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

      const generated = fallbackWelcome(soko);
      expect(generated.generatedBy).toBe("fallback");
      const { generatedBy, model, notes, ...draft } = generated;

      // Create draft via the real service (sanitizes + persists).
      const created = await service.createDraft(
        TEST_PROJECT_ID,
        { ...draft, slug: probeSlug },
        { generated_by: generatedBy, model, notes, integration_probe: true },
      );
      expect(created.status).toBe("draft");
      expect(created.slug).toBe(probeSlug);
      expect(created.version).toBe(1);

      // Drafts are never exposed as published.
      const publishedBefore = await service.listPublished(TEST_PROJECT_ID);
      expect(publishedBefore.some((t) => t.slug === probeSlug)).toBe(false);
      expect(await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug)).toBeNull();

      // Publish, then resolve through the sending-path lookup.
      const published = await service.publishTemplate(TEST_PROJECT_ID, created.id);
      expect(published.status).toBe("published");

      const resolved = await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug);
      expect(resolved).not.toBeNull();
      expect(resolved?.id).toBe(created.id);
      expect(resolved?.version).toBe(1);

      // Preview rendering with the stored previewData: brand color and the
      // sample name survive; a markup-bearing name is escaped, never raw.
      const previewData = (resolved?.generation_metadata.preview_data ?? {}) as Record<
        string,
        unknown
      >;
      const preview = renderTemplate({
        subject: resolved?.subject_template ?? "",
        html: resolved?.html_template ?? "",
        text: resolved?.text_template,
        values: previewData,
      });
      expect(preview.html).toContain(soko.primaryColor);
      expect(preview.html).toContain("Asha");

      const hostile = renderTemplate({
        subject: resolved?.subject_template ?? "",
        html: resolved?.html_template ?? "",
        text: resolved?.text_template,
        values: { ...previewData, firstName: "<b>Asha</b>" },
      });
      expect(hostile.html).toContain("&lt;b&gt;Asha&lt;/b&gt;");
      expect(hostile.html).not.toContain("<b>Asha</b>");

      // Editing a published template forks a NEW draft version; the
      // published version stays immutable.
      const fork = await service.updateTemplate(TEST_PROJECT_ID, published.id, {
        name: `${created.name} (edited)`,
        purpose: created.purpose,
        subject: created.subject_template,
        html: created.html_template,
        text: created.text_template ?? undefined,
        variables: created.variables_schema.variables,
        previewData,
      });
      expect(fork.id).not.toBe(published.id);
      expect(fork.status).toBe("draft");
      expect(fork.version).toBe(published.version + 1);
      expect(fork.name).toBe(`${created.name} (edited)`);

      const stillPublished = await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug);
      expect(stillPublished?.id).toBe(published.id);
      expect(stillPublished?.version).toBe(1);
      expect(stillPublished?.name).toBe(created.name);

      // Archive both probe versions; nothing published remains resolvable.
      const archivedFork = await service.archiveTemplate(TEST_PROJECT_ID, fork.id);
      expect(archivedFork.status).toBe("archived");
      const archivedPublished = await service.archiveTemplate(TEST_PROJECT_ID, published.id);
      expect(archivedPublished.status).toBe("archived");
      expect(await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug)).toBeNull();
    },
    60_000,
  );

  it(
    "saveContent edits in place, auto-declares placeholders, and publishes live",
    async () => {
      const service = new TemplateService(createSupabaseServiceClient());
      const probeSlug = `editor-probe-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      const generated = fallbackWelcome(soko);
      const { generatedBy, model, notes, ...draft } = generated;

      const created = await service.createDraft(
        TEST_PROJECT_ID,
        { ...draft, slug: probeSlug },
        { generated_by: generatedBy, model, notes, integration_probe: true },
      );

      // Draft edits apply in place (no fork) and stay unpublished.
      const savedDraft = await service.saveContent(TEST_PROJECT_ID, created.id, {
        subject: "Edited subject, {{firstName}}",
        html: created.html_template,
        text: "Plain hello {{firstName}}",
      });
      expect(savedDraft.forked).toBe(false);
      expect(savedDraft.template.id).toBe(created.id);
      expect(savedDraft.template.status).toBe("draft");
      expect(savedDraft.template.subject_template).toBe("Edited subject, {{firstName}}");
      expect(await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug)).toBeNull();

      // Publish, then save-with-publish from the published version: forks a
      // new version that immediately becomes the resolved live version.
      const published = await service.publishTemplate(TEST_PROJECT_ID, created.id);
      const savedLive = await service.saveContent(
        TEST_PROJECT_ID,
        published.id,
        {
          subject: published.subject_template,
          html: published.html_template,
          text: "Track it here: {{trackingUrl}}",
        },
        { publish: true },
      );
      expect(savedLive.forked).toBe(true);
      expect(savedLive.template.status).toBe("published");
      expect(savedLive.template.version).toBe(published.version + 1);
      expect(savedLive.declared).toEqual(["trackingUrl"]);
      expect(
        savedLive.template.variables_schema.variables.find((v) => v.name === "trackingUrl"),
      ).toMatchObject({ type: "string", required: false });

      const resolved = await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug);
      expect(resolved?.id).toBe(savedLive.template.id);
      expect(resolved?.text_template).toBe("Track it here: {{trackingUrl}}");

      // Cleanup: archive every probe version.
      await service.archiveTemplate(TEST_PROJECT_ID, savedLive.template.id);
      await service.archiveTemplate(TEST_PROJECT_ID, published.id);
      expect(await service.getPublishedBySlug(TEST_PROJECT_ID, probeSlug)).toBeNull();
    },
    60_000,
  );
});
