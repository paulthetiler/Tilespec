"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authenticationUnavailable, safeAdminRedirect } from "@/lib/supabase/navigation";
import { requireActor } from "@/lib/auth";

export async function signIn(formData: FormData) {
  const next = safeAdminRedirect(formData.get("next"));
  const emailValue = formData.get("email");
  const password = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const valid = email.length > 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && typeof password === "string" && password.length >= 8 && password.length <= 128;

  const failure = (error: string) => {
    const query = new URLSearchParams({ error, next });
    redirect(`/login?${query.toString()}`);
  };
  if (!isSupabaseConfigured()) redirect("/login?reason=configuration");
  if (!valid) failure("invalid");
  const supabase = await createClient();
  let result;
  try {
    result = await supabase.auth.signInWithPassword({ email, password: password as string });
  } catch {
    failure("unavailable");
  }
  if (result!.error || !result!.data.user) {
    failure(authenticationUnavailable(result!.error) ? "unavailable" : "invalid");
  }
  // Signing in is not onboarding. Only an explicitly provisioned active database
  // membership grants access; there is no first-user owner or email-domain rule.
  await requireActor();
  redirect(next);
}
