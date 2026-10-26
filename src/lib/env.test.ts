import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts a minimal valid public configuration", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("rejects a missing publishable key with an actionable error", () => {
    expect(() =>
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects an invalid Supabase URL", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
