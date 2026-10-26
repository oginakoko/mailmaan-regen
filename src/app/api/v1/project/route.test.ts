import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

/**
 * Day 2 maintained gate (Blueprint §14 Day 2 proof, §15 integration tests):
 * the public API must derive project identity from the stored API-key record
 * and must reject missing/malformed keys. Runs without a live database by
 * asserting the unauthenticated paths, which fail closed before any DB work.
 *
 * The live cross-project isolation proof (two users, two projects) additionally
 * runs against the real Supabase project via tests/integration when
 * MAILMAAN_RUN_INTEGRATION=1 and SUPABASE_SERVICE_ROLE_KEY are set — see
 * tests/isolation.checklist.md for the manual evidence procedure used in the
 * hackathon until service credentials are provisioned.
 */

describe("GET /v1/project authentication gate", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(new NextRequest("http://localhost/v1/project"));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("rejects a malformed (non-Mailmaan) bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/v1/project", {
        headers: { authorization: "Bearer not-a-mailmaan-key" },
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_api_key");
  });
});
