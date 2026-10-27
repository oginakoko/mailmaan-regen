import { describe, expect, it } from "vitest";
import { isTerminalState, mapUpstreamStatus } from "./status-sync";

describe("mapUpstreamStatus", () => {
  it("maps the failure family to canonical states", () => {
    expect(mapUpstreamStatus("failed")).toBe("failed");
    expect(mapUpstreamStatus("Bounced")).toBe("bounced");
    expect(mapUpstreamStatus("complained")).toBe("complained");
    expect(mapUpstreamStatus("delayed")).toBe("delivery_delayed");
    expect(mapUpstreamStatus("delivery_delayed")).toBe("delivery_delayed");
  });

  it("maps nothing for in-flight, sent, or unknown statuses", () => {
    for (const status of ["queued", "sending", "accepted", "sent", "SENT", "weird"]) {
      expect(mapUpstreamStatus(status)).toBeNull();
    }
  });
});

describe("isTerminalState", () => {
  it("treats failure/delivery states as terminal", () => {
    for (const state of ["failed", "bounced", "complained", "delivered"]) {
      expect(isTerminalState(state)).toBe(true);
    }
    for (const state of ["queued", "sending", "accepted", "delivery_delayed", "suppressed"]) {
      expect(isTerminalState(state)).toBe(false);
    }
  });
});
