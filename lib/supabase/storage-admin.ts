import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfiguration } from "./config";

// The only privileged runtime capability is verifying quarantined file bytes and
// completing that exact upload. All business queries/mutations stay user-scoped.
// Never import this module into a client component or attach a user's cookies.
export function createStorageVerifier() {
  const configuration = getSupabaseConfiguration();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuration || !key) throw new Error("Private file verification is not configured. Contact the owner.");
  return createClient(configuration.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
