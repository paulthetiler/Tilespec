import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { GANG_BUCKET } from "@/lib/operations/gang-files";

// Row-level security decides: the invoice document only for money-access office users and the
// gang itself; photos also for the job's supervisor. A short-lived signed link, never cached.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const file = await supabase.from("gang_invoice_files").select("object_path,uploaded_at").eq("id", id).maybeSingle();
  if (file.error) return new NextResponse("File service unavailable", { status: 503 });
  if (!file.data || !file.data.uploaded_at) return new NextResponse("Not found", { status: 404 });
  const signed = await supabase.storage.from(GANG_BUCKET).createSignedUrl(file.data.object_path, 60);
  if (signed.error || !signed.data?.signedUrl) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
