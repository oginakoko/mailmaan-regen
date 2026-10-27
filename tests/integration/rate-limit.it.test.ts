import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../../src/lib/rate-limit/service";

/**
 * Rate-limit counter behavior (Day 9).
 *
 * Real Supabase project: tiny limits prove allow/deny accounting,
 * per-key and per-bucket isolation, and window rollover. Random key
 * fingerprints per run keep reruns independent; the RPC sweeps old
 * windows hourly. Credentials come from `.env.local` (never committed);
 * the suite skips without them.
 */

function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) parsed[key] = value;
  }
  return parsed;
}

const envLocal = loadEnvLocal();
for (const [key, value] of Object.entries(envLocal)) {
  process.env[key] = value;
}

const hasKeys = Boolean(envLocal.SUPABASE_SERVICE_ROLE_KEY && envLocal.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasKeys)("rate limiting (integration)", () => {
  it("allows up to the limit, then denies with reset info", async () => {
    const key = `rl-probe-${randomUUID()}`;
    // Pin all calls to mid-window: fixed epoch windows mean two live-clock
    // calls can straddle a minute boundary and land in different windows.
    const mid = Date.now() - (Date.now() % 60_000) + 30_000;
    const atMid = { limit: 2, windowSeconds: 60, now: new Date(mid) };
    const first = await checkRateLimit(key, "write", atMid);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    const second = await checkRateLimit(key, "write", atMid);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    const third = await checkRateLimit(key, "write", atMid);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.resetAt).toBe(new Date(mid + 30_000).toISOString());

    // Buckets and keys are independent.
    const otherBucket = await checkRateLimit(key, "read", { limit: 2, windowSeconds: 60 });
    expect(otherBucket.allowed).toBe(true);
    const otherKey = await checkRateLimit(`rl-probe-${randomUUID()}`, "write", {
      limit: 2,
      windowSeconds: 60,
    });
    expect(otherKey.allowed).toBe(true);
  }, 120_000);

  it("rolls over into a fresh window", async () => {
    const key = `rl-window-${randomUUID()}`;
    const now = Date.now();
    await checkRateLimit(key, "write", { limit: 1, windowSeconds: 60, now: new Date(now) });
    const denied = await checkRateLimit(key, "write", {
      limit: 1,
      windowSeconds: 60,
      now: new Date(now + 1000),
    });
    expect(denied.allowed).toBe(false);
    const rolled = await checkRateLimit(key, "write", {
      limit: 1,
      windowSeconds: 60,
      now: new Date(now + 61_000),
    });
    expect(rolled.allowed).toBe(true);
  }, 120_000);
});
