export function safeAdminRedirect(value: unknown, fallback = "/admin"): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return fallback;
  // Reject browser URL normalisation tricks, encoded separators and controls.
  let decoded = value;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return fallback;
    }
  }
  try {
    const target = new URL(value, "https://tilespec.invalid");
    if (target.origin !== "https://tilespec.invalid") return fallback;
    if (target.pathname !== "/admin" && !target.pathname.startsWith("/admin/")) return fallback;
    return target.pathname + target.search;
  } catch {
    return fallback;
  }
}

export function authenticationUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, name } = error as { status?: number; name?: string };
  return status === 0 || (typeof status === "number" && status >= 500)
    || name === "AuthRetryableFetchError" || name === "TypeError";
}

export function validNewPassword(password: unknown, confirmation: unknown): password is string {
  return typeof password === "string" && typeof confirmation === "string"
    && password.length >= 12 && password.length <= 128
    && password.trim().length > 0 && password === confirmation;
}

export function emailConfirmationParameters(query: URLSearchParams): { tokenHash: string; type: "invite" | "recovery" } | null {
  // This endpoint never accepts signup/magic-link verification or a destination
  // supplied in the email URL. The session belongs to the verified Auth user.
  if (query.getAll("token_hash").length !== 1 || query.getAll("type").length !== 1) return null;
  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (!tokenHash || !/^[A-Za-z0-9_-]{20,256}$/.test(tokenHash)) return null;
  if (type !== "invite" && type !== "recovery") return null;
  return { tokenHash, type };
}
