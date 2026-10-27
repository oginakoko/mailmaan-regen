import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "../supabase/service";

/**
 * DB-backed fixed-window rate limiting (Day 9 hardening).
 *
 * Counts live in `api_rate_limits` keyed by (key hash, bucket, window
 * start) so limits hold across serverless instances. Each check is one
 * atomic `api_rate_limit_bump` RPC (insert-or-increment). Buckets:
 * `write` (sends, events, sync, reconcile) and `read` (lists, gets).
 *
 * Fail-open: if the counter store errors, the request proceeds and the
 * failure is logged. Availability wins over strictness for this MVP;
 * abuse containment still holds whenever the database is reachable.
 */

export type RateLimitBucket = "read" | "write";

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  read: { limit: 600, windowSeconds: 60 },
  write: { limit: 120, windowSeconds: 60 },
};

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

/** Pure window-flooring for unit tests. */
export function floorWindowStart(nowMs: number, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

export function fingerprintApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Route guard: returns a 429 JSON response when the key exhausted its
 * bucket, or null when the request may proceed.
 */
export async function enforceRateLimit(
  rawKey: string,
  bucket: RateLimitBucket,
  requestId: string,
): Promise<import("next/server").NextResponse | null> {
  const { NextResponse } = await import("next/server");
  const decision = await checkRateLimit(rawKey, bucket);
  if (decision.allowed) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((new Date(decision.resetAt).getTime() - Date.now()) / 1000),
  );
  console.warn("[rate-limit] rejected", { bucket, request_id: requestId });
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "Rate limit exceeded. Retry after the reset time.",
        request_id: requestId,
      },
    },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

export async function checkRateLimit(
  rawKey: string,
  bucket: RateLimitBucket,
  opts?: { limit?: number; windowSeconds?: number; now?: Date },
): Promise<RateLimitDecision> {
  const config = RATE_LIMITS[bucket];
  const limit = opts?.limit ?? config.limit;
  const windowSeconds = opts?.windowSeconds ?? config.windowSeconds;
  const now = opts?.now ?? new Date();
  const windowStart = floorWindowStart(now.getTime(), windowSeconds);
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000).toISOString();
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db.rpc("api_rate_limit_bump", {
      p_key_hash: fingerprintApiKey(rawKey),
      p_bucket: bucket,
      p_window_start: windowStart.toISOString(),
    });
    if (error || typeof data !== "number") throw error ?? new Error("counter failed");
    return { allowed: data <= limit, remaining: Math.max(0, limit - data), resetAt };
  } catch (error) {
    console.warn("[rate-limit] counter store failed; failing open", {
      bucket,
      message: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, remaining: limit, resetAt };
  }
}
