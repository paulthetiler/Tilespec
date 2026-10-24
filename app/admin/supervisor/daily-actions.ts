"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { handoverInput, isRecordId, messageInput, officeItemInput, reviewInput, withdrawalInput } from "@/lib/operations/daily-input";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { uuid, ValidationError } from "@/lib/operations/validation";
import type { DailyActionState } from "@/components/site/daily-form";

const uncertainError = "We could not confirm the save. Your entries are kept here. Check the saved records, then retry the same details.";
function refresh(contract: string) {
  for (const path of ["", "/messages", "/finish", "/inspections", "/workforce", "/history", "/activity"]) revalidatePath(`/admin/supervisor/sites/${contract}${path}`);
  revalidatePath("/admin/quality");
  revalidatePath("/admin/messages");
}
function declined(error: { code?: string; message?: string }): DailyActionState {
  return { error: rpcErrorMessage(error), uncertain: !error.code || !(/^[A-Z0-9]{5}$/.test(error.code) || error.code.startsWith("PGRST")) };
}
function failure(error: unknown, attempted: boolean): DailyActionState {
  return { error: error instanceof ValidationError ? error.message : uncertainError, uncertain: attempted && !(error instanceof ValidationError) };
}

export async function sendOfficeItemAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const data = officeItemInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("create_supervisor_office_item", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("supervisor_office_items").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.id !== result.data || saved.data.created_by !== member.user_id
      || saved.data.request_key !== key || Object.entries(data).some(([name, value]) => saved.data[name] !== value)) throw new Error("Unconfirmed message");
    refresh(data.contract_id);
    return { id: result.data, success: data.kind === "qa_request" ? "Inspection request sent to the supervisor."
      : "replaces_id" in data ? "Instruction changed. The supervisor sees the new version and the old one no longer asks for a reply." : "Office message saved and sent." };
  } catch (error) { return failure(error, attempted); }
}

export async function acknowledgeOfficeItemAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const item = uuid(form, "item_id"), key = uuid(form, "request_key"), contract = uuid(form, "contract_id");
    attempted = true;
    const result = await supabase.rpc("acknowledge_supervisor_office_item", { p_item: item, p_request_key: key });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("supervisor_office_acknowledgements").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.item_id !== item || saved.data.actor_id !== member.user_id
      || saved.data.contract_id !== contract || saved.data.request_key !== key || !saved.data.acknowledged_at) throw new Error("Unconfirmed acknowledgement");
    refresh(contract);
    return { id: result.data, success: "Message acknowledged. The office can see your reply." };
  } catch (error) { return failure(error, attempted); }
}

export async function withdrawOfficeItemAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const { item_id, contract_id, reason } = withdrawalInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("withdraw_supervisor_office_item", { p_item: item_id, p_request_key: key, p_reason: reason });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("supervisor_office_item_withdrawals").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.item_id !== item_id || saved.data.withdrawn_by !== member.user_id
      || saved.data.contract_id !== contract_id || saved.data.request_key !== key || saved.data.reason !== reason) throw new Error("Unconfirmed withdrawal");
    refresh(contract_id);
    revalidatePath(`/admin/supervisor/sites/${contract_id}/tasks/${item_id}`);
    return { id: result.data, success: "Withdrawn. The supervisor no longer has it to do and can see why." };
  } catch (error) { return failure(error, attempted); }
}

export async function recordOfficeReviewAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const { contract_id, data } = reviewInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("record_office_review", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("office_reviews").select("*").eq("id", result.data).single();
    const subject = data.subject === "qa_result" ? saved.data?.qa_submission_id : saved.data?.handover_id;
    if (saved.error || !saved.data || subject !== data.subject_id || saved.data.contract_id !== contract_id || saved.data.reviewed_by !== member.user_id
      || saved.data.request_key !== key || saved.data.outcome !== data.outcome || saved.data.note !== data.note
      || (saved.data.follow_up_id ?? null) !== ("follow_up_id" in data ? data.follow_up_id : null)) throw new Error("Unconfirmed review");
    refresh(contract_id);
    const item = form.get("item_id");
    if (typeof item === "string" && isRecordId(item)) revalidatePath(`/admin/supervisor/sites/${contract_id}/tasks/${item}`);
    return { id: result.data, success: "Review saved. The supervisor can see that the office has dealt with it." };
  } catch (error) { return failure(error, attempted); }
}

