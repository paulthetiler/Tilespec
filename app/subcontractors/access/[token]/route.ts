import { NextResponse } from "next/server";
import { isPortalToken } from "@/lib/subcontractors/claim";
import { PORTAL_COOKIE, portalClient, portalCookieOptions } from "@/lib/subcontractors/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The personal link TileSpec sends. It is checked, its secret moves into an http-only cookie and the
// person lands on the portal with a clean address, so the secret is not left in history or referrers.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A relative redirect: the person stays on exactly the host they opened, so the cookie set here is sent with the next request.
  const respond = (search: string, cookie?: string) => {
    const response = new NextResponse(null, { status: 303, headers: { Location: `/subcontractors${search}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
    if (cookie !== undefined) response.cookies.set(PORTAL_COOKIE, cookie, cookie ? portalCookieOptions : { ...portalCookieOptions, maxAge: 0 });
    return response;
  };
  if (!isPortalToken(token)) return respond("?link=expired", "");
  try {
    const { data, error } = await portalClient().rpc("portal_session", { p_token: token });
    if (error || !data) return respond(error && error.code !== "42501" ? "?link=unavailable" : "?link=expired", "");
  } catch { return respond("?link=unavailable"); }
  return respond("", token);
}
