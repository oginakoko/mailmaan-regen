import "server-only";
import { createHash } from "node:crypto";
import { getServerEnv } from "../env";
import { getSmtpCredentialsForSend, SmtpNotConfiguredError } from "../smtp/service";
import { createSupabaseServiceClient } from "../supabase/service";
import { TemplateService } from "../templates/service";
import { renderTemplate, validateVariableValues } from "./render";
import {
  MailmaanDeliveryProvider,
  ProviderSendError,
  type ProviderSendResult,
} from "./provider";

/**
 * Send orchestration (Blueprint §7 `POST /v1/emails`, ADR-0002).
 *
 * Synchronous Day-4 pipeline (no queue worker yet): validate → resolve the
 * published template → render server-side (sanitized) → load the project's
 * SMTP mailbox → persist a queued message → deliver via the Mailmaan
 * service → persist accepted/failed + timeline events.
 *
 * Idempotency: (`project_id`, `Idempotency-Key`) is unique. Replaying the
 * same key with the same body returns the existing message without
 * re-sending; the same key with a different body is rejected.
 */

export class EmailSendError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "EmailSendError";
    this.code = code;
    this.status = status;
  }
}

export interface QueueEmailInput {
  projectId: string;
  to: string;
  template: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  from?: string;
  idempotencyKey: string;
}

export interface QueuedEmail {
  id: string;
  status: string;
  replayed: boolean;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface DeliveryProvider {
  send(input: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    text?: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from_email: string;
      from_name: string | null;
    };
  }): Promise<ProviderSendResult>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure request-hash for idempotency-key/body comparison. */
export function computeRequestHash(body: {
  to: string;
  template: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  from?: string;
}): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

/**
 * Demo guardrail (Blueprint §7: enforce allowed test recipients).
 * When MAILMAAN_TEST_RECIPIENTS is set, `to` must be allow-listed.
 */
