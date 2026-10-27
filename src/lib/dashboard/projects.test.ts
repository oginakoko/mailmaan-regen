import { describe, expect, it } from "vitest";
import { emptyStats, groupMessageStatus, MESSAGE_STATUS_GROUPS } from "./projects";

describe("groupMessageStatus", () => {
  it("covers every persisted message status exactly once", () => {
    const persisted = [
      "queued",
      "sending",
      "accepted",
      "delivered",
      "failed",
      "bounced",
      "complained",
      "delivery_delayed",
      "suppressed",
    ];
    const grouped = Object.values(MESSAGE_STATUS_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...persisted].sort());
    for (const status of persisted) {
      expect(groupMessageStatus(status)).not.toBe("other");
    }
  });

  it("groups ok / attention / in-flight by tone", () => {
    expect(groupMessageStatus("accepted")).toBe("ok");
    expect(groupMessageStatus("delivered")).toBe("ok");
    expect(groupMessageStatus("failed")).toBe("attention");
    expect(groupMessageStatus("suppressed")).toBe("attention");
    expect(groupMessageStatus("queued")).toBe("inFlight");
    expect(groupMessageStatus("nope")).toBe("other");
  });

  it("starts stats at zero with no last send", () => {
    expect(emptyStats()).toEqual({
      messagesTotal: 0,
      ok: 0,
      attention: 0,
      inFlight: 0,
      lastSentAt: null,
      templatesPublished: 0,
      workflowsEnabled: 0,
      keysActive: 0,
      smtpConnected: false,
    });
  });
});
