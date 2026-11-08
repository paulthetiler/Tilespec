import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfiguration } from "./config";
import type { DocumentRecord } from "../documents/model";

// The one privileged call behind a shared document link. It runs only the database function that
// opens the single issued document a live, unrevoked, unexpired link names, and nothing else. No
// browser role may execute that function, so a link works only through this server route.
export async function readSharedDocument(token: string): Promise<DocumentRecord | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const configuration = getSupabaseConfiguration();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuration || !key) throw new Error("Shared documents are not configured.");
  const client = createClient(configuration.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("shared_commercial_document", { p_token: token });
  if (error) throw new Error("Shared documents are unavailable.");
  return (data ?? null) as DocumentRecord | null;
}
