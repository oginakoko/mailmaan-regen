/**
 * Mailmaan TypeScript SDK (Day 7) — typed client over the public API.
 *
 * Server-side use: construct with a Mailmaan API key (never expose it to
 * browsers). All methods throw `MailmaanApiError` on API failures.
 */

export interface MailmaanClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MailmaanApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  constructor(
    code: string,
    message: string,
    opts?: { status?: number | null; requestId?: string | null; retryable?: boolean },
  ) {
    super(message);
    this.name = "MailmaanApiError";
    this.code = code;
    this.status = opts?.status ?? null;
    this.requestId = opts?.requestId ?? null;
    this.retryable = opts?.retryable ?? false;
  }
}

export interface SendEmailInput {
  to: string;
  template: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  from?: string;
  /** Stable caller key; auto-generated when omitted. */
  idempotencyKey?: string;
}

export interface SentEmail {
  id: string;
  status: string;
  status_url: string;
  replayed: boolean;
  provider_message_id?: string;
  error_code?: string;
}

export interface TemplateSummary {
  id: string;
  slug: string;
  name: string;
  purpose: string;
  version: number;
  required_variables: string[];
  variables: Array<{ name: string; type: string; required: boolean; example?: unknown }>;
}

export interface GeneratedTemplateDraft {
  template: TemplateSummary & { status: string };
  generated_by: string;
  model: string | null;
  notes: string | null;
  dashboard_url: string;
}

export interface TimelineEvent {
  id: string;
  source: string;
  event_type: string;
  occurred_at: string | null;
  received_at: string;
  payload_redacted: Record<string, unknown>;
}

export interface MessageDetail {
  id: string;
  request_id?: string | null;
  status: string;
  recipient_email: string;
  from_email: string;
  subject: string;
  provider: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  queued_at: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface TrackEventInput {
  id?: string;
  name: string;
  data: Record<string, unknown>;
}

export interface WorkflowRunSummary {
  id: string;
  workflow_id: string;
  app_event_id: string;
  status: string;
  message_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface TrackedEvent {
  id: string;
  name: string;
  dispatch_status: string;
  replayed: boolean;
  runs: WorkflowRunSummary[];
}

const DEFAULT_TIMEOUT_MS = 60_000;

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sdk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class MailmaanClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: MailmaanClientOptions) {
    if (!options.apiKey) throw new MailmaanApiError("missing_api_key", "API key is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://mailmaan-regen.vercel.app").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "user-agent": "mailmaan-sdk/0.1.0",
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new MailmaanApiError(
        "request_failed",
        error instanceof Error && error.name === "AbortError"
          ? `Request timed out after ${this.timeoutMs}ms.`
          : `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const record = (payload ?? {}) as { error?: { code?: unknown; message?: unknown; request_id?: unknown } };
      const code = typeof record.error?.code === "string" ? record.error.code : "api_error";
      const message =
        typeof record.error?.message === "string" ? record.error.message : `Request failed with status ${response.status}.`;
      const requestId = typeof record.error?.request_id === "string" ? record.error.request_id : null;
      throw new MailmaanApiError(code, message, {
        status: response.status,
        requestId,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    return payload as T;
  }

  async health(): Promise<{ status: string; version: string; timestamp: string }> {
    return this.request("GET", "/v1/health");
  }

  async listTemplates(): Promise<{ templates: TemplateSummary[] }> {
    return this.request("GET", "/v1/templates");
  }

  async generateTemplate(
    purpose: string,
    opts?: { brief?: string; requiredVariables?: string[] },
  ): Promise<GeneratedTemplateDraft> {
    return this.request("POST", "/v1/templates/generate", {
      purpose,
      ...(opts?.brief ? { brief: opts.brief } : {}),
      ...(opts?.requiredVariables ? { required_variables: opts.requiredVariables } : {}),
    });
  }

  async sendEmail(input: SendEmailInput): Promise<SentEmail> {
    return this.request<SentEmail>(
      "POST",
      "/v1/emails",
      {
        to: input.to,
        template: input.template,
        variables: input.variables ?? {},
        metadata: input.metadata ?? {},
        ...(input.from ? { from: input.from } : {}),
      },
      { "idempotency-key": input.idempotencyKey ?? randomIdempotencyKey() },
    );
  }

  async getMessage(id: string): Promise<{ message: MessageDetail; timeline: TimelineEvent[] }> {
    return this.request("GET", `/v1/messages/${encodeURIComponent(id)}`);
  }

  async syncMessage(id: string): Promise<{
    message_id: string;
    status: string;
    outcome: string;
    upstream: unknown;
    status_url: string;
  }> {
    return this.request("POST", `/v1/messages/${encodeURIComponent(id)}/sync`);
  }

  async trackEvent(input: TrackEventInput): Promise<TrackedEvent> {
    return this.request("POST", "/v1/events", {
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      data: input.data,
    });
  }

  async reconcileEvents(): Promise<{ events_reconciled: number; runs_executed: number; runs_reset: number }> {
    return this.request("POST", "/v1/events/reconcile");
  }
}
