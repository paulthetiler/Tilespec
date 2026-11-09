"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { parseGangInvoiceForm } from "@/lib/operations/gang-invoices";
import { readGangFile, storeGangFile } from "@/lib/operations/gang-files";
import { text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

const gangRoles = ["lead_installer", "subcontract_installer"];
const message = (error: unknown, fallback: string) => (error instanceof ValidationError || error instanceof Error ? error.message : fallback);
const friendly = (error: { code?: string; message?: string }) =>
  /Request key reused/i.test(error.message ?? "")
    ? "You changed the details after an earlier attempt. Check Your invoices: if it is not there, refresh this page and send it again."
    : rpcErrorMessage(error);

function refresh(contractId?: string) {
  revalidatePath("/admin/gang");
  revalidatePath("/admin/gang-invoices");
  if (contractId) revalidatePath(`/admin/supervisor/sites/${contractId}`, "layout");
}

/** The gang's whole submission: details, the invoice file, then the check request (made by the database). */
export async function submitGangInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  let reference = "";
  try {
    if (!gangRoles.includes(member.role)) throw new ValidationError("Only gang members can send gang invoices.");
    const input = parseGangInvoiceForm(form);
    const requestKey = uuid(form, "request_key");
    const file = await readGangFile(form.get("file"));
    const created = await supabase.rpc("submit_gang_invoice", {
      p_request_key: requestKey,
      p_data: { ...input, file: { mime_type: file.mime, bytes: file.bytes.length, sha256: file.sha256 } },
    });
    if (created.error) return { error: friendly(created.error) };
    const invoiceId = String(created.data);
    const document = await supabase.from("gang_invoice_files").select("id,sha256").eq("invoice_id", invoiceId).eq("kind", "invoice").maybeSingle();
    if (document.error || !document.data) return { error: "Your invoice was saved but the file upload could not start. Open Your invoices and send the file again." };
    if (document.data.sha256 !== file.sha256) return { error: "This attempt used a different file. Open Your invoices to finish the earlier one, or refresh and start again." };
    await storeGangFile(supabase, document.data.id, file.bytes);
    const saved = await supabase.from("gang_invoices").select("reference,status").eq("id", invoiceId).maybeSingle();
    if (saved.error || !saved.data || saved.data.status === "uploading") return { error: "The upload has not been confirmed yet. Try again; it will not be sent twice." };
    reference = saved.data.reference;
    refresh(input.contract_id);
  } catch (error) {
    return { error: message(error, "Your invoice was not sent. Check your signal and try again; it will not be sent twice.") };
  }
  redirect(`/admin/gang?sent=${encodeURIComponent(reference)}`);
}

/** Finish an upload that did not complete, using the same file. */
export async function finishGangUploadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const invoiceId = uuid(form, "invoice_id");
    const file = await readGangFile(form.get("file"));
    const document = await supabase.from("gang_invoice_files").select("id,sha256,invoice_id").eq("invoice_id", invoiceId).eq("kind", "invoice").maybeSingle();
    if (document.error || !document.data) return { error: "That invoice could not be found." };
    if (document.data.sha256 !== file.sha256) return { error: "This is not the same file you chose before. Choose the original file, or withdraw this invoice and send a new one." };
    await storeGangFile(supabase, document.data.id, file.bytes);
    refresh();
    return { success: "Sent. The supervisor has been asked to check the work." };
  } catch (error) {
    return { error: message(error, "The upload was not confirmed. Try again.") };
  }
}

export async function cancelGangInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const result = await supabase.rpc("cancel_gang_invoice", { p_invoice: uuid(form, "invoice_id"), p_reason: text(form, "reason", 500) || null });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh();
    return { success: "Withdrawn. It will not be checked or paid." };
  } catch (error) {
    return { error: message(error, "Could not withdraw the invoice.") };
  }
}

export async function answerGangQueryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const result = await supabase.rpc("answer_gang_query", { p_invoice: uuid(form, "invoice_id"), p_note: text(form, "note", 2000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh();
    return { success: "Answer sent to the office." };
  } catch (error) {
    return { error: message(error, "Could not send your answer.") };
  }
}

/** A photo for an invoice: the gang's own evidence or the supervisor's. The database decides which. */
export async function addClaimPhotoAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const invoiceId = uuid(form, "invoice_id");
    const file = await readGangFile(form.get("file"), { photoOnly: true });
    const reserved = await supabase.rpc("reserve_gang_photo", {
      p_request_key: uuid(form, "request_key"), p_invoice: invoiceId,
      p_meta: { mime_type: file.mime, bytes: file.bytes.length, sha256: file.sha256 },
    });
    if (reserved.error) return { error: friendly(reserved.error) };
    await storeGangFile(supabase, String(reserved.data), file.bytes);
    const invoice = await supabase.from("gang_invoices").select("contract_id").eq("id", invoiceId).maybeSingle();
    refresh(invoice.data?.contract_id);
    return { success: "Photo saved." };
  } catch (error) {
    return { error: message(error, "The photo was not saved. Try again.") };
  }
}
