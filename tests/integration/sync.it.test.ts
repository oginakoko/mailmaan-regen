import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProviderSendError, type ProviderSendResult } from "../../src/lib/email/provider";
import { queueEmailSend, type DeliveryProvider } from "../../src/lib/email/send";
import {
  MessageSyncError,
  syncMessageFromUpstream,
} from "../../src/lib/email/status-sync";
import type { UpstreamStatus } from "../../src/lib/email/provider";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";

/**
 * Durable integration coverage for upstream status sync (Day 5).
 *
 * Real Supabase project, stub delivery + stub status clients — no email is
 * dispatched and no upstream is contacted. Credentials come from `.env.local`
 * (never committed); the suite skips without them. Throwaway probe projects
 * are deleted afterwards.
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
    return { providerMessageId: "<sync-stub@example>", status: "sent" };
  }
}

class StubStatus {
  constructor(private response: UpstreamStatus | null) {}
  async getMessageStatus(): Promise<UpstreamStatus | null> {
    return this.response;
  }
}

async function makeProbeProject(slugPrefix: string): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("projects")
    .insert({ name: "Sync probe", slug: `${slugPrefix}-${Date.now()}`, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error("probe project setup failed");
  return data.id as string;
}

async function makeProbeTemplate(projectId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("templates").insert({
    project_id: projectId,
    slug: "sync-probe",
    name: "Sync Probe",
    purpose: "notification",
    subject_template: "Sync {{name}}",
    html_template: "<p>Hi {{name}}</p>",
    text_template: "Hi {{name}}",
    variables_schema: { variables: [{ name: "name", type: "string", required: true }] },
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
    from_name: "",
  });
}

describe.skipIf(!hasKeys)("status sync (integration)", () => {
  it("confirms sent without claiming delivery, dedupes, and applies bounces", async () => {
    const projectId = await makeProbeProject("sync-probe");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const sent = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "sync-probe",
          variables: { name: "Asha" },
          idempotencyKey: "sync-1",
        },
        { provider: new StubProvider() },
      );
      const service = createSupabaseServiceClient();

      const confirmed = await syncMessageFromUpstream(projectId, sent.id, {
        statusClient: new StubStatus({
          status: "sent",
          deliveredAt: "2026-10-27T10:05:21Z",
          openedAt: null,
          clickedAt: null,
        }),
      });
      expect(confirmed.outcome).toBe("confirmed");
      expect(confirmed.status).toBe("accepted");
      const { data: afterConfirm } = await service
        .from("messages")
        .select("status, delivered_at")
        .eq("id", sent.id)
        .single();
      // Upstream `sent` must never become a delivered claim.
      expect(afterConfirm?.status).toBe("accepted");
      expect(afterConfirm?.delivered_at).toBeNull();

      const duplicate = await syncMessageFromUpstream(projectId, sent.id, {
        statusClient: new StubStatus({ status: "sent", deliveredAt: null, openedAt: null, clickedAt: null }),
      });
      expect(duplicate.outcome).toBe("duplicate");

      const bounced = await syncMessageFromUpstream(projectId, sent.id, {
        statusClient: new StubStatus({ status: "bounced", deliveredAt: null, openedAt: null, clickedAt: null }),
      });
      expect(bounced.outcome).toBe("updated");
      expect(bounced.status).toBe("bounced");
      const { data: events } = await service
        .from("message_events")
        .select("event_type")
        .eq("message_id", sent.id)
        .order("received_at", { ascending: true });
      expect((events ?? []).map((event) => event.event_type)).toEqual([
        "queued",
        "accepted",
        "bounced",
      ]);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("reports unknown upstream as unknown and refuses provider-less messages", async () => {
    const projectId = await makeProbeProject("sync-probe-neg");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const sent = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "sync-probe",
          variables: { name: "Asha" },
          idempotencyKey: "sync-neg-1",
        },
        { provider: new StubProvider() },
      );

      const unknown = await syncMessageFromUpstream(projectId, sent.id, {
        statusClient: new StubStatus(null),
      });
      expect(unknown.outcome).toBe("unknown");
      expect(unknown.upstream).toBeNull();
      expect(unknown.status).toBe("accepted");
      const service = createSupabaseServiceClient();
      const { count } = await service
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      expect(count).toBe(0);

      const failingProvider: DeliveryProvider = {
        send: async () => {
          throw new ProviderSendError("delivery_rejected", "upstream refused");
        },
      };
      await expect(
        queueEmailSend(
          {
            projectId,
            to: "philipstar98@gmail.com",
            template: "sync-probe",
            variables: { name: "Asha" },
            idempotencyKey: "sync-neg-2",
          },
          { provider: failingProvider },
        ),
      ).rejects.toMatchObject({ status: 502 });
      const { data: failed } = await service
        .from("messages")
        .select("id")
        .eq("project_id", projectId)
        .eq("idempotency_key", "sync-neg-2")
        .single();
      await expect(
        syncMessageFromUpstream(projectId, failed!.id, {
          statusClient: new StubStatus({ status: "sent", deliveredAt: null, openedAt: null, clickedAt: null }),
        }),
      ).rejects.toBeInstanceOf(MessageSyncError);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);
});
