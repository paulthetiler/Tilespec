import { canReadFinancial, requireActor } from "@/lib/auth";
import { issuedDocument } from "@/lib/operations/accounts-data";
import { notFound, pdfResponse } from "@/lib/documents/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// An issued document, printed from its stored snapshot. Money access only: anyone else is told it
// does not exist, and row-level security returns nothing to them anyway.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  if (!uuidPattern.test(id) || !uuidPattern.test(documentId)) return notFound();
  const { supabase, member } = await requireActor();
  if (!canReadFinancial(member)) return notFound();
  const record = await issuedDocument(supabase, id, documentId);
  if (!record) return notFound();
  return pdfResponse(record, new URL(request.url).searchParams.get("download") === "1");
}
