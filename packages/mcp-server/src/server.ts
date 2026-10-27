import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MailmaanApiError, MailmaanClient } from "mailmaan-sdk";
import {
  handleConnectionCheck,
  handleDiagnoseMessage,
  handleGenerateTemplate,
  handleGetMessage,
  handleListTemplates,
  handleSendTestEmail,
  handleTrackEvent,
} from "./tools.js";

/**
 * Mailmaan MCP server (Day 7, stdio). Seven tools for AI coding agents:
 * connection check, list templates, generate template, send test email,
 * track event, get message, diagnose message. API failures surface with
 * code + request id.
 */

function textResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  if (error instanceof MailmaanApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: error.code,
              message: error.message,
              status: error.status,
              request_id: error.requestId,
              retryable: error.retryable,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      { type: "text" as const, text: `Unexpected tool failure: ${error instanceof Error ? error.message : String(error)}` },
    ],
    isError: true,
  };
}

export function createMailmaanServer(client: MailmaanClient): McpServer {
  const server = new McpServer({ name: "mailmaan", version: "0.1.0" });

  server.registerTool(
    "connection_check",
    { description: "Verify Mailmaan API reachability and that the API key authenticates.", inputSchema: {} },
    async () => {
      try {
        return textResult(await handleConnectionCheck(client));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_templates",
    { description: "List published email templates with their required variables.", inputSchema: {} },
    async () => {
      try {
        return textResult(await handleListTemplates(client));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "generate_template",
    {
      description:
        "Generate one template draft from the project brand for an email purpose (welcome, receipt, ...). Saved as a DRAFT for human review — publishing happens in the dashboard. Generate once per email type, then reuse the published slug for every user.",
      inputSchema: {
        purpose: z.string().describe("Template purpose, e.g. welcome, password_reset, receipt, notification, custom."),
      },
    },
    async (input) => {
      try {
        return textResult(await handleGenerateTemplate(client, { purpose: input.purpose }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "send_test_email",
    {
      description: "Send a test email through a published template. The server enforces the test-recipient allowlist.",
      inputSchema: {
        to: z.string().describe("Recipient email address."),
        template: z.string().describe("Published template slug."),
        variables: z.record(z.string(), z.unknown()).optional().describe("Template variables."),
        idempotencyKey: z.string().optional().describe("Stable key; reuse with the same body replays safely."),
      },
    },
    async (input) => {
      try {
        return textResult(
          await handleSendTestEmail(client, {
            to: input.to,
            template: input.template,
            variables: (input.variables ?? {}) as Record<string, unknown>,
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "track_event",
    {
      description: "Ingest an app event; matching enabled workflows send emails. External ids replay idempotently.",
      inputSchema: {
        id: z.string().optional().describe("Optional app-generated idempotency id."),
        name: z.string().describe("Event name, e.g. user.signed_up."),
        data: z.record(z.string(), z.unknown()).describe("Event payload."),
      },
    },
    async (input) => {
      try {
        return textResult(
          await handleTrackEvent(client, {
            ...(input.id ? { id: input.id } : {}),
            name: input.name,
            data: input.data as Record<string, unknown>,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      description: "Read a message with its sanitized event timeline.",
      inputSchema: { id: z.string().describe("Mailmaan message UUID.") },
    },
    async (input) => {
      try {
        return textResult(await handleGetMessage(client, { id: input.id }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "diagnose_message",
    {
      description: "Explain a message from stored evidence: timeline walk, error, likely cause, next checks.",
      inputSchema: { id: z.string().describe("Mailmaan message UUID.") },
    },
    async (input) => {
      try {
        return textResult(await handleDiagnoseMessage(client, { id: input.id }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
