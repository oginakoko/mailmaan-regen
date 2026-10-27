import { describe, expect, it } from "vitest";
import { diagnoseMessage } from "./diagnose";

describe("diagnoseMessage", () => {
  it("explains an accepted message without claiming delivery", () => {
    const diagnosis = diagnoseMessage(
      {
        id: "m1",
        status: "accepted",
        recipient_email: "a@example.com",
        subject: "Hi",
        provider: "mailmaan",
        provider_message_id: "<x@y>",
        error_code: null,
        error_message: null,
      },
      [
        { event_type: "queued", source: "mailmaan", occurred_at: "2026-10-27T10:00:00Z" },
        { event_type: "accepted", source: "provider", occurred_at: "2026-10-27T10:00:05Z" },
      ],
    );
    expect(diagnosis.delivered).toBe(false);
    expect(diagnosis.summary).toContain("accepted");
    expect(diagnosis.summary).toContain("unconfirmed");
    expect(diagnosis.timeline_walk).toHaveLength(2);
    expect(diagnosis.error).toBeNull();
  });

  it("diagnoses an SMTP-blocked failure with cause and next checks", () => {
    const diagnosis = diagnoseMessage(
      {
        id: "m2",
        status: "failed",
        recipient_email: "a@example.com",
        subject: "Hi",
        provider: "mailmaan",
        provider_message_id: null,
        error_code: "smtp_not_configured",
        error_message: "No SMTP mailbox is configured for this project.",
      },
      [{ event_type: "queued", source: "mailmaan", occurred_at: null }],
    );
    expect(diagnosis.error?.code).toBe("smtp_not_configured");
    expect(diagnosis.likely_cause).toContain("no SMTP mailbox");
    expect(diagnosis.next_checks.join(" ")).toContain("SMTP page");
  });

  it("admits unknown codes instead of inventing causes", () => {
    const diagnosis = diagnoseMessage(
      {
        id: "m3",
        status: "failed",
        recipient_email: "a@example.com",
        subject: "Hi",
        provider: "mailmaan",
        provider_message_id: null,
        error_code: "mystery_code",
        error_message: "Something odd.",
      },
      [],
    );
    expect(diagnosis.likely_cause).toBeNull();
    expect(diagnosis.next_checks.join(" ")).toContain("no documented cause");
  });
});
