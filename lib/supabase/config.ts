export type SupabaseConfiguration = { url: string; publishableKey: string };

// Only this explicitly configured TileSPEC backend is ever used. In particular,
// there is no fallback to the related ResinSpec applications.
export function getSupabaseConfiguration(): SupabaseConfiguration | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  // A service-role/secret key here would defeat user-scoped RLS and must never
  // be accepted as a browser-safe connection value.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    try {
      const parts = publishableKey.split(".");
      if (parts.length !== 3 || JSON.parse(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/"))).role !== "anon") return null;
    } catch { return null; }
  }

  try {
    const parsed = new URL(url);
    const localDevelopment = process.env.NODE_ENV !== "production"
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfiguration() !== null;
}

// Authentication is entirely server-side: no browser SDK needs access to tokens.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
