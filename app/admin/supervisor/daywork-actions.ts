"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActor } from "@/lib/auth";
import { isRecordId } from "@/lib/operations/daily-input";
import { chargeInput, clientAuthorisationInput, dayworkInput, decisionInput, linesInput, pricingInput, rateInput, signoffInput } from "@/lib/operations/daywork-input";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { integer, uuid, ValidationError } from "@/lib/operations/validation";
import type { DailyActionState } from "@/components/site/daily-form";

const uncertainError = "We could not confirm the save. Your entries are kept here. Check the daywork, then retry the same details.";
function refresh(contract: string, daywork?: string) {
  const site = `/admin/supervisor/sites/${contract}`;
  for (const path of ["", "/commercial", "/activity", "/messages"]) revalidatePath(`${site}${path}`);
  if (daywork) revalidatePath(`${site}/dayworks/${daywork}`);
  revalidatePath(`/admin/contracts/${contract}`);
  revalidatePath("/admin");
}
function declined(error: { code?: string; message?: string }): DailyActionState {
  return { error: rpcErrorMessage(error), uncertain: !error.code || !(/^[A-Z0-9]{5}$/.test(error.code) || error.code.startsWith("PGRST")) };
}
function failure(error: unknown, attempted: boolean): DailyActionState {
  return { error: error instanceof ValidationError ? error.message : uncertainError, uncertain: attempted && !(error instanceof ValidationError) };
}
/** A save counts only once the saved daywork itself shows it. */
async function savedDaywork(supabase: SupabaseClient, id: string, contract: string) {
  const saved = await supabase.from("dayworks").select("*").eq("id", id).single();
  if (saved.error || !saved.data || saved.data.contract_id !== contract) throw new Error("Unconfirmed daywork");
  return saved.data as { id: string; number: number; version: number; site_status: string; office_status: string | null; created_by: string; request_key: string;
    signoff_status: string; client_status: string; commercial_status: string; lines_version: number };
}

export type CreateDayworkState = DailyActionState & { href?: string };
export async function createDayworkAction(_: CreateDayworkState, form: FormData): Promise<CreateDayworkState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const data = dayworkInput(form), key = uuid(form, "request_key"), sendNow = form.get("send_now") === "on";
    if (sendNow && !data.lines.length) throw new ValidationError("Add at least one line of labour, plant or materials before sending, or untick Send to the office now.");
    attempted = true;
    const result = await supabase.rpc("create_daywork", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    let saved = await savedDaywork(supabase, result.data, data.contract_id);
    if (saved.created_by !== member.user_id || saved.request_key !== key) throw new Error("Unconfirmed daywork");
    if (sendNow && saved.site_status !== "sent") {
      const sent = await supabase.rpc("send_daywork", { p_daywork: saved.id, p_request_key: uuid(form, "send_key"), p_version: saved.version });
      if (sent.error) return { ...declined(sent.error), error: `DW-${saved.number} is saved, but it was not sent: ${rpcErrorMessage(sent.error)} Open it to send it.` };
      saved = await savedDaywork(supabase, saved.id, data.contract_id);
      if (saved.site_status !== "sent") throw new Error("Unconfirmed send");
    }
    refresh(data.contract_id, saved.id);
    return { id: saved.id, href: `/admin/supervisor/sites/${data.contract_id}/dayworks/${saved.id}`,
      success: sendNow ? `DW-${saved.number} is saved and sent to the office.` : `DW-${saved.number} is saved. Send it to the office when it is ready.` };
  } catch (error) { return failure(error, attempted); }
}

export async function saveDayworkLinesAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), version = integer(form, "version", 1), key = uuid(form, "request_key");
    const lines = linesInput(form), sendNow = form.get("send_now") === "on";
    if (!lines.length) throw new ValidationError("Add at least one line of labour, plant or materials.");
    attempted = true;
    const result = await supabase.rpc("save_daywork_lines", { p_daywork: daywork, p_request_key: key, p_version: version, p_data: { lines } });
    if (result.error) return declined(result.error);
    let saved = await savedDaywork(supabase, daywork, contract);
    if (result.data !== daywork || saved.lines_version < 2) throw new Error("Unconfirmed lines");
    if (sendNow && saved.site_status !== "sent") {
      const sent = await supabase.rpc("send_daywork", { p_daywork: daywork, p_request_key: uuid(form, "send_key"), p_version: saved.version });
      if (sent.error) return { ...declined(sent.error), error: `The lines are saved, but it was not sent: ${rpcErrorMessage(sent.error)}` };
      saved = await savedDaywork(supabase, daywork, contract);
      if (saved.site_status !== "sent") throw new Error("Unconfirmed send");
    }
    refresh(contract, daywork);
    return { id: daywork, success: sendNow ? "Saved and sent to the office again." : "Lines saved. Send it to the office when it is ready." };
  } catch (error) { return failure(error, attempted); }
}

