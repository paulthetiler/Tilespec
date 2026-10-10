import { requireActor } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.from("document_revisions").select("object_path,uploaded_at").eq("id", id).maybeSingle();
  if (error) return new NextResponse("Document service unavailable", { status: 503 });
  if (!data?.uploaded_at) return new NextResponse("Not found", { status: 404 });
  // User-scoped Storage RLS is checked again when signing. URLs expire in 60s.
  const signed = await supabase.storage.from("tilespec-evidence").createSignedUrl(data.object_path, 60, { download: true });
  if (signed.error || !signed.data?.signedUrl) return new NextResponse("Document unavailable", { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
