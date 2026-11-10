import { NextResponse } from "next/server";
import { requireFinancialActor } from "@/lib/auth";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { agreementDocument, type PortalAgreement } from "@/lib/subcontractors/claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The office's copy of an issued or signed agreement: the exact text issued and its signature record.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireFinancialActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const row = await supabase.from("subcontractor_agreements")
    .select("id,reference,status,title,version_label,body,body_sha256,parties,issued_at,issued_by_name,signed_at,signer_name,signer_position,signature_text,evidence_sha256").eq("id", id).maybeSingle();
  if (row.error) return new NextResponse("Agreement service unavailable", { status: 503 });
  if (!row.data) return new NextResponse("Not found", { status: 404 });
  const a = row.data;
  const bytes = await renderDocumentPdf(agreementDocument({ ...a, status: a.signed_at ? "signed" : "issued", issued_by: a.issued_by_name } as PortalAgreement));
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="subcontractor-agreement-${a.reference}.pdf"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
