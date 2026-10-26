import { z } from "zod";

/**
 * Environment validation (Blueprint §3, Day 1).
 * Public variables are safe to expose to the browser. Server-only secrets
 * must never be prefixed with NEXT_PUBLIC_ and are validated lazily so the
 * app can still build and boot before every secret is provisioned.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // AI template generation (Day 3, Blueprint §10). Meta Muse via the Meta
  // Model API (OpenAI-compatible). All optional: without a key + model the
  // app must use deterministic templates labelled as fallback/demo.
  AI_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.url().optional(),
  AI_TEMPLATE_MODEL: z.string().min(1).optional(),
  AI_MODELS_PATH: z.string().startsWith("/").optional(),
  // Delivery via the deployed Mailmaan service (Day 4, ADR-0002).
  MAILMAAN_DELIVERY_BASE_URL: z.url().optional(),
  MAILMAAN_DELIVERY_API_KEY: z.string().min(1).optional(),
  // 32 bytes hex-encoded (64 chars); encrypts per-project SMTP passwords.
  MAILMAAN_SMTP_ENCRYPTION_KEY: z.string().min(1).optional(),
  // Demo guardrail (Blueprint §7): when set, sends are restricted to these
  // comma-separated recipients. Empty/unset means no restriction.
  MAILMAAN_TEST_RECIPIENTS: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

let cachedPublicEnv: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${formatIssues(parsed.error)}`);
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Server-only. Throws with an actionable message when required vars are missing. */
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

/** Pure parser used by tests; never reads process.env directly. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}
