import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMailmaanSendBody,
  MailmaanDeliveryProvider,
  mapMailmaanError,
  ProviderSendError,
  type ProviderSendInput,
} from "./provider";

const INPUT: ProviderSendInput = {
  to: "philipstar98@gmail.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  smtp: {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    user: "sender@example.com",
    pass: "s3cr3t",
    from_email: "sender@example.com",
    from_name: null,
  },
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildMailmaanSendBody", () => {
  it("builds the raw-HTML + per-request SMTP contract", () => {
    expect(buildMailmaanSendBody(INPUT)).toEqual({
      to: "philipstar98@gmail.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      smtp: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: "sender@example.com",
        pass: "s3cr3t",
        from_email: "sender@example.com",
      },
    });
  });

  it("omits empty optional fields", () => {
    const body = buildMailmaanSendBody({ ...INPUT, text: undefined });
    expect(body).not.toHaveProperty("from");
    expect(body).not.toHaveProperty("text");
  });
});

describe("mapMailmaanError", () => {
  it("maps auth failures without leaking details", () => {
    const error = mapMailmaanError(401, { error: "Invalid API key" });
    expect(error.code).toBe("delivery_unauthorized");
    expect(error.retryable).toBe(false);
  });

  it("maps validation rejections as non-retryable", () => {
    const error = mapMailmaanError(422, { error: "`smtp.host` is required" });
    expect(error.code).toBe("delivery_rejected");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("smtp.host");
  });

  it("maps overloads as retryable", () => {
    expect(mapMailmaanError(429, {}).retryable).toBe(true);
    expect(mapMailmaanError(503, {}).retryable).toBe(true);
  });
});

describe("MailmaanDeliveryProvider", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.MAILMAAN_DELIVERY_BASE_URL = "https://delivery.example";
    process.env.MAILMAAN_DELIVERY_API_KEY = "mm_test";
  });

  it("sends and maps the success response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { message_id: "<abc@mail>", id: "<abc@mail>", status: "sent" }),
    );
    const provider = new MailmaanDeliveryProvider({ fetchImpl: fetchImpl as typeof fetch });
    const result = await provider.send(INPUT);
    expect(result).toEqual({ providerMessageId: "<abc@mail>", status: "sent" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://delivery.example/v1/send");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer mm_test");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.subject).toBe("Hello");
    expect((body.smtp as Record<string, unknown>).host).toBe("smtp.example.com");
  });

  it("throws a mapped error on upstream rejection", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { error: "`smtp.host` is required" }));
    const provider = new MailmaanDeliveryProvider({ fetchImpl: fetchImpl as typeof fetch });
    const failure = await provider.send(INPUT).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderSendError);
    expect((failure as ProviderSendError).code).toBe("delivery_rejected");
  });

  it("reads upstream status and returns null on 404", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes(encodeURIComponent("<known@mail>"))) {
        return jsonResponse(200, {
          status: "sent",
          delivered_at: "2026-10-27T10:05:21.355073+00:00",
          opened_at: null,
          clicked_at: null,
        });
      }
      return jsonResponse(404, { error: "Message not found" });
    });
    const provider = new MailmaanDeliveryProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.getMessageStatus("<known@mail>")).toEqual({
      status: "sent",
      deliveredAt: "2026-10-27T10:05:21.355073+00:00",
      openedAt: null,
      clickedAt: null,
    });
    expect(await provider.getMessageStatus("<missing@mail>")).toBeNull();
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://delivery.example/v1/messages/%3Cknown%40mail%3E/status");
  });

  it("aborts on timeout and marks the failure retryable", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const provider = new MailmaanDeliveryProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
    });
    const failure = await provider.send(INPUT).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderSendError);
    expect((failure as ProviderSendError).code).toBe("delivery_timeout");
    expect((failure as ProviderSendError).retryable).toBe(true);
  });
});
