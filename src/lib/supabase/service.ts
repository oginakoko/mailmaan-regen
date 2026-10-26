import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "../env";

/**
 * Service-role Supabase client (Blueprint §6: "The service-role/secret
 * database key must only be used in server-only modules").
 *
 * Used exclusively by server code that must bypass RLS deliberately:
 *   - resolving Mailmaan API keys (api_keys has no browser policies at all)
 *   - creating/revoking API keys from authenticated dashboard routes
 *   - the send pipeline (Day 4) and webhook handling (Day 5)
 *
 * Never import this from a Client Component and never expose the key.
 */
export function createSupabaseServiceClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. It is required for API-key management and the send pipeline; set it in .env.local (server-only, never commit).",
    );
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
