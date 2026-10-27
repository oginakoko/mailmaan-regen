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
      customerFirstName: "Asha",
      total: "49.99",
      currency: "USD",
    });
    expect(trackEvent).toHaveBeenCalledWith({
      id: "soko-order/ORD-1",
      name: "order.paid",
      data: {
        customerEmail: "a@example.com",
        firstName: "Asha",
        orderId: "ORD-1",
        total: "49.99",
        currency: "USD",
      },
    });
  });

  it("sends welcome directly through the template path", async () => {
    const sendEmail = vi.fn(async () => ({ id: "m1" }));
    const store = new SokoStore({ sendEmail } as unknown as MailmaanClient);
    await store.sendWelcomeDirect({ email: "a@example.com", firstName: "Asha", idempotencyKey: "k1" });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "a@example.com",
      template: "welcome",
      variables: { firstName: "Asha" },
      metadata: { source: "soko-store-direct" },
      idempotencyKey: "k1",
    });
  });

  it("sends referral invites with stable invite idempotency", async () => {
    const sendEmail = vi.fn(async () => ({ id: "m9" }));
    const store = new SokoStore({ sendEmail } as unknown as MailmaanClient);
    await store.inviteFriend({ inviteToken: "tok1", friendEmail: "a@example.com", friendName: "Jo" });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "a@example.com",
      template: "welcome",
      variables: { firstName: "Jo" },
      metadata: { source: "soko-invite", invite_token: "tok1" },
      idempotencyKey: "soko-invite/tok1",
    });
  });
});