export async function sendDayworkAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), version = integer(form, "version", 1), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("send_daywork", { p_daywork: daywork, p_request_key: key, p_version: version });
    if (result.error) return declined(result.error);
    const saved = await savedDaywork(supabase, daywork, contract);
    if (result.data !== daywork || saved.site_status !== "sent") throw new Error("Unconfirmed send");
    refresh(contract, daywork);
    return { id: daywork, success: "Sent to the office. You will see their decision here and on Today." };
  } catch (error) { return failure(error, attempted); }
}

export async function recordSignoffAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), key = uuid(form, "request_key"), data = signoffInput(form);
    attempted = true;
    const result = await supabase.rpc("record_daywork_signoff", { p_daywork: daywork, p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await supabase.from("daywork_signoffs").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.daywork_id !== daywork || saved.data.recorded_by !== member.user_id || saved.data.request_key !== key
      || saved.data.outcome !== data.outcome) throw new Error("Unconfirmed sign-off");
    refresh(contract, daywork);
    return { id: result.data, success: data.outcome === "signed" ? "Signature recorded. It confirms the work, hours and materials, not payment."
      : "Recorded. The daywork is kept without a signature." };
  } catch (error) { return failure(error, attempted); }
}

export async function decideDayworkAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), version = integer(form, "version", 1), key = uuid(form, "request_key");
    const data = decisionInput(form);
    attempted = true;
    const result = await supabase.rpc("decide_daywork", { p_daywork: daywork, p_request_key: key, p_version: version, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await savedDaywork(supabase, daywork, contract);
    const expected = { approve: "approved", request_detail: "more_detail", reject: "rejected" }[data.decision as "approve" | "request_detail" | "reject"];
    if (result.data !== daywork || saved.office_status !== expected) throw new Error("Unconfirmed decision");
    refresh(contract, daywork);
    return { id: daywork, success: data.decision === "approve" ? "Approved. The client's authorisation and the charge are recorded separately."
      : data.decision === "reject" ? "Rejected. The supervisor sees why." : "Sent back to site for more detail." };
  } catch (error) { return failure(error, attempted); }
}

export async function clientAuthorisationAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), key = uuid(form, "request_key"), data = clientAuthorisationInput(form);
    attempted = true;
    const result = await supabase.rpc("record_daywork_client_authorisation", { p_daywork: daywork, p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await supabase.from("daywork_client_authorisations").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.daywork_id !== daywork || saved.data.recorded_by !== member.user_id || saved.data.request_key !== key
      || saved.data.outcome !== data.outcome) throw new Error("Unconfirmed client authorisation");
    refresh(contract, daywork);
    return { id: result.data, success: data.outcome === "authorised" ? "The client's authorisation is recorded." : "The client's refusal is recorded." };
  } catch (error) { return failure(error, attempted); }
}

export async function saveRateAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const data = rateInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("save_daywork_rate", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await supabase.from("contract_daywork_rates").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.contract_id !== data.contract_id || saved.data.created_by !== member.user_id || saved.data.request_key !== key)
      throw new Error("Unconfirmed rate");
    refresh(data.contract_id);
    return { id: result.data, success: "retired" in data ? "Rate retired. Prices already worked out keep the rate they used."
      : "supersedes_id" in data ? "Rate changed. Prices already worked out keep the rate they used." : "Rate added." };
  } catch (error) { return failure(error, attempted); }
}

export async function priceDayworkAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), version = integer(form, "version", 1), key = uuid(form, "request_key");
    const data = pricingInput(form);
    attempted = true;
    const result = await supabase.rpc("price_daywork", { p_daywork: daywork, p_request_key: key, p_version: version, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await supabase.from("daywork_pricings").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.daywork_id !== daywork || saved.data.priced_by !== member.user_id || saved.data.request_key !== key)
      throw new Error("Unconfirmed price");
    refresh(contract, daywork);
    return { id: result.data, success: "Priced from the job's rates. Each line keeps the rate it used." };
  } catch (error) { return failure(error, attempted); }
}

export async function approveChargeAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const daywork = uuid(form, "daywork_id"), contract = uuid(form, "contract_id"), version = integer(form, "version", 1), key = uuid(form, "request_key");
    const data = chargeInput(form);
    attempted = true;
    const result = await supabase.rpc("approve_daywork_charge", { p_daywork: daywork, p_request_key: key, p_version: version, p_data: data });
    if (result.error) return declined(result.error);
    const saved = await supabase.from("daywork_commercial_approvals").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.daywork_id !== daywork || saved.data.approved_by !== member.user_id || saved.data.request_key !== key)
      throw new Error("Unconfirmed approval");
    refresh(contract, daywork);
    return { id: result.data, success: "Charge approved internally. This is not the client's acceptance or agreement to pay." };
  } catch (error) { return failure(error, attempted); }
}
