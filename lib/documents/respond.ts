import "server-only";
import { NextResponse } from "next/server";
import { documentModel, type DocumentRecord } from "./model";
import { renderDocumentPdf } from "./pdf";

const safeName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";
/** A PDF response for a document. Never cached; opened inline unless a download is asked for. */
export async function pdfResponse(record: DocumentRecord, download: boolean, extra: Record<string, string> = {}) {
  const bytes = await renderDocumentPdf(documentModel(record));
  const name = `${safeName(record.reference ?? `draft-${record.kind}`)}.pdf`;
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...extra } });
}
export const notFound = (message = "Not found") => new NextResponse(message, { status: 404, headers: { "Cache-Control": "private, no-store" } });
