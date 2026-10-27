import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProviderSendResult, UpstreamStatus } from "../../src/lib/email/provider";
import { queueEmailSend, type DeliveryProvider } from "../../src/lib/email/send";
import { syncMessageFromUpstream } from "../../src/lib/email/status-sync";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import { isSuppressed, suppressEmail } from "../../src/lib/suppression/service";
import { createWorkflow, ingestEvent, reconcileProject } from "../../src/lib/workflows/service";

/**
 * Suppression + stuck-run recovery (Day 9 hardening).
 *
 * Real Supabase project, stub delivery/status — no email is dispatched
 * and no upstream is contacted. Credentials come from `.env.local`
 * (never committed); the suite skips without them. Throwaway probe
 * projects are deleted afterwards.
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
  private readonly runTag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  async send(): Promise<ProviderSendResult> {
    this.calls += 1;
    // Unique per run: sync journal rows survive probe-project deletion
    // (audit trail), and the (provider, provider_event_id) unique key
    // would otherwise collide across reruns.
    return { providerMessageId: `<supp-stub-${this.runTag}-${this.calls}@example>`, status: "sent" };
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
    .insert({ name: "Suppression probe", slug: `${slugPrefix}-${Date.now()}`, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error("probe project setup failed");
  return data.id as string;
}

async function makeProbeTemplate(projectId: string): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("templates")
    .insert({
      project_id: projectId,
      slug: "supp-hello",
      name: "Supp Hello",
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
  if (error || !data) throw new Error(`probe template setup failed: ${error?.message}`);
  return data.id as string;
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

describe.skipIf(!hasKeys)("suppression (integration)", () => {
  it("stores suppressed sends without ever calling the provider", async () => {
    const projectId = await makeProbeProject("supp-probe");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      // Recipient must be allowlisted (MAILMAAN_TEST_RECIPIENTS); the
      // allowlist check runs before suppression at the send boundary.
      await suppressEmail(projectId, "PhilipStar98@Gmail.com", "manual");
      expect(await isSuppressed(projectId, "philipstar98@gmail.com")).toBe(true);
      expect(await isSuppressed(projectId, "other@example.com")).toBe(false);

      const provider = new StubProvider();
      const sent = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "supp-hello",
          variables: { name: "Suppressed" },
          idempotencyKey: "supp-1",
        },
        { provider },
      );
      expect(sent.status).toBe("suppressed");
      expect(sent.replayed).toBe(false);
      expect(provider.calls).toBe(0);

      const service = createSupabaseServiceClient();
      const { data: events } = await service
        .from("message_events")
        .select("event_type")
        .eq("message_id", sent.id)
        .order("received_at", { ascending: true });
      expect((events ?? []).map((event) => event.event_type)).toEqual(["suppressed"]);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("auto-suppresses on upstream bounce and blocks the next send", async () => {
    const projectId = await makeProbeProject("supp-probe-bounce");
    try {
      await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const provider = new StubProvider();
      const sent = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "supp-hello",
          variables: { name: "Bouncy" },
          idempotencyKey: "supp-bounce-1",
        },
        { provider },
      );
      const synced = await syncMessageFromUpstream(projectId, sent.id, {
        statusClient: new StubStatus({ status: "bounced", deliveredAt: null, openedAt: null, clickedAt: null }),
      });
      expect(synced.outcome).toBe("updated");
      expect(synced.status).toBe("bounced");
      expect(await isSuppressed(projectId, "philipstar98@gmail.com")).toBe(true);

      const blocked = await queueEmailSend(
        {
          projectId,
          to: "philipstar98@gmail.com",
          template: "supp-hello",
          variables: { name: "Again" },
          idempotencyKey: "supp-bounce-2",
        },
        { provider },
      );
      expect(blocked.status).toBe("suppressed");
      expect(provider.calls).toBe(1);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("resets stuck running runs and executes them exactly once", async () => {
    const projectId = await makeProbeProject("supp-probe-stuck");
    try {
      const templateId = await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      const workflow = await createWorkflow(projectId, {
        name: "Stuck workflow",
        trigger_event: "stuck.happened",
        conditions: {},
        template_id: templateId,
        recipient_path: "data.email",
        variable_mappings: { name: { path: "data.name" } },
        delay_seconds: 0,
        enabled: true,
      });
      const service = createSupabaseServiceClient();
      const { data: appEvent } = await service
        .from("app_events")
        .insert({
          project_id: projectId,
          event_name: "stuck.happened",
          payload: { data: { email: "philipstar98@gmail.com", name: "Stuck" } },
          dispatch_status: "dispatched",
        })
        .select("id")
        .single();
      const { data: run } = await service
        .from("workflow_runs")
        .insert({
          project_id: projectId,
          workflow_id: workflow.id,
          app_event_id: appEvent!.id,
          status: "running",
          started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        })
        .select("id")
        .single();

      const provider = new StubProvider();
      const result = await reconcileProject(projectId, { provider });
      expect(result.runs_reset).toBe(1);
      expect(result.runs_executed).toBe(1);
      expect(provider.calls).toBe(1);
      const { data: finished } = await service
        .from("workflow_runs")
        .select("status, message_id")
        .eq("id", run!.id)
        .single();
      expect(finished?.status).toBe("completed");
      expect(finished?.message_id).toBeTruthy();

      // A fresh running run (inside the crash window) is left alone.
      const ingested = await ingestEvent(
        projectId,
        { name: "stuck.happened", data: { email: "philipstar98@gmail.com", name: "Fresh" } },
        { provider },
      );
      expect(ingested.runs[0].status).toBe("completed");
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);
});
