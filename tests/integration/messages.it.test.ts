import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getMessageDetail, listMessages } from "../../src/lib/email/messages";
import type { ProviderSendResult } from "../../src/lib/email/provider";
import { queueEmailSend, type DeliveryProvider } from "../../src/lib/email/send";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";

/**
 * Durable integration coverage for dashboard message queries (Day 5).
 *
 * Real Supabase project, stub delivery — no email is dispatched.
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
    return { providerMessageId: "<messages-stub@example>", status: "sent" };
  }
}

describe.skipIf(!hasKeys)("message queries (integration)", () => {
  it("lists newest-first and loads detail with timeline", async () => {
    const service = createSupabaseServiceClient();
    const slug = `messages-probe-${Date.now()}`;
    const { data: project, error: projectError } = await service
      .from("projects")
      .insert({ name: "Messages probe", slug, status: "active" })
      .select("id")
      .single();
    if (projectError || !project) throw new Error("probe project setup failed");
    try {
      const { error: templateError } = await service.from("templates").insert({
        project_id: project.id,
        slug: "messages-probe",
        name: "Messages Probe",
        purpose: "notification",
        subject_template: "Hello {{name}}",
        html_template: "<p>Hi {{name}}</p>",
        text_template: "Hi {{name}}",
        variables_schema: { variables: [{ name: "name", type: "string", required: true }] },
        status: "published",
        version: 1,
        published_at: new Date().toISOString(),
      });
      if (templateError) throw new Error(`probe template setup failed: ${templateError.message}`);
      await upsertSmtpConfig(project.id, {
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "sender@example.com",
        pass: "probe-secret",
        from_email: "sender@example.com",
        from_name: "",
      });

      const first = await queueEmailSend(
        {
          projectId: project.id,
          to: "philipstar98@gmail.com",
          template: "messages-probe",
          variables: { name: "One" },
          idempotencyKey: "messages-1",
        },
        { provider: new StubProvider() },
      );
      const second = await queueEmailSend(
        {
          projectId: project.id,
          to: "philipstar98@gmail.com",
          template: "messages-probe",
          variables: { name: "Two" },
          idempotencyKey: "messages-2",
        },
        { provider: new StubProvider() },
      );

      const listed = await listMessages(project.id);
      expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);
      expect(listed[0].status).toBe("accepted");

      const detail = await getMessageDetail(project.id, first.id);
      expect(detail?.subject).toBe("Hello One");
      expect(detail?.timeline.map((event) => event.event_type)).toEqual(["queued", "accepted"]);
      expect(await getMessageDetail(project.id, "00000000-0000-0000-0000-000000000000")).toBeNull();
    } finally {
      await service.from("projects").delete().eq("id", project.id);
    }
  }, 180_000);
});
