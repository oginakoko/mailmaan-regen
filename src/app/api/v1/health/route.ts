import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

/**
 * GET /v1/health (Blueprint §7) — public, no credentials.
 * Returns status/version/timestamp only; never secrets or infra details.
 * Internal route; /v1/health is rewritten to this handler in next.config.ts.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
