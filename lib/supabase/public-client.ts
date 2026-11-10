import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfiguration } from "./config";

// A signed-out connection for the few public flows (tender enquiries and shared document
// links). It carries only the publishable key, never a user's cookies and never a service key:
// the database decides what an anonymous visitor may do.
export function createPublicClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration) return null;
  return { configuration, client: createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) };
}
