import "server-only";
import { getServerEnv } from "../env";

/**
 * Delivery provider (ADR-0002, Blueprint §4C/§7 Day 4).
 *
 * Exactly one implementation: the deployed Mailmaan service
 * (`POST /v1/send`), using per-request SMTP credentials plus pre-rendered
 * raw HTML. Request bodies and SMTP secrets are never logged.
 */

export interface DeliverySmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_email: string;
  from_name: string | null;
}

export interface ProviderSendInput {
  to: string;
  /** Optional explicit From header; defaults to the SMTP from identity. */
  from?: string;
  subject: string;
  html: string;
  text?: string;
  smtp: DeliverySmtp;
}

export interface ProviderSendResult {
  providerMessageId: string;
  status: string;
}

export class ProviderSendError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly upstreamStatus: number | null;
  constructor(code: string, message: string, opts?: { retryable?: boolean; upstreamStatus?: number | null }) {
    super(message);
    this.name = "ProviderSendError";
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.upstreamStatus = opts?.upstreamStatus ?? null;
  }
}

export const DELIVERY_TIMEOUT_MS = 30_000;

export function getDeliveryConfig(): { baseUrl: string; apiKey: string } {
  const env = getServerEnv();
  if (!env.MAILMAAN_DELIVERY_BASE_URL || !env.MAILMAAN_DELIVERY_API_KEY) {
    throw new ProviderSendError(
      "delivery_not_configured",
      "MAILMAAN_DELIVERY_BASE_URL and MAILMAAN_DELIVERY_API_KEY are required to send. Set them in .env.local (server-only, never commit).",
    );
  }
  return { baseUrl: env.MAILMAAN_DELIVERY_BASE_URL, apiKey: env.MAILMAAN_DELIVERY_API_KEY };
}

/**
 * Pure body builder for the old service's /v1/send contract (raw-HTML mode
 * + per-request SMTP). Unit-tested; the live shape is verified in ADR-0002.
 */
export function buildMailmaanSendBody(input: ProviderSendInput): Record<string, unknown> {
  return {
    to: input.to,
    ...(input.from ? { from: input.from } : {}),
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    smtp: {
      host: input.smtp.host,
      port: input.smtp.port,
      secure: input.smtp.secure,
      user: input.smtp.user,
      pass: input.smtp.pass,
      from_email: input.smtp.from_email,
      ...(input.smtp.from_name ? { from_name: input.smtp.from_name } : {}),
    },
  };
}

/** Pure upstream-error mapper. Never includes request secrets. */
export function mapMailmaanError(status: number, payload: unknown): ProviderSendError {
  const message =
    typeof payload === "object" && payload !== null && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Delivery failed with status ${status}.`;
  if (status === 401 || status === 403) {
    return new ProviderSendError("delivery_unauthorized", "Delivery service rejected our API key.", {
      upstreamStatus: status,
    });
  }
  if (status === 400 || status === 422) {
    return new ProviderSendError("delivery_rejected", `Delivery service rejected the send: ${message}`, {
      upstreamStatus: status,
    });
  }
  if (status === 404) {
    return new ProviderSendError("delivery_not_found", `Delivery service route missing: ${message}`, {
      upstreamStatus: status,
    });
  }
  if (status === 429 || status >= 500) {
    return new ProviderSendError("delivery_unavailable", `Delivery service unavailable: ${message}`, {
      retryable: true,
      upstreamStatus: status,
    });
  }
  return new ProviderSendError("delivery_failed", message, { upstreamStatus: status });
}

export interface UpstreamStatus {
  status: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
}

export type FetchImpl = typeof fetch;

export class MailmaanDeliveryProvider {
  private fetchImpl: FetchImpl;
  private timeoutMs: number;

  constructor(opts?: { fetchImpl?: FetchImpl; timeoutMs?: number }) {
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.timeoutMs = opts?.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const { baseUrl, apiKey } = getDeliveryConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/v1/send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "user-agent": "mailmaan-regen/0.1.0",
        },
        body: JSON.stringify(buildMailmaanSendBody(input)),
        signal: controller.signal,
      });
    } catch (error) {
      throw new ProviderSendError(
        "delivery_timeout",
        error instanceof Error && error.name === "AbortError"
          ? `Delivery timed out after ${this.timeoutMs}ms.`
          : `Delivery request failed: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw mapMailmaanError(response.status, payload);
    }
    const record = (payload ?? {}) as Record<string, unknown>;
    const providerMessageId =
      typeof record.message_id === "string"
        ? record.message_id
        : typeof record.id === "string"
          ? record.id
          : null;
    if (!providerMessageId) {
      throw new ProviderSendError(
        "delivery_bad_response",
        "Delivery service returned success without a message id.",
        { upstreamStatus: response.status },
      );
    }
    return {
      providerMessageId,
      status: typeof record.status === "string" ? record.status : "sent",
    };
  }

  /**
   * Reads upstream status for a provider message id. Returns null when the
   * provider has no record (e.g. sends from before status recording
   * existed) — callers must treat that as "unknown", never as a state.
   */
  async getMessageStatus(providerMessageId: string): Promise<UpstreamStatus | null> {
    const { baseUrl, apiKey } = getDeliveryConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${baseUrl}/v1/messages/${encodeURIComponent(providerMessageId)}/status`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "user-agent": "mailmaan-regen/0.1.0",
          },
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new ProviderSendError(
        "delivery_timeout",
        error instanceof Error && error.name === "AbortError"
          ? `Delivery status timed out after ${this.timeoutMs}ms.`
          : `Delivery status request failed: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 404) return null;
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw mapMailmaanError(response.status, payload);
    }
    const record = (payload ?? {}) as Record<string, unknown>;
    const asStringOrNull = (value: unknown): string | null =>
      typeof value === "string" ? value : null;
    return {
      status: typeof record.status === "string" ? record.status : "unknown",
      deliveredAt: asStringOrNull(record.delivered_at),
      openedAt: asStringOrNull(record.opened_at),
      clickedAt: asStringOrNull(record.clicked_at),
    };
  }
}
