import { NextResponse } from "next/server";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { previewDocument } from "@/lib/operations/accounts-data";
import { notFound, pdfResponse } from "@/lib/documents/respond";
import { rpcErrorMessage } from "@/lib/operations/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ["payment_application", "final_account", "invoice", "default_payment_notice", "variation_schedule", "daywork_summary", "statement"];

// The finished document as it would be issued now, marked "Draft · not issued". The database works
// out every figure; nothing is saved. Money access only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams, kind = query.get("kind") ?? "", application = query.get("application");
  if (!uuidPattern.test(id) || !KINDS.includes(kind) || (application !== null && !uuidPattern.test(application))) return notFound();
  const { supabase, member } = await requireActor();
  if (!canReadFinancial(member)) return notFound();
  try {
    const record = await previewDocument(supabase, { kind, contract_id: id, ...(application ? { application_id: application } : {}) });
    return pdfResponse({ ...record, preview: true }, false);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42501") return notFound();
    return new NextResponse(rpcErrorMessage({ code, message: (error as Error).message }), { status: 422, headers: { "Cache-Control": "private, no-store" } });
  }
}
