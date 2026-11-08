import { NextResponse } from "next/server";
import { pdfResponse } from "@/lib/documents/respond";
import { readSharedDocument } from "@/lib/supabase/shared-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const gone = (message: string, status: number) => new NextResponse(message, { status,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });

// One issued document opened from a link TileSPEC sent. The link is revocable and expires.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let record;
  try { record = await readSharedDocument(token); } catch { return gone("This document is temporarily unavailable. Please try again later.", 503); }
  if (!record) return gone("This link has expired or been withdrawn. Please ask TileSPEC for a new link.", 404);
  return pdfResponse(record, new URL(request.url).searchParams.get("download") === "1", { "X-Robots-Tag": "noindex, nofollow" });
}
