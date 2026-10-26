import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "../env";

/** Browser/publishable-key Supabase client. Never use with a service-role key. */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
