import { describe, expect, it } from "vitest";
import { describeStatus } from "./messages";

describe("describeStatus", () => {
  it("labels accepted as accepted, never delivered", () => {
    expect(describeStatus("accepted")).toEqual({ label: "Accepted", tone: "ok" });
    expect(describeStatus("queued").label).toBe("Queued");
  });

  it("labels failure states distinctly", () => {
    expect(describeStatus("failed")).toEqual({ label: "Failed", tone: "bad" });
    expect(describeStatus("bounced").tone).toBe("bad");
    expect(describeStatus("delivery_delayed")).toEqual({ label: "Delayed", tone: "warn" });
  });

  it("passes unknown states through muted", () => {
    expect(describeStatus("mystery")).toEqual({ label: "mystery", tone: "muted" });
  });
});
