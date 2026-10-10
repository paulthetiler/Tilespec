"use server";

import { redirect } from "next/navigation";
import { clearSessionCookies, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function signOut() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // A remote outage must not prevent removal of this browser's session.
    }
    await clearSessionCookies();
  }
  redirect("/login?reason=signed_out");
}
