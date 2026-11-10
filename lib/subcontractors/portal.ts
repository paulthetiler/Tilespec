import "server-only";
import { cookies } from "next/headers";
import { createPublicClient } from "../supabase/public-client";
import { isPortalToken, type PortalSession } from "./claim";

/*
 * The subcontractor portal's connection. There is no account and no password: the person holds an
 * individually issued, revocable, time-limited link. Opening it stores the link's secret in an
 * http-only cookie limited to /subcontractors, so the secret does not stay in the address bar,
 * browser history or referrers. Every request sends that secret to a database function that checks
 * it again (live, not revoked, not expired) and returns only that one subcontractor's records.
 * The connection carries the publishable key only: no user session and no service key.
 */
export const PORTAL_COOKIE = "tilespec_subcontractor_link";
export const portalCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/subcontractors", maxAge: 60 * 60 * 12,
};
export const GANG_BUCKET = "gang-claims";

export type PortalError = { code?: string; message?: string };
const technical = /violates|constraint|duplicate key|relation |column |syntax|function .*does not exist|permission denied|schema|JWT|PGRST/i;
export const linkRefused = (error: PortalError | null) => !!error && error.code === "42501" && /link has expired or been withdrawn/i.test(error.message ?? "");
/** Words for the person. Database functions raise messages written for them; anything technical is replaced. */
export function portalErrorMessage(error: PortalError): string {
  const message = error.message ?? "";
  if (linkRefused(error)) return "Your link has expired or been withdrawn. Ask TileSpec for a new link.";
  if (["22023", "42501", "40001", "53400"].includes(error.code ?? "") && message && !technical.test(message)) return message;
  return "That did not work. Check your signal and try again. Nothing has been sent twice.";
}

export async function portalToken(): Promise<string | null> {
  const value = (await cookies()).get(PORTAL_COOKIE)?.value;
  return isPortalToken(value) ? value : null;
}
export function portalClient() {
  const connection = createPublicClient();
  if (!connection) throw new Error("The subcontractor portal is not configured.");
  return connection.client;
}

export type Portal = { token: string; session: PortalSession };
/**
 * The signed-in subcontractor, or why not: "none" (no link opened on this device), "expired"
 * (the link is no longer valid) or "unavailable" (the service could not be reached).
 */
export async function loadPortal(): Promise<Portal | { problem: "none" | "expired" | "unavailable" }> {
  const token = await portalToken();
  if (!token) return { problem: "none" };
  try {
    const { data, error } = await portalClient().rpc("portal_session", { p_token: token });
    if (error) return { problem: linkRefused(error) ? "expired" : "unavailable" };
    if (!data) return { problem: "expired" };
    return { token, session: data as PortalSession };
  } catch { return { problem: "unavailable" }; }
}
