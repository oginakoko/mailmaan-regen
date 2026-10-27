import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProviderSendError, type ProviderSendResult } from "../../src/lib/email/provider";
import { queueEmailSend, type DeliveryProvider } from "../../src/lib/email/send";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";

/**
 * Durable integration coverage for the send pipeline (Day 4).
 *
 * Runs against the REAL Supabase test project with a STUB delivery
 * provider — no email is dispatched. Credentials come from `.env.local`
 * (never committed, values never printed); the suite skips without them.
 * Throwaway probe projects are deleted afterwards (cascade removes
 * messages, events, templates, and SMTP rows).
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
  calls = 0;
  failWith: ProviderSendError | null = null;

  async send(): Promise<ProviderSendResult> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return { providerMessageId: `<stub-${this.calls}@example>`, status: "sent" };
  }
}

async function makeProbeProject(slugPrefix: string): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("projects")
    .insert({ name: "Send probe", slug: `${slugPrefix}-${Date.now()}`, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error("probe project setup failed");
  return data.id as string;
}

async function makeProbeTemplate(projectId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("templates").insert({
    project_id: projectId,
    slug: "probe-welcome",
    name: "Probe Welcome",
    purpose: "welcome",
    subject_template: "Welcome, {{name}}!",
    html_template: "<p>Hello {{name}}, welcome to {{app}}.</p>",
    text_template: "Hello {{name}}, welcome to {{app}}.",
    variables_schema: {
      variables: [
        { name: "name", type: "string", required: true },
        { name: "app", type: "string", required: true },
      ],
    },
    status: "published",
    version: 1,
    published_at: new Date().toISOString(),
  });
  if (error) throw new Error(`probe template setup failed: ${error.message}`);
}

async function makeProbeSmtp(projectId: string): Promise<void> {
  await upsertSmtpConfig(projectId, {
    host: "smtp.example.com",
    port: "587",
    secure: false,
    user: "sender@example.com",
    pass: "probe-secret",
    from_email: "sender@example.com",
    from_name: "Probe",
  });
}

describe.skipIf(!hasKeys)("send pipeline (integration)", () => {
  it("sends once, replays idempotently, and rejects key reuse with a new body", async () => {
    const projectId = await makeProbeProject("send-probe");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const provider = new StubProvider();
      const base = {
        projectId,
        to: "philipstar98@gmail.com",
        template: "probe-welcome",
        variables: { name: "Asha", app: "Soko" },
        metadata: {},
      };

      const first = await queueEmailSend({ ...base, idempotencyKey: "key-1" }, { provider });
      expect(first.status).toBe("accepted");
      expect(first.replayed).toBe(false);
      expect(first.provider_message_id).toBe("<stub-1@example>");
      expect(provider.calls).toBe(1);

      const replay = await queueEmailSend({ ...base, idempotencyKey: "key-1" }, { provider });
      expect(replay.replayed).toBe(true);
      expect(replay.id).toBe(first.id);
      expect(provider.calls).toBe(1);

      await expect(
        queueEmailSend(
          { ...base, variables: { name: "Bo", app: "Soko" }, idempotencyKey: "key-1" },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "idempotency_key_reused", status: 422 });
      expect(provider.calls).toBe(1);

      const service = createSupabaseServiceClient();
      const { data: events } = await service
        .from("message_events")
        .select("event_type")
        .eq("message_id", first.id)
        .order("received_at", { ascending: true });
      expect((events ?? []).map((event) => event.event_type)).toEqual(["queued", "accepted"]);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("rejects unknown templates, bad variables, and unlisted recipients", async () => {
    const projectId = await makeProbeProject("send-probe-neg");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const provider = new StubProvider();

      await expect(
        queueEmailSend(
          {
            projectId,
            to: "philipstar98@gmail.com",
            template: "no-such-template",
            variables: {},
            idempotencyKey: "neg-1",
          },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "template_not_found", status: 404 });

      await expect(
        queueEmailSend(
          {
            projectId,
            to: "philipstar98@gmail.com",
            template: "probe-welcome",
            variables: { name: "Asha" },
            idempotencyKey: "neg-2",
          },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "invalid_variables", status: 422 });

      await expect(
        queueEmailSend(
          {
            projectId,
            to: "not-an-email",
            template: "probe-welcome",
            variables: {},
            idempotencyKey: "neg-3",
          },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "invalid_recipient", status: 422 });

      expect(provider.calls).toBe(0);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("blocks sends without SMTP and persists provider failures honestly", async () => {
    const projectId = await makeProbeProject("send-probe-fail");
    try {
      await makeProbeTemplate(projectId);
      const provider = new StubProvider();

      await expect(
        queueEmailSend(
          {
            projectId,
            to: "philipstar98@gmail.com",
            template: "probe-welcome",
            variables: { name: "Asha", app: "Soko" },
            idempotencyKey: "fail-1",
          },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "smtp_not_configured", status: 422 });

      await makeProbeSmtp(projectId);
      provider.failWith = new ProviderSendError("delivery_rejected", "upstream refused", {
        upstreamStatus: 422,
      });
      await expect(
        queueEmailSend(
          {
            projectId,
            to: "philipstar98@gmail.com",
            template: "probe-welcome",
            variables: { name: "Asha", app: "Soko" },
            idempotencyKey: "fail-2",
          },
          { provider },
        ),
      ).rejects.toMatchObject({ code: "delivery_rejected", status: 502 });

      const service = createSupabaseServiceClient();
      const { data: failed } = await service
        .from("messages")
        .select("status, error_code, provider_message_id")
        .eq("project_id", projectId)
        .eq("idempotency_key", "fail-2")
        .single();
      expect(failed?.status).toBe("failed");
      expect(failed?.error_code).toBe("delivery_rejected");
      expect(failed?.provider_message_id).toBeNull();

      // Failed sends replay as failures (Stripe/Resend rule): retries must
      // use a fresh key. The provider is never called again for fail-2.
      provider.failWith = null;
      const callsBefore = provider.calls;
      const replayed = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "probe-welcome",
          variables: { name: "Asha", app: "Soko" },
          idempotencyKey: "fail-2",
        },
        { provider },
      );
      expect(replayed.replayed).toBe(true);
      expect(replayed.status).toBe("failed");
      expect(replayed.error_code).toBe("delivery_rejected");
      expect(provider.calls).toBe(callsBefore);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);
});
