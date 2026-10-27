import { describe, expect, it } from "vitest";
import { fingerprintApiKey, floorWindowStart, RATE_LIMITS } from "./service";

describe("rate-limit pure helpers", () => {
  it("floors timestamps to window starts", () => {
    expect(floorWindowStart(61_500, 60).getTime()).toBe(60_000);
    expect(floorWindowStart(60_000, 60).getTime()).toBe(60_000);
    expect(floorWindowStart(61_500, 30).getTime()).toBe(60_000);
  });

  it("fingerprints keys stably without leaking them", () => {
    const first = fingerprintApiKey("mk_live_secret");
    expect(first).toBe(fingerprintApiKey("mk_live_secret"));
    expect(first).toHaveLength(64);
    expect(first).not.toContain("secret");
    expect(fingerprintApiKey("mk_live_other")).not.toBe(first);
  });

  it("keeps sane production defaults", () => {
    expect(RATE_LIMITS.write.limit).toBeLessThanOrEqual(RATE_LIMITS.read.limit);
    expect(RATE_LIMITS.write.windowSeconds).toBe(60);
  });
});
