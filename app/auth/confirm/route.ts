import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authenticationUnavailable, emailConfirmationParameters } from "@/lib/supabase/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  function destination(path: string) {
    const url = new URL(path, request.url);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (!isSupabaseConfigured()) return destination("/login?reason=configuration");
  const parameters = emailConfirmationParameters(request.nextUrl.searchParams);
  if (!parameters) return destination("/login?reason=invitation");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: parameters.tokenHash,
      type: parameters.type,
    });
    // Token values, Auth errors and email addresses are never logged or included
    // in a redirect. The success URL drops the original sensitive query entirely.
    if (error || !data.user || !data.session) {
      return destination(authenticationUnavailable(error) ? "/login?reason=unavailable" : "/login?reason=invitation");
    }
    return destination("/auth/set-password");
  } catch {
    return destination("/login?reason=unavailable");
  }
}