export function assertAllowedRecipient(to: string): void {
  const allowlist = (getServerEnv().MAILMAAN_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return;
  if (!allowlist.includes(to.trim().toLowerCase())) {
    throw new EmailSendError(
      "recipient_not_allowed",
      "This project is in test mode: the recipient is not on the allowed list.",
      422,
    );
  }
}

function toQueuedEmail(row: Record<string, unknown>, replayed: boolean): QueuedEmail {
  return {
    id: String(row.id),
    status: String(row.status),
    replayed,
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
  };
}

export async function queueEmailSend(
  input: QueueEmailInput,
  deps?: { provider?: DeliveryProvider },
): Promise<QueuedEmail> {
  const to = input.to.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(to) || /[\r\n]/.test(to)) {
    throw new EmailSendError("invalid_recipient", "Recipient address is invalid.", 422);
  }
  const templateSlug = input.template.trim();
  if (!templateSlug) {
    throw new EmailSendError("template_missing", "Template slug is required.", 404);
  }
  if (!input.idempotencyKey.trim()) {
    throw new EmailSendError("idempotency_key_missing", "Idempotency-Key header is required.", 400);
  }
  assertAllowedRecipient(to);

  const variables = input.variables ?? {};
  if (typeof variables !== "object" || Array.isArray(variables)) {
    throw new EmailSendError("invalid_variables", "Variables must be an object.", 422);
  }
  const metadata = input.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new EmailSendError("invalid_metadata", "Metadata must be an object.", 422);
  }
  const requestHash = computeRequestHash({
    to,
    template: templateSlug,
    variables,
    metadata,
    ...(input.from ? { from: input.from } : {}),
  });

  const db = createSupabaseServiceClient();

  // Fast path: this key already ran. Same body → replay, different → reject.
  const { data: existing, error: existingError } = await db
    .from("messages")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(`Idempotency lookup failed: ${existingError.message}`);
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new EmailSendError(
        "idempotency_key_reused",
        "Idempotency-Key was already used with a different request body.",
        422,
      );
    }
    return toQueuedEmail(existing as Record<string, unknown>, true);
  }

  const template = await new TemplateService(db).getPublishedBySlug(input.projectId, templateSlug);
  if (!template) {
    throw new EmailSendError(
      "template_not_found",
      `Published template "${templateSlug}" was not found.`,
      404,
    );
  }
  const variableIssues = validateVariableValues(template.variables_schema, variables);
  if (variableIssues.length > 0) {
    throw new EmailSendError("invalid_variables", variableIssues.join("; "), 422);
  }
  let rendered: { subject: string; html: string; text: string };
  try {
    rendered = renderTemplate({
      subject: template.subject_template,
      html: template.html_template,
      text: template.text_template,
      values: variables,
    });
  } catch (error) {
    throw new EmailSendError(
      "template_render_failed",
      error instanceof Error ? error.message : "Template render failed.",
      422,
    );
  }

  let smtp: Awaited<ReturnType<typeof getSmtpCredentialsForSend>>;
  try {
    smtp = await getSmtpCredentialsForSend(input.projectId);
  } catch (error) {
    if (error instanceof SmtpNotConfiguredError) {
      throw new EmailSendError("smtp_not_configured", error.message, 422);
    }
    throw error;
  }

  const now = new Date().toISOString();
  const fromEmail = input.from?.trim() || smtp.from_email;
  if (!EMAIL_PATTERN.test(fromEmail) || /[\r\n]/.test(fromEmail)) {
    throw new EmailSendError("invalid_sender", "Sender address is invalid.", 422);
  }

  const { data: created, error: createError } = await db
    .from("messages")
    .insert({
      project_id: input.projectId,
      template_id: template.id,
      template_version: template.version,
      recipient_email: to,
      from_email: fromEmail,
      subject: rendered.subject,
      status: "queued",
      provider: "mailmaan",
      idempotency_key: input.idempotencyKey,
      request_hash: requestHash,
      queued_at: now,
      metadata: { ...metadata, template_slug: templateSlug },
    })
    .select("*")
    .single();

  if (createError || !created) {
    // Lost a race with a concurrent same-key request: resolve as a replay.
    if (createError?.code === "23505") {
      const { data: raced } = await db
        .from("messages")
        .select("*")
        .eq("project_id", input.projectId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced && raced.request_hash === requestHash) {
        return toQueuedEmail(raced as Record<string, unknown>, true);
      }
      throw new EmailSendError(
        "idempotency_key_reused",
        "Idempotency-Key was already used with a different request body.",
        422,
      );
    }
    throw new Error(`Failed to persist message: ${createError?.message ?? "unknown error"}`);
  }

  const messageId = created.id as string;
  await db.from("message_events").insert({
    project_id: input.projectId,
    message_id: messageId,
    source: "mailmaan",
    event_type: "queued",
    occurred_at: now,
    payload_redacted: { template_slug: templateSlug, template_version: template.version },
  });

  const provider = deps?.provider ?? new MailmaanDeliveryProvider();
  try {
    const result = await provider.send({
      to,
      ...(input.from ? { from: input.from } : {}),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      smtp: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        pass: smtp.pass,
        from_email: smtp.from_email,
        from_name: smtp.from_name,
      },
    });
    const acceptedAt = new Date().toISOString();
    const { data: accepted } = await db
      .from("messages")
      .update({
        status: "accepted",
        provider_message_id: result.providerMessageId,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq("id", messageId)
      .select("*")
      .single();
    await db.from("message_events").insert({
      project_id: input.projectId,
      message_id: messageId,
      source: "provider",
      provider_event_id: result.providerMessageId,
      event_type: "accepted",
      occurred_at: acceptedAt,
      payload_redacted: { provider: "mailmaan", provider_status: result.status },
    });
    return toQueuedEmail((accepted ?? created) as Record<string, unknown>, false);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const errorCode = error instanceof ProviderSendError ? error.code : "send_failed";
    const errorMessage = error instanceof Error ? error.message : "Delivery failed.";
    await db
      .from("messages")
      .update({
        status: "failed",
        error_code: errorCode,
        error_message: errorMessage,
        failed_at: failedAt,
        updated_at: failedAt,
      })
      .eq("id", messageId);
    await db.from("message_events").insert({
      project_id: input.projectId,
      message_id: messageId,
      source: "provider",
      event_type: "failed",
      occurred_at: failedAt,
      payload_redacted: { provider: "mailmaan", error_code: errorCode },
    });
    throw new EmailSendError(errorCode, errorMessage, 502);
  }
}
