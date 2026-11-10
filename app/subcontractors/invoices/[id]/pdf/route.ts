import { NextResponse } from "next/server";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { invoiceDocument, type ClaimSnapshot } from "@/lib/subcontractors/claim";
import { portalClient, portalToken } from "@/lib/subcontractors/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const plain = (message: string, status: number) => new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });

// The subcontractor's own copy of an invoice created in the portal, printed again from its fixed
// snapshot. The link's secret is checked by the database, which returns only their own invoice.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await portalToken();
  if (!token || !/^[0-9a-f-]{36}$/i.test(id)) return plain("Open your TileSPEC link again to see this invoice.", 404);
  const { data, error } = await portalClient().rpc("portal_invoice", { p_token: token, p_invoice: id });
  if (error) return plain(error.code === "42501" ? "Your link has expired or been withdrawn. Ask TileSPEC for a new link." : "This invoice is temporarily unavailable. Please try again.", error.code === "42501" ? 404 : 503);
  const invoice = data as { reference: string; source: string; status: string; snapshot: ClaimSnapshot | null } | null;
  if (!invoice || invoice.source !== "generated" || !invoice.snapshot || invoice.status === "uploading") return plain("Not found", 404);
  const bytes = await renderDocumentPdf(invoiceDocument(invoice.snapshot));
  const name = `invoice-${invoice.snapshot.invoice_number.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || invoice.reference}.pdf`;
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}
