import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfiguration, sessionCookieOptions } from "./config";

export async function createClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration) throw new Error("TileSPEC authentication is not configured.");
  const cookieStore = await cookies();

  return createServerClient(configuration.url, configuration.publishableKey, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Rendering Server Components cannot write cookies. Middleware refreshes
        // their sessions; Server Actions can persist sign-in and sign-out here.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, {
            ...options,
            httpOnly: sessionCookieOptions.httpOnly,
            secure: sessionCookieOptions.secure,
            sameSite: sessionCookieOptions.sameSite,
            path: sessionCookieOptions.path,
          }));
        } catch {
          // The same request's middleware owns cookie writes during rendering.
        }
      },
    },
  });
}

export async function clearSessionCookies() {
  const configuration = getSupabaseConfiguration();
  if (!configuration) return;
  const cookieStore = await cookies();
  const prefix = `sb-${new URL(configuration.url).hostname.split(".")[0]}-auth-token`;
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name === prefix || cookie.name.startsWith(`${prefix}.`)) {
      cookieStore.set(cookie.name, "", { ...sessionCookieOptions, maxAge: 0 });
    }
  }
}
