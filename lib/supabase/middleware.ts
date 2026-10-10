import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfiguration, sessionCookieOptions } from "./config";
import { authenticationUnavailable } from "./navigation";

export async function updateSession(request: NextRequest) {
  const configuration = getSupabaseConfiguration();
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const admin = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");

  function loginRedirect(reason?: string) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (reason) url.searchParams.set("reason", reason);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  if (!configuration) return admin ? loginRedirect("configuration") : response;

  const supabase = createServerClient(configuration.url, configuration.publishableKey, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, {
          ...options,
          httpOnly: sessionCookieOptions.httpOnly,
          secure: sessionCookieOptions.secure,
          sameSite: sessionCookieOptions.sameSite,
          path: sessionCookieOptions.path,
        }));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getUser();
    if (admin && (error || !data.user)) {
      return loginRedirect(authenticationUnavailable(error) ? "unavailable" : undefined);
    }
  } catch {
    if (admin) return loginRedirect("unavailable");
  }
  // Membership and all data permissions are checked again in server components,
  // server actions and PostgreSQL RLS. Middleware is only session maintenance.
  return response;
}
