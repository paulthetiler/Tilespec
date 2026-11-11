"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { decimal, integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { DailyActionState } from "@/components/site/daily-form";

// Office command centre actions. Every write is one checked database function called with the signed-in
// person's own session: row-level security and the function decide what is allowed.
const failure = (error: unknown): DailyActionState => ({ error: error instanceof ValidationError ? error.message : "The change could not be confirmed. Check the saved record, then try again.", uncertain: !(error instanceof ValidationError) });
const declined = (error: { code?: string; message?: string }): DailyActionState => ({ error: rpcErrorMessage(error) });
const optionalText = (form: FormData, key: string, max: number) => text(form, key, max) || null;
function optionalDate(form: FormData, key: string) {
  const value = text(form, key, 10);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new ValidationError(`Enter a valid ${key.replaceAll("_", " ")}.`);
  return value;
}
const optionalId = (form: FormData, key: string) => (text(form, key, 36) ? uuid(form, key) : null);
const optionalAmount = (form: FormData, key: string) => (text(form, key, 25) ? decimal(form, key) : null);
function refreshOffice(...paths: string[]) {
  for (const path of ["/admin", "/admin/inbox", ...paths]) revalidatePath(path);
}

// ---- Conversations: answer, decide or resolve -------------------------------------------------
export async function recordThreadOutcomeAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id"), thread = uuid(form, "thread_id"), outcome = text(form, "outcome", 20, true);
    if (!["answered", "approved", "rejected", "resolved"].includes(outcome)) throw new ValidationError("Choose answer, approve, reject or resolve.");
    const note = text(form, "note", 2000);
    const result = await supabase.rpc("record_thread_outcome", { p_request_key: uuid(form, "request_key"), p_data: { contract_id: contract, thread_id: thread, outcome, ...(note ? { note } : {}) } });
    if (result.error) return declined(result.error);
    refreshOffice(`/admin/supervisor/sites/${contract}/messages`, `/admin/supervisor/sites/${contract}`);
    return { id: String(result.data), success: outcome === "approved" ? "Approved. The supervisor sees your decision in the conversation." : outcome === "rejected"
      ? "Not approved. The supervisor sees your reason in the conversation." : outcome === "answered" ? "Answer sent to the supervisor." : "Marked resolved." };
  } catch (error) { return failure(error); }
}

// ---- Customers and job stage --------------------------------------------------------------------
export async function saveCustomerAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const id = optionalId(form, "customer_id");
    const kind = text(form, "kind", 20) || "client";
    if (!["client", "main_contractor", "developer", "consultant", "other"].includes(kind)) throw new ValidationError("Choose the kind of customer.");
    const data = { ...(id ? { id, version: integer(form, "version", 1) } : {}), name: text(form, "name", 160, true), kind,
      contact_name: text(form, "contact_name", 160), email: text(form, "email", 254), phone: text(form, "phone", 40), address: text(form, "address", 500), notes: text(form, "notes", 2000) };
    const result = await supabase.rpc("save_customer", { p_request_key: uuid(form, "request_key"), p_data: data });
    if (result.error) return declined(result.error);
    revalidatePath("/admin/customers"); revalidatePath(`/admin/customers/${result.data}`);
    return { id: String(result.data), success: id ? "Customer saved." : `${data.name} added.`, href: id ? undefined : `/admin/customers/${result.data}` };
  } catch (error) { return failure(error); }
}
export async function setContractCustomerAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id"), customer = optionalId(form, "customer_id");
    const result = await supabase.rpc("set_contract_customer", { p_contract: contract, p_customer: customer });
    if (result.error) return declined(result.error);
    revalidatePath(`/admin/contracts/${contract}`); revalidatePath("/admin/customers");
    return { success: customer ? "Customer linked to this job." : "Customer removed from this job." };
  } catch (error) { return failure(error); }
}
export async function setContractStageAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id"), stage = text(form, "stage", 30, true);
    const result = await supabase.rpc("set_contract_stage", { p_request_key: uuid(form, "request_key"), p_contract: contract, p_stage: stage, p_note: text(form, "note", 1000) || null });
    if (result.error) return declined(result.error);
    refreshOffice(`/admin/contracts/${contract}`, "/admin/contracts");
    return { success: "Job stage saved. It is recorded in the job's history." };
  } catch (error) { return failure(error); }
}

