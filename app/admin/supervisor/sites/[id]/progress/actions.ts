"use server";
import { revalidatePath } from "next/cache";
import { requireSite } from "@/app/admin/supervisor/site-access";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { gangUnits, parseQuantity, parseVerificationForm } from "@/lib/operations/gang-invoices";
import { integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

const message = (error: unknown, fallback: string) => (error instanceof ValidationError ? error.message : fallback);
function refresh(contractId: string, invoiceId?: string) {
  revalidatePath(`/admin/supervisor/sites/${contractId}`);
  revalidatePath(`/admin/supervisor/sites/${contractId}/progress`);
  if (invoiceId) revalidatePath(`/admin/supervisor/sites/${contractId}/progress/${invoiceId}`);
  revalidatePath("/admin/gang-invoices");
}

/** A site measurement: new work in its period (never a running total), with its quality result. */
export async function recordGangProgress(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const contractId = uuid(form, "contract_id");
    const { supabase, contract } = await requireSite(contractId);
    if (!contract) throw new ValidationError("Only the job's supervisor or the office can record measurements.");
    const unit = text(form, "unit", 4) || "m2";
    if (!(gangUnits as readonly string[]).includes(unit)) throw new ValidationError("Choose m², linear metres or items.");
    const quality = text(form, "quality_status", 30, true);
    if (!["passed", "correction_required"].includes(quality)) throw new ValidationError("Choose the quality result.");
    const periodStart = text(form, "period_start", 10);
    const measurement = {
      contract_id: contractId, team_id: uuid(form, "team_id"), work_area_id: uuid(form, "work_area_id"), unit,
      quantity: parseQuantity(text(form, "quantity", 20, true), "the measurement"), quality_status: quality,
      note: text(form, "note", 2000), ...(periodStart ? { period_start: periodStart } : {}),
    };
    const result = await supabase.rpc("record_gang_measurement", { p_request_key: uuid(form, "request_key"), p_data: measurement });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(contractId);
    return { success: "Measurement recorded. This is not a payment approval." };
  } catch (error) { return { error: message(error, "Could not save the measurement.") }; }
}

export async function verifyGangInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  let contractId = "", invoiceId = "";
  try {
    contractId = uuid(form, "contract_id");
    invoiceId = uuid(form, "invoice_id");
    const { supabase, contract } = await requireSite(contractId);
    if (!contract) throw new ValidationError("Only the job's supervisor or the office can verify gang invoices.");
    const lineIds = form.getAll("line_id").map(String);
    const data = parseVerificationForm(form, lineIds, form.getAll("extra_id").map(String));
    const result = await supabase.rpc("verify_gang_invoice", { p_request_key: uuid(form, "request_key"), p_invoice: invoiceId, p_version: integer(form, "version", 1), p_data: data });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(contractId, invoiceId);
    return { success: "Verification sent to the office. The request has been cleared from your list." };
  } catch (error) { return { error: message(error, "The verification was not sent. Try again; it will not be sent twice.") }; }
}

export async function clearGangCorrectionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const contractId = uuid(form, "contract_id");
    const { supabase, contract } = await requireSite(contractId);
    if (!contract) throw new ValidationError("Only the job's supervisor or the office can check corrections.");
    const result = await supabase.rpc("clear_gang_correction", { p_check: uuid(form, "check_id"), p_note: text(form, "note", 2000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(contractId);
    return { success: "Correction recorded as completed and checked." };
  } catch (error) { return { error: message(error, "Could not record the correction.") }; }
}

export async function voidGangMeasurementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const contractId = uuid(form, "contract_id");
    const { supabase, contract } = await requireSite(contractId);
    if (!contract) throw new ValidationError("Only the job's supervisor or the office can void measurements.");
    const result = await supabase.rpc("void_gang_measurement", { p_check: uuid(form, "check_id"), p_reason: text(form, "reason", 2000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(contractId);
    return { success: "Measurement voided. It is kept in the history." };
  } catch (error) { return { error: message(error, "Could not void the measurement.") }; }
}
