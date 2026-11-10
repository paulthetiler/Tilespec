"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { alreadyStored, inspectEvidence } from "@/lib/operations/evidence";
import { MAX_FILE_BYTES, text, uuid, ValidationError } from "@/lib/operations/validation";
import { invoiceDocument, parseClaimForm, parseSignatureForm, type ClaimMode, type ClaimSnapshot } from "@/lib/subcontractors/claim";
import { GANG_BUCKET, PORTAL_COOKIE, portalClient, portalCookieOptions, portalErrorMessage, portalToken } from "@/lib/subcontractors/portal";

/*
 * Everything a subcontractor does through their link. Each action reads the link's secret from the
 * http-only cookie and passes it to a database function that checks it again and is limited to that
 * one subcontractor. Sending an invoice never approves it: it opens the supervisor's check.
 */
export type PortalState = { error?: string; success?: string; preview?: ClaimSnapshot; sent?: { id: string; reference: string; generated: boolean } };
const NO_LINK = "Your link has expired or is not open on this device. Open the link TileSpec sent you again.";
const failure = (error: unknown, fallback: string): PortalState => ({ error: error instanceof ValidationError ? error.message : fallback });
const modeOf = (form: FormData): ClaimMode => (form.get("mode") === "upload" ? "upload" : "generated");

async function readFile(value: FormDataEntryValue | null, allowed: string[], missing: string) {
  if (!(value instanceof File) || value.size === 0) throw new ValidationError(missing);
  if (value.size > MAX_FILE_BYTES) throw new ValidationError("That file is larger than 4 MB. Take the photo again at a lower size, or send a PDF.");
  if (!allowed.includes(value.type)) throw new ValidationError(allowed.includes("application/pdf") ? "Send a PDF, JPEG or PNG file." : "Choose a JPEG or PNG photo.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  const checked = inspectEvidence(bytes, value.type); // the real type, from the file's own bytes
  return { bytes, mime: checked.mime, sha256: checked.sha256 };
}

/** Reserves the one path the file may be stored at, stores it there and confirms it. Safe to retry. */
async function storeFile(token: string, requestKey: string, invoiceId: string, kind: "invoice" | "photo", file: { bytes: Uint8Array; mime: string; sha256: string }) {
  const client = portalClient();
  const reserved = await client.rpc("portal_reserve_file", { p_token: token, p_request_key: requestKey, p_invoice: invoiceId, p_kind: kind,
    p_meta: { mime_type: file.mime, bytes: file.bytes.length, sha256: file.sha256 } });
  if (reserved.error) return { error: portalErrorMessage(reserved.error) };
  const slot = reserved.data as { file_id: string; object_path: string; mime_type: string; uploaded: boolean };
  if (!slot.uploaded) {
    const upload = await client.storage.from(GANG_BUCKET).upload(slot.object_path, file.bytes, { contentType: slot.mime_type, upsert: false });
    if (upload.error && !alreadyStored(upload.error)) return { error: "The file did not upload. Check your signal and try again; it will not be sent twice." };
  }
  const completed = await client.rpc("portal_complete_file", { p_token: token, p_file: slot.file_id });
  if (completed.error) return { error: portalErrorMessage(completed.error) };
  return { result: completed.data as { invoice_id: string; reference: string; status: string } };
}

/** What the invoice would be, priced by the database from the agreed rates. Nothing is saved. */
export async function previewInvoiceAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const payload = parseClaimForm(form, "generated");
    const { data, error } = await portalClient().rpc("portal_preview_invoice", { p_token: token, p_data: payload });
    if (error) return { error: portalErrorMessage(error) };
    return { preview: data as ClaimSnapshot };
  } catch (error) { return failure(error, "We could not work out your invoice. Check your signal and try again."); }
}

/**
 * Sends an invoice. Generated: the database prices it, the PDF is made from that fixed snapshot and
 * stored as the invoice document. Uploaded: the subcontractor's own file is checked and stored.
 * Either way the invoice then waits for the supervisor's check, exactly like any other.
 */
