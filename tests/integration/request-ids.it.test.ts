import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProviderSendResult } from "../../src/lib/email/provider";
import { queueEmailSend, type DeliveryProvider } from "../../src/lib/email/send";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import { createWorkflow, ingestEvent } from "../../src/lib/workflows/service";

/**
 * Request-ID persistence (Day 8 diagnostics).
 *
 * Real Supabase project, stub delivery — no email is dispatched.
 * Credentials come from `.env.local` (never committed); the suite skips
 * without them. Throwaway probe projects are deleted afterwards.
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
    return { providerMessageId: "<rid-stub@example>", status: "sent" };
  }
}

describe.skipIf(!hasKeys)("request ids (integration)", () => {
  it("persists on messages, queued events, app events, and workflow sends", async () => {
    const service = createSupabaseServiceClient();
    const slug = `rid-probe-${Date.now()}`;
    const { data: project, error: projectError } = await service
      .from("projects")
      .insert({ name: "Request ID probe", slug, status: "active" })
      .select("id")
      .single();
    if (projectError || !project) throw new Error("probe project setup failed");
    try {
      const { data: template, error: templateError } = await service
        .from("templates")
        .insert({
          project_id: project.id,
          slug: "rid-hello",
          name: "RID Hello",
          purpose: "notification",
          subject_template: "Hi {{name}}",
          html_template: "<p>Hi {{name}}</p>",
          text_template: "Hi {{name}}",
          variables_schema: { variables: [{ name: "name", type: "string", required: true }] },
          status: "published",
          version: 1,
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (templateError || !template) throw new Error("probe template setup failed");
      await upsertSmtpConfig(project.id, {
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "sender@example.com",
        pass: "probe-secret",
        from_email: "sender@example.com",
        from_name: "",
      });
      await createWorkflow(project.id, {
        name: "RID workflow",
        trigger_event: "rid.happened",
        conditions: {},
        template_id: template.id as string,
        recipient_path: "data.email",
        variable_mappings: { name: { path: "data.name" } },
        delay_seconds: 0,
        enabled: true,
      });

      const sent = await queueEmailSend(
        {
          projectId: project.id,
          to: "philipstar98@gmail.com",
          template: "rid-hello",
          variables: { name: "Direct" },
          idempotencyKey: "rid-direct-1",
          requestId: "req-direct-1",
        },
        { provider: new StubProvider() },
      );
      const { data: direct } = await service
        .from("messages")
        .select("request_id")
        .eq("id", sent.id)
        .single();
      expect(direct?.request_id).toBe("req-direct-1");
      const { data: queuedEvent } = await service
        .from("message_events")
        .select("payload_redacted")
        .eq("message_id", sent.id)
        .eq("event_type", "queued")
        .single();
      expect((queuedEvent?.payload_redacted as Record<string, unknown>).request_id).toBe("req-direct-1");

      const ingested = await ingestEvent(
        project.id,
        {
          externalId: "rid-ext-1",
          name: "rid.happened",
          data: { email: "philipstar98@gmail.com", name: "Flow" },
        },
        { provider: new StubProvider(), requestId: "req-event-1" },
      );
      const { data: appEvent } = await service
        .from("app_events")
        .select("request_id")
        .eq("id", ingested.id)
        .single();
      expect(appEvent?.request_id).toBe("req-event-1");
      const runMessageId = ingested.runs[0].message_id!;
      const { data: flowMessage } = await service
        .from("messages")
        .select("request_id, subject")
        .eq("id", runMessageId)
        .single();
      expect(flowMessage?.request_id).toBe("req-event-1");
      expect(flowMessage?.subject).toBe("Hi Flow");
    } finally {
      await service.from("projects").delete().eq("id", project.id);
    }
  }, 180_000);
});
