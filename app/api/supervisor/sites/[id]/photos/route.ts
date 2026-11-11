import { boundedPhotoForm } from "@/lib/operations/photo-form";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { alreadyStored, inspectEvidence, verifyStoredEvidence } from "@/lib/operations/evidence";
import { uuid, text, MAX_FILE_BYTES, ValidationError } from "@/lib/operations/validation";
import { rpcErrorMessage } from "@/lib/operations/errors";

// A daily site photograph, verified the same way as stop, snag and daywork evidence: reserved with its
// exact hash, uploaded with the person's own session, read back and checked, then confirmed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, member } = await requireActor();
  const { id } = await params;
  try {
    const form = await boundedPhotoForm(request); form.set("contract_id", id);
    const contract = uuid(form, "contract_id"), key = uuid(form, "request_key"), file = form.get("file");
    const caption = text(form, "caption", 300), area = text(form, "work_area_id", 36) ? uuid(form, "work_area_id") : null;
    if (!(file instanceof File) || !["image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > MAX_FILE_BYTES)
      return NextResponse.json({ error: "Choose a JPEG or PNG photograph between 1 byte and 4 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), type = inspectEvidence(bytes, file.type);
    const meta = { mime_type: type.mime, sha256: type.sha256, bytes: bytes.length, ...(caption ? { caption } : {}), ...(area ? { work_area_id: area } : {}) };
    const reservation = await supabase.rpc("reserve_site_photo", { p_request_key: key, p_contract: contract, p_meta: meta });
    if (reservation.error) return NextResponse.json({ error: rpcErrorMessage(reservation.error) }, { status: reservation.error.code === "42501" ? 403 : 409 });
    const metadata = await supabase.from("site_photos").select("id,contract_id,actor_id,object_path,sha256,bytes,mime_type,uploaded_at").eq("id", reservation.data).single();
    if (metadata.error || !metadata.data || metadata.data.actor_id !== member.user_id || metadata.data.contract_id !== contract)
      return NextResponse.json({ error: "Photo reservation unavailable." }, { status: 403 });
    if (!metadata.data.uploaded_at) {
      const upload = await supabase.storage.from("supervisor-evidence").upload(metadata.data.object_path, bytes, { contentType: type.mime, upsert: false });
      if (upload.error && !alreadyStored(upload.error))
        return NextResponse.json({ error: "The photograph was not uploaded. It has not been saved; retry the same photograph." }, { status: 503 });
    }
    const stored = await supabase.storage.from("supervisor-evidence").download(metadata.data.object_path);
    if (stored.error || !stored.data) return NextResponse.json({ error: "Upload remains pending. Retry the same photograph; it has not been confirmed saved." }, { status: 503 });
    try { verifyStoredEvidence(new Uint8Array(await stored.data.arrayBuffer()), metadata.data); }
    catch { return NextResponse.json({ error: "The stored photograph does not match the one you chose, so it is not saved. Retry the same photograph." }, { status: 409 }); }
    const completion = await supabase.rpc("confirm_site_photo", { p_photo: metadata.data.id, p_sha256: metadata.data.sha256 });
    if (completion.error) return NextResponse.json({ error: rpcErrorMessage(completion.error) }, { status: 409 });
    return NextResponse.json({ id: metadata.data.id, verified: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ValidationError ? error.message : "Could not confirm the photograph was saved. Retry with the same file." },
      { status: error instanceof ValidationError ? 400 : 503 });
  }
}
