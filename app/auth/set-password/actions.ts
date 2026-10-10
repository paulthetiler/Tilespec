"use server";

import { redirect } from "next/navigation";
import { authenticationUnavailable, validNewPassword } from "@/lib/supabase/navigation";
import { requirePasswordSession } from "./session";

export async function setPassword(formData: FormData) {
  const { supabase, user } = await requirePasswordSession();
  const password = formData.get("password");
  if (!validNewPassword(password, formData.get("confirmation"))) redirect("/auth/set-password?error=password");

  let result;
  try {
    result = await supabase.auth.updateUser({ password });
  } catch {
    redirect("/auth/set-password?error=unavailable");
  }
  if (result.error || result.data.user?.id !== user.id) {
    redirect(authenticationUnavailable(result.error)
      ? "/auth/set-password?error=unavailable" : "/auth/set-password?error=rejected");
  }
  const verified = await requirePasswordSession();
  if (verified.user.id !== user.id) redirect("/login?reason=unavailable");
  redirect("/admin");
}
