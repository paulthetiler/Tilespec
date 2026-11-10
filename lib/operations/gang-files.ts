import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alreadyStored, inspectEvidence } from "./evidence";
import { MAX_FILE_BYTES, ValidationError } from "./validation";
import { rpcErrorMessage } from "./errors";

export const GANG_BUCKET = "gang-claims";

/** Reads a chosen file, checks its real type from its bytes and works out its fingerprint. */
export async function readGangFile(value: FormDataEntryValue | null, { photoOnly = false } = {}) {
  if (!(value instanceof File) || value.size === 0) throw new ValidationError(photoOnly ? "Choose a photo." : "Add your invoice: a PDF or a photo of it.");
  if (value.size > MAX_FILE_BYTES) throw new ValidationError("That file is larger than 4 MB. Take the photo again at a lower size, or send a PDF.");
  const allowed = photoOnly ? ["image/jpeg", "image/png"] : ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(value.type)) throw new ValidationError(photoOnly ? "Choose a JPEG or PNG photo." : "Send a PDF, JPEG or PNG file.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  const type = inspectEvidence(bytes, value.type);
  return { bytes, mime: type.mime, sha256: type.sha256 };
}

/**
 * Stores reserved file bytes with the person's own session (storage policies allow only the
 * reserved path, only for the person who reserved it), reads them back to confirm the exact
 * bytes, then completes the reservation. No service key is used. A retry is safe: an object
 * stored by an earlier attempt is accepted only if its bytes match.
 */
export async function storeGangFile(supabase: SupabaseClient, fileId: string, bytes: Uint8Array) {
  const file = await supabase.from("gang_invoice_files").select("id,object_path,mime_type,bytes,sha256,uploaded_at").eq("id", fileId).maybeSingle();
  if (file.error || !file.data) throw new Error("The upload could not be prepared. Try again.");
  if (!file.data.uploaded_at) {
    const upload = await supabase.storage.from(GANG_BUCKET).upload(file.data.object_path, bytes, { contentType: file.data.mime_type, upsert: false });
    if (upload.error && !alreadyStored(upload.error)) throw new Error("The file did not upload. Check your signal and try again; it will not be sent twice.");
    const stored = await supabase.storage.from(GANG_BUCKET).download(file.data.object_path);
    if (stored.error || !stored.data) throw new Error("The upload could not be confirmed. Try again; it will not be sent twice.");
    const check = inspectEvidence(new Uint8Array(await stored.data.arrayBuffer()), file.data.mime_type);
    if (check.sha256 !== file.data.sha256) throw new Error("The stored file does not match the one you chose. Choose the same file and try again.");
  }
  const completion = await supabase.rpc("complete_gang_file", { p_file: file.data.id });
  if (completion.error) throw new Error(rpcErrorMessage(completion.error));
}
