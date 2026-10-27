import { describe, expect, it, vi } from "vitest";
import { MailmaanClient } from "mailmaan-sdk";
import { SokoStore } from "./store";

describe("SokoStore", () => {
  it("emits user.signed_up with a stable external id", async () => {
    const trackEvent = vi.fn(async () => ({ id: "e1", runs: [] }));
    const store = new SokoStore({ trackEvent } as unknown as MailmaanClient);
    await store.signup({ userId: "u1", email: "a@example.com", firstName: "Asha" });
    expect(trackEvent).toHaveBeenCalledWith({
      id: "soko-signup/u1",
      name: "user.signed_up",
      data: { email: "a@example.com", firstName: "Asha" },
    });
  });

  it("emits order.paid with order fields", async () => {
    const trackEvent = vi.fn(async () => ({ id: "e2", runs: [] }));
    const store = new SokoStore({ trackEvent } as unknown as MailmaanClient);
    await store.checkout({
      orderId: "ORD-1",
      customerEmail: "a@example.com",
      total: "49.99",
      currency: "USD",
    });
    expect(trackEvent).toHaveBeenCalledWith({
      id: "soko-order/ORD-1",
      name: "order.paid",
      data: { customerEmail: "a@example.com", orderId: "ORD-1", total: "49.99", currency: "USD" },
    });
  });

  it("sends welcome directly through the template path", async () => {
    const sendEmail = vi.fn(async () => ({ id: "m1" }));
    const store = new SokoStore({ sendEmail } as unknown as MailmaanClient);
    await store.sendWelcomeDirect({ email: "a@example.com", firstName: "Asha", idempotencyKey: "k1" });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "a@example.com",
      template: "welcome",
      variables: { firstName: "Asha", product: "Soko" },
      metadata: { source: "soko-store-direct" },
      idempotencyKey: "k1",
    });
  });
});
