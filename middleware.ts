import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { workflowPreviewExposed } from "./lib/operations/next-actions/flags";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/preview/")) {
    if (!workflowPreviewExposed()) return new NextResponse("Not found", { status: 404 });
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/auth/set-password", "/preview/:path*"],
};