export async function postJobMessageAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const data = messageInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("post_job_message", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("job_messages").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.author_id !== member.user_id || saved.data.request_key !== key || saved.data.contract_id !== data.contract_id
      || saved.data.body !== data.body || saved.data.needs_answer !== data.needs_answer
      || saved.data.thread_id !== ("thread_id" in data ? data.thread_id : result.data)) throw new Error("Unconfirmed message");
    refresh(data.contract_id);
    return { id: result.data, success: "thread_id" in data ? "Reply sent." : "Message sent to the office. Their reply will show here and on your Today." };
  } catch (error) { return failure(error, attempted); }
}

export async function markJobMessageReadAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const message = uuid(form, "message_id"), contract = uuid(form, "contract_id"), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("mark_job_message_read", { p_message: message, p_request_key: key });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("job_message_reads").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.message_id !== message || saved.data.reader_id !== member.user_id
      || saved.data.contract_id !== contract || saved.data.request_key !== key) throw new Error("Unconfirmed read receipt");
    refresh(contract);
    return { id: result.data, success: "Marked as read. The sender can see you have seen it." };
  } catch (error) { return failure(error, attempted); }
}

export async function submitQaResultAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const item = uuid(form, "item_id"), inspection = uuid(form, "inspection_id"), contract = uuid(form, "contract_id"), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("submit_supervisor_qa_result", { p_item: item, p_inspection: inspection, p_request_key: key });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("supervisor_qa_submissions").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.item_id !== item || saved.data.inspection_id !== inspection
      || saved.data.submitted_by !== member.user_id || saved.data.contract_id !== contract || saved.data.request_key !== key || !saved.data.submitted_at) throw new Error("Unconfirmed inspection result");
    refresh(contract);
    revalidatePath(`/admin/supervisor/sites/${contract}/tasks/${item}`);
    return { id: result.data, success: "Inspection result sent to the office. Existing snags and work restrictions still apply." };
  } catch (error) { return failure(error, attempted); }
}

export async function recordHandoverAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const data = handoverInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("record_site_handover", { p_request_key: key, p_data: data });
    if (result.error) return declined(result.error);
    if (!isRecordId(result.data)) throw new Error("Unconfirmed response");
    const saved = await supabase.from("site_handovers").select("*").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.id !== result.data || saved.data.actor_id !== member.user_id || saved.data.request_key !== key
      || saved.data.contract_id !== data.contract_id || saved.data.finish_workforce !== data.finish_workforce
      || new Date(saved.data.finished_at).getTime() !== new Date(data.finished_at!).getTime()
      || ["work_completed", "outstanding_problems", "materials_needed", "areas_awaiting_attention", "office_notes"].some(name => saved.data[name] !== data[name as keyof typeof data])) throw new Error("Unconfirmed handover");
    // The handover and workforce finishing share one database transaction. Check
    // every linked record before claiming the workforce has also been finished.
    if (data.finish_workforce && saved.data.actual_allocation_ids?.length) {
      const ids = saved.data.actual_allocation_ids as string[];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const rows = await supabase.from("actual_allocations").select("id,ended_at").in("id", batch);
        if (rows.error || rows.data?.length !== batch.length || rows.data.some(row => !row.ended_at)) throw new Error("Unconfirmed workforce finish");
      }
    }
    refresh(data.contract_id);
    return { id: result.data, success: data.finish_workforce ? `Handover saved for the office. ${saved.data.ended_count} recorded work periods finished up to ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(saved.data.finished_at))}.` : "Handover saved for the office. Workforce times were kept as recorded." };
  } catch (error) { return failure(error, attempted); }
}
