import "server-only";
import { createSupabaseServiceClient } from "../supabase/service";
import { suppressEmail } from "../suppression/service";
import { MailmaanDeliveryProvider, type UpstreamStatus } from "./provider";

/**
 * Upstream status sync (Day 5 observability, ADR-0002).
 *
 * The delivery provider emits no signed webhooks for v1 sends, so provider
 * truth arrives by reading back upstream status per message. Every read is
 * journaled into `webhook_events` (dedupe key
 * `sync:<provider_message_id>:<upstream_status>`) and genuine state changes
 * append timeline events plus canonical updates.
 *
 * Truthfulness rules (tested):
 * - Upstream `sent` means "accepted by the provider's SMTP path" — it
 *   CONFIRMS our `accepted` state and must never set `delivered_at`.
 *   `delivered_at` has no evidence source and stays null.
 * - Unknown upstream statuses and unknown (404) provider ids change
 *   nothing and are reported as such.
 * - Terminal states (`failed`, `bounced`, `complained`, `delivered`)
 *   never move.
 */

export class MessageSyncError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "MessageSyncError";
    this.code = code;
    this.status = status;
  }
}

export type SyncOutcome = "updated" | "confirmed" | "duplicate" | "ignored" | "unknown";

export interface SyncResult {
  message_id: string;
  status: string;
  upstream: UpstreamStatus | null;
  outcome: SyncOutcome;
}

export type StatusClient = Pick<MailmaanDeliveryProvider, "getMessageStatus">;

const TERMINAL_STATES = new Set(["failed", "bounced", "complained", "delivered"]);

/** Pure upstream → canonical mapping. Null means "no state change". */
export function mapUpstreamStatus(upstreamStatus: string): string | null {
  const normalized = upstreamStatus.trim().toLowerCase();
  switch (normalized) {
    case "failed":
      return "failed";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "delayed":
    case "delivery_delayed":
      return "delivery_delayed";
    default:
      return null;
  }
}

export function isTerminalState(status: string): boolean {
  return TERMINAL_STATES.has(status);
}

export async function syncMessageFromUpstream(
  projectId: string,
  messageId: string,
  deps?: { statusClient?: StatusClient },
): Promise<SyncResult> {
  const db = createSupabaseServiceClient();
  const { data: message, error } = await db
    .from("messages")
    .select("id, status, provider_message_id, recipient_email")
    .eq("id", messageId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Message lookup failed: ${error.message}`);
  if (!message) {
    throw new MessageSyncError("message_not_found", "Message not found.", 404);
  }
  if (!message.provider_message_id) {
    throw new MessageSyncError(
      "sync_no_provider_id",
      "Message was never accepted upstream, so there is no provider status to read.",
      422,
    );
  }

  const client = deps?.statusClient ?? new MailmaanDeliveryProvider();
  const upstream = await client.getMessageStatus(message.provider_message_id);
  if (!upstream) {
    return { message_id: message.id, status: message.status, upstream: null, outcome: "unknown" };
  }

  const providerEventId = `sync:${message.provider_message_id}:${upstream.status}`;
  const { error: journalError } = await db.from("webhook_events").insert({
    project_id: projectId,
    provider: "mailmaan",
    provider_event_id: providerEventId,
    event_type: `upstream.${upstream.status}`,
    message_id: message.id,
    mapping_outcome: "pending",
    processing_status: "received",
  });
  if (journalError) {
    if (journalError.code === "23505") {
      return {
        message_id: message.id,
        status: message.status,
        upstream,
        outcome: "duplicate",
      };
    }
    throw new Error(`Failed to journal provider event: ${journalError.message}`);
  }

  const normalizedUpstream = upstream.status.trim().toLowerCase();
  if (["queued", "sending", "accepted", "sent"].includes(normalizedUpstream)) {
    // Upstream agrees the message is in flight or accepted: confirm without
    // touching canonical state (and never setting delivered_at).
    await db
      .from("webhook_events")
      .update({ mapping_outcome: "confirmed", processing_status: "processed" })
      .eq("provider", "mailmaan")
      .eq("provider_event_id", providerEventId);
    return { message_id: message.id, status: message.status, upstream, outcome: "confirmed" };
  }

  const canonical = mapUpstreamStatus(upstream.status);
  if (!canonical || isTerminalState(message.status)) {
    const outcome = !canonical ? "unmapped" : "already_terminal";
    await db
      .from("webhook_events")
      .update({ mapping_outcome: outcome, processing_status: "ignored" })
      .eq("provider", "mailmaan")
      .eq("provider_event_id", providerEventId);
    return { message_id: message.id, status: message.status, upstream, outcome: "ignored" };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: canonical,
    error_code: `upstream_${upstream.status}`,
    updated_at: now,
  };
  if (canonical === "failed") {
    patch.failed_at = now;
    patch.error_message = "Provider reported the message as failed.";
  }
  await db.from("messages").update(patch).eq("id", message.id);
  await db.from("message_events").insert({
    project_id: projectId,
    message_id: message.id,
    source: "provider",
    provider_event_id: providerEventId,
    event_type: canonical,
    occurred_at: upstream.deliveredAt ?? now,
    payload_redacted: { provider: "mailmaan", upstream_status: upstream.status },
  });
  await db
    .from("webhook_events")
    .update({ mapping_outcome: `state:${canonical}`, processing_status: "processed" })
    .eq("provider", "mailmaan")
    .eq("provider_event_id", providerEventId);

  // Bounces and complaints suppress future sends to the recipient.
  // Plain failures do not (they may be transient or credential issues).
  if ((canonical === "bounced" || canonical === "complained") && message.recipient_email) {
    await suppressEmail(
      projectId,
      String(message.recipient_email),
      canonical === "bounced" ? "hard_bounce" : "complaint",
      { sourceMessageId: message.id, note: `upstream_${upstream.status}` },
    );
  }

  return { message_id: message.id, status: canonical, upstream, outcome: "updated" };
}