export async function submitInvoiceAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const mode = modeOf(form);
    const payload = parseClaimForm(form, mode);
    const requestKey = uuid(form, "request_key");
    const upload = mode === "upload" ? await readFile(form.get("file"), ["application/pdf", "image/jpeg", "image/png"], "Add your invoice: a PDF or a photo of it.") : null;
    const prepared = await portalClient().rpc("portal_prepare_invoice", { p_token: token, p_request_key: requestKey, p_data: payload });
    if (prepared.error) return { error: portalErrorMessage(prepared.error) };
    const invoice = prepared.data as { invoice_id: string; reference: string; status: string; snapshot: ClaimSnapshot };
    if (invoice.status !== "uploading") { // an earlier attempt already went through
      revalidatePath("/subcontractors");
      return { sent: { id: invoice.invoice_id, reference: invoice.reference, generated: mode === "generated" } };
    }
    let file = upload;
    if (!file) {
      const bytes = new Uint8Array(await renderDocumentPdf(invoiceDocument(invoice.snapshot)));
      file = { bytes, mime: "application/pdf", sha256: createHash("sha256").update(bytes).digest("hex") };
    }
    const stored = await storeFile(token, requestKey, invoice.invoice_id, "invoice", file);
    if (stored.error || !stored.result) return { error: stored.error };
    if (stored.result.status === "uploading") return { error: "The invoice has not been confirmed yet. Press send again; it will not be sent twice." };
    revalidatePath("/subcontractors");
    return { sent: { id: invoice.invoice_id, reference: invoice.reference, generated: mode === "generated" } };
  } catch (error) { return failure(error, "Your invoice was not sent. Check your signal and try again; it will not be sent twice."); }
}

/** A supporting photograph for one of the subcontractor's own invoices. */
export async function addPhotoAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const file = await readFile(form.get("file"), ["image/jpeg", "image/png"], "Choose a photo.");
    const stored = await storeFile(token, uuid(form, "request_key"), uuid(form, "invoice_id"), "photo", file);
    if (stored.error) return { error: stored.error };
    return { success: "Photo saved." };
  } catch (error) { return failure(error, "The photo was not saved. Try again."); }
}

export async function answerQueryAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const { error } = await portalClient().rpc("portal_answer_query", { p_token: token, p_invoice: uuid(form, "invoice_id"), p_note: text(form, "note", 2000, true) });
    if (error) return { error: portalErrorMessage(error) };
    revalidatePath("/subcontractors");
    return { success: "Your answer has been sent to the office." };
  } catch (error) { return failure(error, "Your answer was not sent. Try again."); }
}

export async function cancelInvoiceAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const { error } = await portalClient().rpc("portal_cancel_invoice", { p_token: token, p_invoice: uuid(form, "invoice_id"), p_reason: text(form, "reason", 500) || null });
    if (error) return { error: portalErrorMessage(error) };
    revalidatePath("/subcontractors");
    return { success: "Withdrawn. It will not be checked or paid." };
  } catch (error) { return failure(error, "The invoice was not withdrawn. Try again."); }
}

/** Signs the agreement that was shown. The address and browser are recorded with the signature as evidence. */
export async function signAgreementAction(_: PortalState, form: FormData): Promise<PortalState> {
  const token = await portalToken();
  if (!token) return { error: NO_LINK };
  try {
    const signature = parseSignatureForm(form);
    const requestHeaders = await headers();
    const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
    const { error } = await portalClient().rpc("portal_sign_agreement", { p_token: token, p_agreement: uuid(form, "agreement_id"),
      p_data: { ...signature, ...(ip ? { ip } : {}), user_agent: (requestHeaders.get("user-agent") ?? "").slice(0, 400) } });
    if (error) return { error: portalErrorMessage(error) };
    revalidatePath("/subcontractors", "layout");
    return { success: "Signed. Thank you. You can now send invoices." };
  } catch (error) { return failure(error, "The agreement was not signed. Check your signal and try again."); }
}

/** Removes the link from this device. The link itself stays valid until it expires or TileSpec withdraws it. */
export async function leavePortalAction() {
  (await cookies()).set(PORTAL_COOKIE, "", { ...portalCookieOptions, maxAge: 0 });
  redirect("/subcontractors?left=1");
}
