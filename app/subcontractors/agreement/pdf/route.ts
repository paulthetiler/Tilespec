import { NextResponse } from "next/server";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { agreementDocument, type PortalAgreement } from "@/lib/subcontractors/claim";
import { portalClient, portalToken } from "@/lib/subcontractors/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const plain = (message: string, status: number) => new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });

// The subcontractor's copy of their agreement: the exact text issued, with the signature record once signed.
export async function GET(request: Request) {
  const token = await portalToken();
  if (!token) return plain("Open your TileSPEC link again to see your agreement.", 404);
  const { data, error } = await portalClient().rpc("portal_agreement", { p_token: token });
  if (error) return plain(error.code === "42501" ? "Your link has expired or been withdrawn. Ask TileSPEC for a new link." : "The agreement is temporarily unavailable. Please try again.", error.code === "42501" ? 404 : 503);
  if (!data) return plain("Not found", 404);
  const agreement = data as PortalAgreement;
  const bytes = await renderDocumentPdf(agreementDocument(agreement));
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="subcontractor-agreement-${agreement.reference}.pdf"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}
