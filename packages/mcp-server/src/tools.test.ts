import { describe, expect, it } from "vitest";
import type { MailmaanClient } from "mailmaan-sdk";
import {
  handleConnectionCheck,
  handleDiagnoseMessage,
  handleGenerateTemplate,
  handleGetMessage,
  handleListTemplates,
  handleSendTestEmail,
  handleTrackEvent,
} from "./tools";

function stubClient(overrides: Record<string, unknown>): MailmaanClient {
  return overrides as unknown as MailmaanClient;
}

describe("MCP tool handlers", () => {
  it("checks the connection with auth proof", async () => {
    const client = stubClient({
      health: async () => ({ status: "ok", version: "0.1.0", timestamp: "t" }),
      listTemplates: async () => ({ templates: [{ slug: "welcome" }, { slug: "receipt" }] }),
    });
    const result = await handleConnectionCheck(client);
    expect(result.ok).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.published_templates).toBe(2);
  });

  it("lists templates with required variables only", async () => {
    const client = stubClient({
      listTemplates: async () => ({
        templates: [
          { slug: "welcome", name: "Welcome", purpose: "welcome", version: 1, required_variables: ["firstName"], variables: [] },
        ],
      }),
    });
    const result = await handleListTemplates(client);
    expect(result.templates).toEqual([
      { slug: "welcome", name: "Welcome", purpose: "welcome", version: 1, required_variables: ["firstName"] },
    ]);
  });

  it("generates one template draft per purpose", async () => {
    let seen: unknown;
    const client = stubClient({
      generateTemplate: async (purpose: unknown) => {
        seen = purpose;
        return { template: { slug: "welcome", status: "draft" }, generated_by: "fallback" };
      },
    });
    const result = (await handleGenerateTemplate(client, { purpose: "welcome" })) as {
      template: { status: string };
    };
    expect(seen).toBe("welcome");
    expect(result.template.status).toBe("draft");
  });

  it("sends test email tagged with the MCP source", async () => {
    let seen: unknown;
    const client = stubClient({
      sendEmail: async (input: unknown) => {
        seen = input;
        return { id: "m1", status: "accepted" };
      },
    });
    await handleSendTestEmail(client, { to: "a@example.com", template: "welcome", variables: { x: 1 } });
    expect(seen).toMatchObject({
      to: "a@example.com",
      template: "welcome",
      metadata: { source: "mcp-send-test" },
    });
  });

  it("tracks events and summarizes runs", async () => {
    const client = stubClient({
      trackEvent: async () => ({
        id: "e1",
        dispatch_status: "dispatched",
        replayed: false,
        runs: [{ workflow_id: "w1", status: "completed", message_id: "m1", error_code: null }],
      }),
    });
    const result = await handleTrackEvent(client, { name: "user.signed_up", data: {} });
    expect(result).toMatchObject({ id: "e1", dispatch_status: "dispatched", replayed: false });
    expect((result as { runs: unknown[] }).runs).toHaveLength(1);
  });

  it("gets messages and diagnoses failures from evidence", async () => {
    const payload = {
      message: {
        id: "m9",
        status: "failed",
        recipient_email: "a@example.com",
        subject: "Hi",
        provider: "mailmaan",
        provider_message_id: null,
        error_code: "smtp_not_configured",
        error_message: "No mailbox.",
      },
      timeline: [{ event_type: "queued", source: "mailmaan", occurred_at: null }],
    };
    const client = stubClient({ getMessage: async () => payload });
    expect(await handleGetMessage(client, { id: "m9" })).toEqual(payload);
    const diagnosis = (await handleDiagnoseMessage(client, { id: "m9" })) as { likely_cause: string };
    expect(diagnosis.likely_cause).toContain("no SMTP mailbox");
  });
});
