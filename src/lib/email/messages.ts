import "server-only";
import { createSupabaseServiceClient } from "../supabase/service";

/**
 * Dashboard message queries (Day 5 observability).
 *
 * Service-role reads for the dashboard; callers (dashboard server actions)
 * must already have verified project ownership via the user's session +
 * RLS. Lists are newest-first and capped.
 */

export interface MessageListItem {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  provider_message_id: string | null;
  error_code: string | null;
  created_at: string;
}

export interface MessageTimelineEvent {
  id: string;
  source: string;
  event_type: string;
  occurred_at: string | null;
  received_at: string;
  payload_redacted: Record<string, unknown>;
}

export interface MessageDetail extends MessageListItem {
  project_id: string;
  request_id?: string | null;
  template_id: string | null;
  template_version: number | null;
  from_email: string;
  provider: string;
  idempotency_key: string | null;
  error_message: string | null;
  queued_at: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  metadata: Record<string, unknown>;
  timeline: MessageTimelineEvent[];
}

export async function listMessages(projectId: string, limit = 50): Promise<MessageListItem[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("messages")
    .select("id, recipient_email, subject, status, provider_message_id, error_code, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(`Failed to list messages: ${error.message}`);
  return (data ?? []) as MessageListItem[];
}

export async function getMessageDetail(
  projectId: string,
  messageId: string,
): Promise<MessageDetail | null> {
  const service = createSupabaseServiceClient();
  const { data: message, error } = await service
    .from("messages")
    .select(
      "id, project_id, template_id, template_version, recipient_email, from_email, subject, status, provider, provider_message_id, idempotency_key, request_id, error_code, error_message, queued_at, accepted_at, delivered_at, failed_at, metadata, created_at",
    )
    .eq("id", messageId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load message: ${error.message}`);
  if (!message) return null;
  const { data: events, error: eventsError } = await service
    .from("message_events")
    .select("id, source, event_type, occurred_at, received_at, payload_redacted")
    .eq("message_id", messageId)
    .order("received_at", { ascending: true });
  if (eventsError) throw new Error(`Failed to load timeline: ${eventsError.message}`);
  return { ...(message as unknown as MessageDetail), timeline: (events ?? []) as MessageTimelineEvent[] };
}

/** Pure status presentation: honest labels, never "delivered" without proof. */
export function describeStatus(status: string): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (status) {
    case "accepted":
      return { label: "Accepted", tone: "ok" };
    case "queued":
    case "sending":
      return { label: status === "queued" ? "Queued" : "Sending", tone: "muted" };
    case "delivered":
      return { label: "Delivered", tone: "ok" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "bounced":
      return { label: "Bounced", tone: "bad" };
    case "complained":
      return { label: "Complained", tone: "warn" };
    case "delivery_delayed":
      return { label: "Delayed", tone: "warn" };
    case "suppressed":
      return { label: "Suppressed", tone: "warn" };
    default:
      return { label: status, tone: "muted" };
  }
}
