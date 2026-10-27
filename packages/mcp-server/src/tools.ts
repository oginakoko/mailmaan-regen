import { MailmaanClient } from "mailmaan-sdk";
import { diagnoseMessage } from "./diagnose.js";

/**
 * MCP tool handlers (Day 7). Each returns JSON-able data and throws
 * `MailmaanApiError` on API failures; `server.ts` wires them to MCP tools.
 * Handlers take the client as an argument so tests inject stubs.
 */

export async function handleConnectionCheck(client: MailmaanClient): Promise<{
  ok: boolean;
  api: { status: string; version: string; timestamp: string };
  authenticated: boolean;
  published_templates: number;
}> {
  const health = await client.health();
  const { templates } = await client.listTemplates();
  return {
    ok: true,
    api: health,
    authenticated: true,
    published_templates: templates.length,
  };
}

export async function handleListTemplates(client: MailmaanClient): Promise<{
  templates: Array<{
    slug: string;
    name: string;
    purpose: string;
    version: number;
    required_variables: string[];
  }>;
}> {
  const { templates } = await client.listTemplates();
  return {
    templates: templates.map((template) => ({
      slug: template.slug,
      name: template.name,
      purpose: template.purpose,
      version: template.version,
      required_variables: template.required_variables,
    })),
  };
}

export async function handleGenerateTemplate(
  client: MailmaanClient,
  input: { purpose: string },
): Promise<unknown> {
  return client.generateTemplate(input.purpose);
}

export async function handleSendTestEmail(
  client: MailmaanClient,
  input: { to: string; template: string; variables?: Record<string, unknown>; idempotencyKey?: string },
): Promise<unknown> {
  return client.sendEmail({
    to: input.to,
    template: input.template,
    variables: input.variables ?? {},
    metadata: { source: "mcp-send-test" },
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
}

export async function handleTrackEvent(
  client: MailmaanClient,
  input: { id?: string; name: string; data: Record<string, unknown> },
): Promise<unknown> {
  const tracked = await client.trackEvent(input);
  return {
    id: tracked.id,
    dispatch_status: tracked.dispatch_status,
    replayed: tracked.replayed,
    runs: tracked.runs.map((run) => ({
      workflow_id: run.workflow_id,
      status: run.status,
      message_id: run.message_id,
      error_code: run.error_code,
    })),
  };
}

export async function handleGetMessage(
  client: MailmaanClient,
  input: { id: string },
): Promise<unknown> {
  return client.getMessage(input.id);
}

export async function handleDiagnoseMessage(
  client: MailmaanClient,
  input: { id: string },
): Promise<unknown> {
  const { message, timeline } = await client.getMessage(input.id);
  return diagnoseMessage(
    {
      id: message.id,
      request_id: message.request_id ?? null,
      status: message.status,
      recipient_email: message.recipient_email,
      subject: message.subject,
      provider: message.provider,
      provider_message_id: message.provider_message_id,
      error_code: message.error_code,
      error_message: message.error_message,
    },
    timeline.map((event) => ({
      event_type: event.event_type,
      source: event.source,
      occurred_at: event.occurred_at,
    })),
  );
}
