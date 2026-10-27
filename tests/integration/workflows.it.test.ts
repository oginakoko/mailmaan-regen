import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProviderSendResult } from "../../src/lib/email/provider";
import type { DeliveryProvider } from "../../src/lib/email/send";
import { upsertSmtpConfig } from "../../src/lib/smtp/service";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import {
  createWorkflow,
  ingestEvent,
  reconcileProject,
  WorkflowError,
} from "../../src/lib/workflows/service";

/**
 * Durable integration coverage for the workflow engine (Day 6).
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
  calls = 0;
  async send(): Promise<ProviderSendResult> {
    this.calls += 1;
    return { providerMessageId: `<wf-stub-${this.calls}@example>`, status: "sent" };
  }
}

async function makeProbeProject(slugPrefix: string): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("projects")
    .insert({ name: "Workflow probe", slug: `${slugPrefix}-${Date.now()}`, status: "active" })
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
      slug: "wf-welcome",
      name: "WF Welcome",
      purpose: "welcome",
      subject_template: "Welcome {{firstName}}!",
      html_template: "<p>Hi {{firstName}}, welcome to {{product}}.</p>",
      text_template: "Hi {{firstName}}, welcome to {{product}}.",
      variables_schema: {
        variables: [
          { name: "firstName", type: "string", required: true },
          { name: "product", type: "string", required: true },
        ],
      },
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

describe.skipIf(!hasKeys)("workflow engine (integration)", () => {
  it("ingests once, matches, sends once, and replays idempotently", async () => {
    const projectId = await makeProbeProject("wf-probe");
    try {
      const templateId = await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      await createWorkflow(projectId, {
        name: "Welcome on signup",
        trigger_event: "user.signed_up",
        conditions: { all: [{ path: "data.email", exists: true }] },
        template_id: templateId,
        recipient_path: "data.email",
        variable_mappings: { firstName: { path: "data.firstName" }, product: { const: "Soko" } },
        delay_seconds: 0,
        enabled: true,
      });
      const provider = new StubProvider();
      const eventBody = {
        externalId: "evt-ext-1",
        name: "user.signed_up",
        data: { email: "philipstar98@gmail.com", firstName: "Asha" },
      };

      const first = await ingestEvent(projectId, eventBody, { provider });
      expect(first.replayed).toBe(false);
      expect(first.dispatch_status).toBe("dispatched");
      expect(first.runs).toHaveLength(1);
      expect(first.runs[0].status).toBe("completed");
      expect(first.runs[0].message_id).toBeTruthy();
      expect(provider.calls).toBe(1);

      const replay = await ingestEvent(projectId, eventBody, { provider });
      expect(replay.replayed).toBe(true);
      expect(replay.id).toBe(first.id);
      expect(replay.runs).toHaveLength(1);
      expect(provider.calls).toBe(1);

      const service = createSupabaseServiceClient();
      const { data: message } = await service
        .from("messages")
        .select("subject, recipient_email")
        .eq("id", first.runs[0].message_id!)
        .single();
      expect(message?.subject).toBe("Welcome Asha!");
      expect(message?.recipient_email).toBe("philipstar98@gmail.com");
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("skips on condition mismatch and fails closed on bad input", async () => {
    const projectId = await makeProbeProject("wf-probe-neg");
    try {
      const templateId = await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      await createWorkflow(projectId, {
        name: "Pro-only welcome",
        trigger_event: "user.signed_up",
        conditions: { all: [{ path: "data.plan", equals: "pro" }] },
        template_id: templateId,
        recipient_path: "data.email",
        variable_mappings: { firstName: { path: "data.firstName" }, product: { const: "Soko" } },
        delay_seconds: 0,
        enabled: true,
      });
      const provider = new StubProvider();

      const skipped = await ingestEvent(
        projectId,
        { name: "user.signed_up", data: { email: "philipstar98@gmail.com", firstName: "Bo", plan: "free" } },
        { provider },
      );
      expect(skipped.runs[0].status).toBe("skipped");
      expect(skipped.runs[0].error_code).toBe("conditions_mismatch");
      expect(provider.calls).toBe(0);

      await expect(
        ingestEvent(projectId, { name: "bad name!", data: {} }, { provider }),
      ).rejects.toBeInstanceOf(WorkflowError);
      await expect(
        ingestEvent(projectId, { name: "user.signed_up", data: [] }, { provider }),
      ).rejects.toBeInstanceOf(WorkflowError);
      await expect(
        createWorkflow(projectId, {
          name: "Bad",
          trigger_event: "user.signed_up",
          conditions: {},
          template_id: "00000000-0000-0000-0000-000000000000",
          recipient_path: "data.email",
          variable_mappings: {},
          delay_seconds: 0,
          enabled: true,
        }),
      ).rejects.toBeInstanceOf(WorkflowError);
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);

  it("holds delayed runs until the reconciler executes them past due", async () => {
    const projectId = await makeProbeProject("wf-probe-delay");
    try {
      const templateId = await makeProbeTemplate(projectId);
      await makeProbeSmtp(projectId);
      await createWorkflow(projectId, {
        name: "Delayed welcome",
        trigger_event: "user.signed_up",
        conditions: {},
        template_id: templateId,
        recipient_path: "data.email",
        variable_mappings: { firstName: { path: "data.firstName" }, product: { const: "Soko" } },
        delay_seconds: 3600,
        enabled: true,
      });
      const provider = new StubProvider();
      const ingested = await ingestEvent(
        projectId,
        { name: "user.signed_up", data: { email: "philipstar98@gmail.com", firstName: "Zed" } },
        { provider },
      );
      expect(ingested.runs[0].status).toBe("queued");
      expect(provider.calls).toBe(0);

      const early = await reconcileProject(projectId, { provider });
      expect(early).toEqual({ events_reconciled: 0, runs_executed: 0 });
      expect(provider.calls).toBe(0);

      const late = await reconcileProject(projectId, {
        provider,
        now: new Date(Date.now() + 3700 * 1000),
      });
      expect(late).toEqual({ events_reconciled: 0, runs_executed: 1 });
      expect(provider.calls).toBe(1);
      const service = createSupabaseServiceClient();
      const { data: run } = await service
        .from("workflow_runs")
        .select("status, message_id")
        .eq("id", ingested.runs[0].id)
        .single();
      expect(run?.status).toBe("completed");
      expect(run?.message_id).toBeTruthy();
    } finally {
      await createSupabaseServiceClient().from("projects").delete().eq("id", projectId);
    }
  }, 180_000);
});
