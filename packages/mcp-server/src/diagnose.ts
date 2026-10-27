/**
 * Evidence-based message diagnosis (Day 7 MCP `diagnose_message`).
 *
 * Pure over the stored message + timeline: walks what actually happened,
 * names the error with its code, and suggests the next check. Never
 * invents causes — unknown codes say so.
 */

export interface DiagnosisInputMessage {
  id: string;
  status: string;
  recipient_email: string;
  subject: string;
  provider: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface DiagnosisInputEvent {
  event_type: string;
  source: string;
  occurred_at: string | null;
}

export interface MessageDiagnosis {
  message_id: string;
  status: string;
  delivered: boolean;
  summary: string;
  timeline_walk: string[];
  error: { code: string; message: string } | null;
  likely_cause: string | null;
  next_checks: string[];
}

const KNOWN_CAUSES: Array<{ match: RegExp; cause: string; next: string[] }> = [
  {
    match: /smtp_not_configured/,
    cause: "The project has no SMTP mailbox, so the send was blocked before delivery.",
    next: ["Add the project's mailbox on its dashboard SMTP page, then retry with a new idempotency key."],
  },
  {
    match: /delivery_rejected/,
    cause: "The delivery service refused the request (validation). Nothing was sent.",
    next: ["Check the SMTP mailbox values and template content for the rejected field."],
  },
  {
    match: /delivery_unauthorized|delivery_not_configured/,
    cause: "The Mailmaan server's own delivery credentials are missing or rejected.",
    next: ["Verify MAILMAAN_DELIVERY_BASE_URL and MAILMAAN_DELIVERY_API_KEY on the server."],
  },
  {
    match: /delivery_timeout|delivery_unavailable/,
    cause: "The delivery service failed or timed out (transient or upstream outage).",
    next: [
      "Retry with the SAME idempotency key (safe: replays instead of double-sending).",
      "If it persists, check the Mailmaan service status and the project's SMTP credentials.",
    ],
  },
  {
    match: /invalid_recipient/,
    cause: "The recipient address failed validation. Nothing was sent.",
    next: ["Fix the recipient address and retry with a new idempotency key."],
  },
  {
    match: /recipient_not_allowed/,
    cause: "Test-mode allowlist blocked this recipient.",
    next: ["Send to an allowlisted address or widen MAILMAAN_TEST_RECIPIENTS."],
  },
  {
    match: /template_not_found|template_unpublished/,
    cause: "The template is missing or not published.",
    next: ["Publish the template (or fix the slug) and retry with a new idempotency key."],
  },
  {
    match: /invalid_variables|variables_unresolvable|template_render_failed/,
    cause: "Template variables were missing, mistyped, or unresolvable.",
    next: ["Compare the sent variables against the template's required_variables and retry."],
  },
  {
    match: /idempotency_key_reused/,
    cause: "This idempotency key was already used with a different body.",
    next: ["Use a fresh key for the new body, or resend the exact original body to replay."],
  },
];

export function diagnoseMessage(
  message: DiagnosisInputMessage,
  timeline: DiagnosisInputEvent[],
): MessageDiagnosis {
  const walk = timeline.map(
    (event) => `${event.event_type} (via ${event.source}${event.occurred_at ? ` at ${event.occurred_at}` : ""})`,
  );
  const failed = ["failed", "bounced", "complained"].includes(message.status);
  const error =
    message.error_code || message.error_message
      ? { code: message.error_code ?? "unknown", message: message.error_message ?? "" }
      : null;

  let summary: string;
  if (message.status === "accepted") {
    summary =
      `Message ${message.id} to ${message.recipient_email} was accepted ` +
      `by ${message.provider}${message.provider_message_id ? ` (${message.provider_message_id})` : ""}. ` +
      `Delivery beyond acceptance is unconfirmed.`;
  } else if (message.status === "delivered") {
    summary = `Message ${message.id} to ${message.recipient_email} was delivered (provider-confirmed).`;
  } else if (message.status === "queued" || message.status === "sending") {
    summary = `Message ${message.id} to ${message.recipient_email} is ${message.status}; no provider outcome yet.`;
  } else if (failed) {
    summary =
      `Message ${message.id} to ${message.recipient_email} ${message.status}` +
      `${error ? `: ${error.code}${error.message ? ` — ${error.message}` : ""}` : ""}.`;
  } else {
    summary = `Message ${message.id} to ${message.recipient_email} is ${message.status}.`;
  }

  let likelyCause: string | null = null;
  let nextChecks: string[] = [];
  if (error) {
    const known = KNOWN_CAUSES.find((entry) => entry.match.test(error.code));
    if (known) {
      likelyCause = known.cause;
      nextChecks = known.next;
    } else {
      likelyCause = null;
      nextChecks = [
        "This error code has no documented cause yet — inspect the timeline and server logs with the request id.",
      ];
    }
  } else if (message.status === "accepted") {
    nextChecks = ["Run a provider sync for a fresh upstream read; absence of failure events means no news, not delivery."];
  }

  return {
    message_id: message.id,
    status: message.status,
    delivered: message.status === "delivered",
    summary,
    timeline_walk: walk,
    error,
    likely_cause: likelyCause,
    next_checks: nextChecks,
  };
}
