"use server";

import { revalidatePath } from "next/cache";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { jobCostInput, labourRateInput } from "@/lib/operations/job-costs";
import { text, uuid, ValidationError } from "@/lib/operations/validation";
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
