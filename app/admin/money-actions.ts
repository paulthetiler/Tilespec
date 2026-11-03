"use server";

import { revalidatePath } from "next/cache";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { jobCostInput, labourRateInput } from "@/lib/operations/job-costs";
import { applicationInput, certifyInput, receiptInput, type ClaimableExtra } from "@/lib/operations/payments";
import { claimableExtrasFor } from "@/lib/operations/payments-data";
import { integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

// Job money (C3 onwards). Every action here is refused in the application for anyone without money
// access, and refused again by the database function it calls. Nothing is written directly.
const failure = (error: unknown): ActionState => ({ error: error instanceof Error ? error.message : "The change could not be saved. Try again." });
async function moneyActor() {
  const actor = await requireActor();
  if (!canReadFinancial(actor.member)) throw new ValidationError("Money access has not been authorised for your account.");
  return actor;
}
function reason(form: FormData) {
  const value = text(form, "reason", 1000, true);
  if (value.length < 3) throw new ValidationError("Give a short reason.");
  return value;
}
const refresh = (contract: string) => { revalidatePath(`/admin/contracts/${contract}/money`); revalidatePath("/admin/money"); };

export async function saveLabourRateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const data = labourRateInput(form), contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("save_labour_rate", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "Rate saved. Labour already worked is costed again at the rate in force on each day." };
  } catch (error) { return failure(error); }
}
export async function voidLabourRateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("void_labour_rate", { p_rate: uuid(form, "rate_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Rate voided. It stays on record with your reason." };
  } catch (error) { return failure(error); }
}
export async function recordJobCostAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const data = jobCostInput(form);
    checkRpc((await supabase.rpc("record_job_cost", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(data.contract_id);
    return { success: "Cost recorded against the job." };
  } catch (error) { return failure(error); }
}
export async function voidJobCostAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("void_job_cost", { p_entry: uuid(form, "entry_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Cost voided. Any materials matched to it are unmatched." };
  } catch (error) { return failure(error); }
}
export async function matchMaterialAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), data = { material_record_id: uuid(form, "material_record_id"), cost_entry_id: uuid(form, "cost_entry_id") };
    checkRpc((await supabase.rpc("match_material_cost", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "Matched." };
  } catch (error) { return failure(error); }
}
export async function unmatchMaterialAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("unmatch_material_cost", { p_match: uuid(form, "match_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Unmatched. The earlier match stays on record." };
  } catch (error) { return failure(error); }
}

// Payment applications (C4).
export async function createApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), extras: ClaimableExtra[] = await claimableExtrasFor(supabase, contract);
    const data = { contract_id: contract, ...applicationInput(form, extras) };
    checkRpc((await supabase.rpc("create_payment_application", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "Draft application saved. Check it, then submit it." };
  } catch (error) { return failure(error); }
}
export async function updateApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), extras = await claimableExtrasFor(supabase, contract), data = applicationInput(form, extras);
    checkRpc((await supabase.rpc("update_payment_application", { p_application: uuid(form, "application_id"), p_request_key: uuid(form, "request_key"), p_version: integer(form, "version", 1), p_data: data })).error);
    refresh(contract);
    return { success: "Draft corrected. The earlier figures stay on record." };
  } catch (error) { return failure(error); }
}
export async function submitApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("submit_payment_application", { p_application: uuid(form, "application_id"), p_request_key: uuid(form, "request_key"), p_version: integer(form, "version", 1) })).error);
    refresh(contract);
    return { success: "Submitted. Its figures and retention are now fixed." };
  } catch (error) { return failure(error); }
}
export async function certifyApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), data = certifyInput(form);
    checkRpc((await supabase.rpc("certify_payment_application", { p_application: uuid(form, "application_id"), p_request_key: uuid(form, "request_key"), p_version: integer(form, "version", 1), p_data: data })).error);
    refresh(contract);
    return { success: "Certificate recorded." };
  } catch (error) { return failure(error); }
}
export async function cancelApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("cancel_payment_application", { p_application: uuid(form, "application_id"), p_version: integer(form, "version", 1), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Cancelled. It stays on record with your reason." };
  } catch (error) { return failure(error); }
}
export async function recordReceiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), data = receiptInput(form);
    checkRpc((await supabase.rpc("record_payment_receipt", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "Payment recorded." };
  } catch (error) { return failure(error); }
}
export async function voidReceiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("void_payment_receipt", { p_receipt: uuid(form, "receipt_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Payment voided. It stays on record with your reason." };
  } catch (error) { return failure(error); }
}
