import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authenticationUnavailable } from "@/lib/supabase/navigation";

export async function requirePasswordSession() {
  if (!isSupabaseConfigured()) redirect("/login?reason=configuration");
  const supabase = await createClient();
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch {
    redirect("/login?reason=unavailable");
  }
  if (result.error || !result.data.user) {
    if (authenticationUnavailable(result.error)) redirect("/login?reason=unavailable");
    redirect("/login");
  }
  // Auth ownership permits setting one's password. Business membership is
  // separately required at /admin; an invitation never grants a role.
  return { supabase, user: result.data.user };
}
