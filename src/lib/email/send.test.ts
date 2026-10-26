import { beforeEach, describe, expect, it } from "vitest";
import { assertAllowedRecipient, computeRequestHash, EmailSendError } from "./send";

describe("computeRequestHash", () => {
  it("is stable for the same body and differs on any change", () => {
    const body = {
      to: "a@example.com",
      template: "welcome",
      variables: { name: "Asha" },
      metadata: {},
    };
    const first = computeRequestHash(body);
    expect(computeRequestHash({ ...body })).toBe(first);
    expect(computeRequestHash({ ...body, to: "b@example.com" })).not.toBe(first);
    expect(computeRequestHash({ ...body, variables: { name: "Bo" } })).not.toBe(first);
  });
});

describe("assertAllowedRecipient", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.MAILMAAN_TEST_RECIPIENTS;
  });

  it("allows anyone when no allowlist is configured", () => {
    expect(() => assertAllowedRecipient("anyone@example.com")).not.toThrow();
  });

  it("allows listed recipients case-insensitively", () => {
    process.env.MAILMAAN_TEST_RECIPIENTS = "philipstar98@gmail.com, QA@Example.com";
    expect(() => assertAllowedRecipient("philipstar98@gmail.com")).not.toThrow();
    expect(() => assertAllowedRecipient("qa@example.com")).not.toThrow();
  });

  it("rejects unlisted recipients with 422", () => {
    process.env.MAILMAAN_TEST_RECIPIENTS = "philipstar98@gmail.com";
    try {
      assertAllowedRecipient("stranger@example.com");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EmailSendError);
      expect((error as EmailSendError).code).toBe("recipient_not_allowed");
      expect((error as EmailSendError).status).toBe(422);
    }
  });
});