// ---- Quotations and tenders ------------------------------------------------------------------
export async function saveQuoteAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const id = optionalId(form, "quote_id");
    const data = { ...(id ? { id, version: integer(form, "version", 1) } : {}), title: text(form, "title", 200, true),
      customer_id: optionalId(form, "customer_id"), tender_enquiry_id: optionalId(form, "tender_enquiry_id"), scope: text(form, "scope", 4000) || null,
      site_address: optionalText(form, "site_address", 500), value_net: decimal(form, "value_net"), estimated_cost: optionalAmount(form, "estimated_cost"),
      valid_until: optionalDate(form, "valid_until"), follow_up_on: optionalDate(form, "follow_up_on") };
    const result = await supabase.rpc("save_quote", { p_request_key: uuid(form, "request_key"), p_data: data });
    if (result.error) return declined(result.error);
    revalidatePath("/admin/quotes"); revalidatePath(`/admin/quotes/${result.data}`);
    return { id: String(result.data), success: id ? "Quotation saved." : "Quotation created.", href: id ? undefined : `/admin/quotes/${result.data}` };
  } catch (error) { return failure(error); }
}
export async function setQuoteStatusAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const quote = uuid(form, "quote_id"), status = text(form, "status", 20, true);
    const data = { status, on: optionalDate(form, "on"), note: text(form, "note", 1000) || null, contract_id: optionalId(form, "contract_id"),
      follow_up_on: optionalDate(form, "follow_up_on"), valid_until: optionalDate(form, "valid_until") };
    const payload = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null));
    const result = await supabase.rpc("set_quote_status", { p_request_key: uuid(form, "request_key"), p_quote: quote, p_version: integer(form, "version", 1), p_data: payload });
    if (result.error) return declined(result.error);
    revalidatePath("/admin/quotes"); revalidatePath(`/admin/quotes/${quote}`); revalidatePath("/admin/tenders");
    return { success: { sent: "Recorded as sent. A follow-up date is set.", accepted: "Recorded as accepted.", declined: "Recorded as declined.", expired: "Recorded as expired.", withdrawn: "Recorded as withdrawn." }[status] ?? "Saved." };
  } catch (error) { return failure(error); }
}
export async function setTenderStatusAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const result = await supabase.rpc("set_tender_status", { p_tender: uuid(form, "tender_id"), p_status: text(form, "status", 20, true), p_note: text(form, "note", 1000) || null });
    if (result.error) return declined(result.error);
    revalidatePath("/admin/tenders");
    return { success: "Tender status saved." };
  } catch (error) { return failure(error); }
}

// ---- Materials ------------------------------------------------------------------------------------
export async function requestMaterialAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id");
    const data = { contract_id: contract, work_area_id: optionalId(form, "work_area_id"), item: text(form, "item", 160, true), quantity: decimal(form, "quantity", 1_000_000),
      unit: text(form, "unit", 12, true), needed_by: optionalDate(form, "needed_by"), note: text(form, "note", 1000) || null };
    const result = await supabase.rpc("request_material", { p_request_key: uuid(form, "request_key"), p_data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null)) });
    if (result.error) return declined(result.error);
    refreshOffice("/admin/materials", `/admin/supervisor/sites/${contract}/diary`);
    return { id: String(result.data), success: "Materials requested. The office sees it in Materials and on the command centre." };
  } catch (error) { return failure(error); }
}
export async function updateMaterialAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const data = { status: text(form, "status", 20, true), supplier: text(form, "supplier", 160), order_reference: text(form, "order_reference", 120),
      ordered_on: optionalDate(form, "ordered_on"), expected_on: optionalDate(form, "expected_on"), delivered_on: optionalDate(form, "delivered_on"), note: text(form, "note", 1000) };
    const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== ""));
    const result = await supabase.rpc("update_material_request", { p_request: uuid(form, "request_id"), p_version: integer(form, "version", 1), p_data: payload });
    if (result.error) return declined(result.error);
    refreshOffice("/admin/materials");
    return { success: "Materials record saved." };
  } catch (error) { return failure(error); }
}

// ---- Daily progress quantities (site diary) -----------------------------------------------------
export async function recordProgressAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id");
    const quantity = optionalAmount(form, "quantity");
    const data = { contract_id: contract, work_date: optionalDate(form, "work_date"), work_area_id: optionalId(form, "work_area_id"), work_package_id: optionalId(form, "work_package_id"),
      team_id: optionalId(form, "team_id"), description: text(form, "description", 500, true), quantity, unit: quantity === null ? null : text(form, "unit", 12) || null };
    const result = await supabase.rpc("record_site_progress", { p_request_key: uuid(form, "request_key"), p_data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null)) });
    if (result.error) return declined(result.error);
    refreshOffice(`/admin/supervisor/sites/${contract}/diary`, `/admin/contracts/${contract}`);
    return { id: String(result.data), success: "Progress saved. The office sees it in tomorrow's Yesterday on site." };
  } catch (error) { return failure(error); }
}
export async function voidProgressAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const contract = uuid(form, "contract_id");
    const result = await supabase.rpc("void_site_progress", { p_entry: uuid(form, "entry_id"), p_reason: text(form, "reason", 500, true) });
    if (result.error) return declined(result.error);
    refreshOffice(`/admin/supervisor/sites/${contract}/diary`);
    return { success: "Marked as entered in error. The entry is kept with your reason." };
  } catch (error) { return failure(error); }
}

