import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

/**
 * Day 3 public API gate (Blueprint §7, §15): published template metadata is
 * only ever exposed to a valid project API key with read scope. Without a
 * key the route must fail closed before any database work.
 */
describe("GET /v1/templates authentication gate", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(new NextRequest("http://localhost/v1/templates"));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("rejects a malformed (non-Mailmaan) bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/v1/templates", {
        headers: { authorization: "Bearer sk_live_not_mailmaan" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
