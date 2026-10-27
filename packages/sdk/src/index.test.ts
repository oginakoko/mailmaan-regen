import { describe, expect, it, vi } from "vitest";
import { MailmaanApiError, MailmaanClient } from "./index";

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubClient(handler: (url: string, init?: RequestInit) => Promise<Response>): {
  client: MailmaanClient;
  calls: Array<[string, RequestInit | undefined]>;
} {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return handler(url, init);
  });
  const client = new MailmaanClient({
    apiKey: "mk_live_test",
    baseUrl: "https://api.example",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

describe("MailmaanClient", () => {
  it("sends email with an idempotency key and auth headers", async () => {
    const { client, calls } = stubClient(async () =>
      jsonResponse(202, { id: "m1", status: "accepted", status_url: "/v1/messages/m1", replayed: false }),
    );
    const result = await client.sendEmail({
      to: "a@example.com",
      template: "welcome",
      variables: { firstName: "Asha" },
      idempotencyKey: "k1",
    });
    expect(result.id).toBe("m1");
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe("https://api.example/v1/emails");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer mk_live_test");
    expect(headers["idempotency-key"]).toBe("k1");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.template).toBe("welcome");
  });

  it("auto-generates an idempotency key when omitted", async () => {
    const { client, calls } = stubClient(async () =>
      jsonResponse(202, { id: "m1", status: "accepted", status_url: "/v1/messages/m1", replayed: false }),
    );
    await client.sendEmail({ to: "a@example.com", template: "welcome" });
    const headers = calls[0][1]?.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBeTruthy();
  });

  it("maps API errors with code, status, and request id", async () => {
    const { client } = stubClient(async () =>
      jsonResponse(422, {
        error: { code: "invalid_recipient", message: "Bad email.", request_id: "r1" },
      }),
    );
    const failure = await client
      .sendEmail({ to: "bad", template: "welcome", idempotencyKey: "k" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MailmaanApiError);
    const typed = failure as MailmaanApiError;
    expect(typed.code).toBe("invalid_recipient");
    expect(typed.status).toBe(422);
    expect(typed.requestId).toBe("r1");
    expect(typed.retryable).toBe(false);
  });

  it("marks rate limits and server errors retryable", async () => {
    const { client } = stubClient(async () => jsonResponse(503, { error: { code: "x", message: "y" } }));
    const failure = await client.listTemplates().catch((error: unknown) => error);
    expect((failure as MailmaanApiError).retryable).toBe(true);
  });

  it("tracks events and reads messages over the right paths", async () => {
    const { client, calls } = stubClient(async (url) => {
      if (url.endsWith("/v1/events")) return jsonResponse(202, { id: "e1", runs: [] });
      return jsonResponse(200, { message: { id: "m1" }, timeline: [] });
    });
    await client.trackEvent({ id: "ext-1", name: "user.signed_up", data: { email: "a@b.c" } });
    await client.getMessage("m1");
    expect(calls[0][0]).toBe("https://api.example/v1/events");
    expect(calls[1][0]).toBe("https://api.example/v1/messages/m1");
    const body = JSON.parse(String(calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ id: "ext-1", name: "user.signed_up", data: { email: "a@b.c" } });
  });

  it("generates template drafts over the right path", async () => {
    const { client, calls } = stubClient(async () =>
      jsonResponse(201, { template: { slug: "welcome", status: "draft" }, generated_by: "fallback" }),
    );
    const result = await client.generateTemplate("welcome");
    expect(result.template.slug).toBe("welcome");
    expect(calls[0][0]).toBe("https://api.example/v1/templates/generate");
    const body = JSON.parse(String(calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ purpose: "welcome" });
  });

  it("requires an API key at construction", () => {
    expect(() => new MailmaanClient({ apiKey: "" })).toThrow(MailmaanApiError);
  });
});
