import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authenticateApiKey, createApiKey } from "../../src/lib/api-keys/service";
import { getMessageDetail } from "../../src/lib/email/messages";
import type { ProviderSendResult } from "../../src/lib/email/provider";
import type { DeliveryProvider } from "../../src/lib/email/send";
import { syncMessageFromUpstream } from "../../src/lib/email/status-sync";
import type { UpstreamStatus } from "../../src/lib/email/provider";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import { TemplateService } from "../../src/lib/templates/service";
import { createWorkflow, ingestEvent } from "../../src/lib/workflows/service";

/**
 * Fresh-setup end-to-end journey (Day 8 proof).
 *
 * Builds a project from nothing using only the real service layer —
 * API key, template draft→publish, SMTP mailbox, workflow — then drives
 * signup event → run → message → timeline → sync. Delivery and upstream
 * status are stubbed (no email dispatched, no upstream contacted).
 * Credentials come from `.env.local` (never committed); the suite skips
 * without them. The probe project is deleted afterwards.
 */

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

const hasKeys = Boolean(
  envLocal.SUPABASE_SERVICE_ROLE_KEY &&
    envLocal.NEXT_PUBLIC_SUPABASE_URL &&
    envLocal.MAILMAAN_SMTP_ENCRYPTION_KEY,
);

class StubProvider implements DeliveryProvider {
  async send(): Promise<ProviderSendResult> {
    return { providerMessageId: "<journey-stub@example>", status: "sent" };
  }
}

class StubStatus {
  async getMessageStatus(): Promise<UpstreamStatus | null> {
    return { status: "sent", deliveredAt: "2026-10-27T00:00:00Z", openedAt: null, clickedAt: null };
  }
}

describe.skipIf(!hasKeys)("fresh-setup journey (integration)", () => {
  it("goes from empty project to synced timeline with no manual steps", async () => {
    const service = createSupabaseServiceClient();
    const slug = `journey-${Date.now()}`;
    const { data: project, error: projectError } = await service
      .from("projects")
      .insert({ name: "Journey", slug, status: "active" })
      .select("id")
      .single();
    if (projectError || !project) throw new Error("probe project setup failed");
    try {
      const { record: key, rawKey } = await createApiKey({
        projectId: project.id,
        name: "journey",
        scopes: ["read", "send", "events"],
      });
      expect(key.prefix.startsWith("mk_live_")).toBe(true);
      const auth = await authenticateApiKey(rawKey);
      expect(auth.project.id).toBe(project.id);

      const templates = new TemplateService();
      const draft = await templates.createDraft(project.id, {
        slug: "journey-welcome",
        name: "Journey Welcome",
        purpose: "welcome",
        subject: "Welcome {{firstName}}!",
        html: "<p>Hi {{firstName}}, welcome to {{product}}.</p>",
        text: "Hi {{firstName}}, welcome to {{product}}.",
        variables: [
          { name: "firstName", type: "string", required: true },
          { name: "product", type: "string", required: true },
        ],
      });
      const published = await templates.publishTemplate(project.id, draft.id);
      expect(published.status).toBe("published");

      const smtp = await upsertSmtpConfig(project.id, {
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "sender@example.com",
        pass: "probe-secret",
        from_email: "sender@example.com",
        from_name: "Journey",
      });
      expect(smtp.user_masked).toContain("***");

      await createWorkflow(project.id, {
        name: "Journey welcome",
        trigger_event: "user.signed_up",
        conditions: {},
        template_id: published.id,
        recipient_path: "data.email",
        variable_mappings: { firstName: { path: "data.firstName" }, product: { const: "Soko" } },
        delay_seconds: 0,
        enabled: true,
      });

      const ingested = await ingestEvent(
        project.id,
        {
          externalId: `journey-${Date.now()}`,
          name: "user.signed_up",
          data: { email: "philipstar98@gmail.com", firstName: "Journey" },
        },
        { provider: new StubProvider() },
      );
      expect(ingested.dispatch_status).toBe("dispatched");
      expect(ingested.runs).toHaveLength(1);
      expect(ingested.runs[0].status).toBe("completed");
      const messageId = ingested.runs[0].message_id!;

      const detail = await getMessageDetail(project.id, messageId);
      expect(detail?.status).toBe("accepted");
      expect(detail?.subject).toBe("Welcome Journey!");
      expect(detail?.timeline.map((event) => event.event_type)).toEqual(["queued", "accepted"]);
      expect(detail?.delivered_at).toBeNull();

      const synced = await syncMessageFromUpstream(project.id, messageId, {
        statusClient: new StubStatus(),
      });
      expect(synced.outcome).toBe("confirmed");
      expect(synced.status).toBe("accepted");
    } finally {
      await service.from("projects").delete().eq("id", project.id);
    }
  }, 240_000);
});
