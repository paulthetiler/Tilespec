"use server";
import { revalidatePath } from "next/cache";
import { requireFinancialActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { parseDecisionForm, parseMoney } from "@/lib/operations/gang-invoices";
import { integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

const message = (error: unknown, fallback: string) => (error instanceof ValidationError ? error.message : fallback);
const done: Record<string, string> = {
  approve: "Approved for payment. The gang can see the approval and payment date.",
  recheck: "Sent back to the supervisor to check again. It is on their site dashboard now.",
  query_gang: "Question sent to the gang.",
  return: "Returned to the gang for correction.",
  reject: "Rejected. The gang can see the reason.",
  mark_paid: "Payment recorded.",
};
function refresh(invoiceId?: string) {
  revalidatePath("/admin/gang-invoices");
  if (invoiceId) revalidatePath(`/admin/gang-invoices/${invoiceId}`);
  revalidatePath("/admin");
}

/** Every office decision on a gang invoice. The database requires money access and checks every value again. */
export async function decideGangInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const invoiceId = uuid(form, "invoice_id");
    const { action, data } = parseDecisionForm(form, form.getAll("line_id").map(String));
    const requestKey = uuid(form, "request_key"), version = integer(form, "version", 1);
    const result = await supabase.rpc("decide_gang_invoice", { p_request_key: requestKey, p_invoice: invoiceId, p_version: version, p_action: action, p_data: data });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(invoiceId);
    return { success: done[action] };
  } catch (error) { return { error: message(error, "The decision was not saved. Try again; it will not be recorded twice.") }; }
}

export async function saveGangSubcontractAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const cycle = text(form, "payment_cycle", 20) || "weekly";
    if (!["weekly", "fortnightly", "custom"].includes(cycle)) throw new ValidationError("Choose weekly, fortnightly or custom terms.");
    const version = text(form, "version", 10);
    const anchor = text(form, "cycle_anchor", 10);
    const result = await supabase.rpc("save_gang_subcontract", { p_data: {
      contract_id: uuid(form, "contract_id"), team_id: uuid(form, "team_id"), payment_cycle: cycle,
      pay_weekday: integer(form, "pay_weekday", 1, 7), payment_days: integer(form, "payment_days", 0, 90),
      ...(anchor ? { cycle_anchor: anchor } : {}), terms_note: text(form, "terms_note", 2000),
      active: form.get("active") !== "false", ...(version ? { version: Number(version) } : {}),
    } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    revalidatePath("/admin/gang-invoices/setup");
    return { success: "Saved. Gang members on this gang can now send invoices for this job." };
  } catch (error) { return { error: message(error, "The terms were not saved.") }; }
}

export async function saveGangRateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const rate = parseMoney(text(form, "rate", 20, true), "the rate");
    if (!rate || rate <= 0) throw new ValidationError("Enter the agreed rate.");
    const area = text(form, "work_area_id", 36);
    const from = text(form, "effective_from", 10);
    const result = await supabase.rpc("save_gang_rate", { p_request_key: uuid(form, "request_key"), p_data: {
      subcontract_id: uuid(form, "subcontract_id"), unit: text(form, "unit", 4, true), rate,
      ...(area ? { work_area_id: area } : {}), ...(from ? { effective_from: from } : {}), description: text(form, "description", 200),
    } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    revalidatePath("/admin/gang-invoices/setup");
    return { success: "Rate saved." };
  } catch (error) { return { error: message(error, "The rate was not saved.") }; }
}

export async function voidGangRateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("void_gang_rate", { p_rate: uuid(form, "rate_id"), p_reason: text(form, "reason", 1000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    revalidatePath("/admin/gang-invoices/setup");
    return { success: "Rate withdrawn. It is kept in the history." };
  } catch (error) { return { error: message(error, "The rate was not withdrawn.") }; }
}