// ---- Email notifications (owner) --------------------------------------------------------------
async function ownerCall(name: string, args: Record<string, unknown>, success: string): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  const result = await supabase.rpc(name, args);
  if (result.error) return declined(result.error);
  revalidatePath("/admin/notifications");
  return { success, id: typeof result.data === "string" ? result.data : undefined };
}
export async function addRecipientAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("add_notification_recipient", { p_user: uuid(form, "user_id"), p_urgent: form.get("urgent") === "on", p_summary: form.get("summary") === "on" },
    "Recipient added. Send a test message and check it arrives before confirming the mailbox."); } catch (error) { return failure(error); }
}
export async function updateRecipientAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("update_notification_recipient", { p_recipient: uuid(form, "recipient_id"), p_urgent: form.get("urgent") === "on",
    p_summary: form.get("summary") === "on", p_active: form.get("active") === "on" }, "Recipient saved."); } catch (error) { return failure(error); }
}
export async function queueTestAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("queue_test_notification", { p_recipient: uuid(form, "recipient_id") },
    "Test message queued. It is sent at the next dispatch (within ten minutes) once the email service is configured."); } catch (error) { return failure(error); }
}
export async function confirmRecipientAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("confirm_notification_recipient", { p_recipient: uuid(form, "recipient_id") }, "Mailbox confirmed."); } catch (error) { return failure(error); }
}
export async function setDeliveryAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("set_notification_delivery", { p_live: form.get("live") === "on", p_urgent: form.get("urgent_enabled") === "on", p_summary: form.get("summary_enabled") === "on" },
    form.get("live") === "on" ? "Email delivery is on." : "Settings saved. Emails are prepared and logged but not sent."); } catch (error) { return failure(error); }
}
export async function rotateDispatcherKeyAction(_: DailyActionState): Promise<DailyActionState> {
  try {
    const { supabase } = await requireActor();
    const result = await supabase.rpc("rotate_notification_dispatcher_key");
    if (result.error) return declined(result.error);
    revalidatePath("/admin/notifications");
    return { success: `New dispatcher key: ${String(result.data)} — add it to the hosting settings as NOTIFICATIONS_DISPATCH_TOKEN now. It is not shown again.` };
  } catch (error) { return failure(error); }
}
export async function retryNotificationAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try { return await ownerCall("retry_notification", { p_outbox: uuid(form, "outbox_id") }, "Queued again."); } catch (error) { return failure(error); }
}

// ---- Subcontractor onboarding: create a gang (and its company) and go straight to its onboarding page ----
export async function createGangAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const name = text(form, "name", 160, true).replace(/\s+/g, " ");
    const kind = text(form, "kind", 40) || "subcontract_gang";
    if (!["subcontract_gang", "individual_subcontractor"].includes(kind)) throw new ValidationError("Choose a gang or an individual subcontractor.");
    let company = optionalId(form, "company_id");
    const companyName = text(form, "company_name", 160).replace(/\s+/g, " ");
    if (!company && companyName) {
      const company_data = { name: companyName, company_number: "", contact_name: text(form, "contact_name", 160), contact_phone: text(form, "contact_phone", 40),
        contact_email: text(form, "contact_email", 254), address: "", notes: "" };
      const created = await supabase.rpc("create_company", { p_request_key: uuid(form, "company_request_key"), p_data: company_data });
      if (created.error) return declined(created.error);
      company = String(created.data);
    }
    const team = await supabase.rpc("create_team", { p_request_key: uuid(form, "request_key"), p_data: { name, kind, company_id: company } });
    if (team.error) return declined(team.error);
    revalidatePath("/admin/subcontractors"); revalidatePath("/admin/workforce");
    return { id: String(team.data), success: `${name} added. Next: business and tax details, the agreement and a portal link.`, href: `/admin/subcontractors/${team.data}` };
  } catch (error) { return failure(error); }
}
