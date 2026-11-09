"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { accountsFor } from "@/lib/operations/accounts-data";
import {
  billingProfileInput, certificateInput, completionInput, creditNoteInput, disputeInput, payLessInput, receiptInput, resolutionInput, shareInput, stageInput,
  termsInput, valuationInput, type ApplicationKind, type DocumentKind,
} from "@/lib/operations/accounts";
import { integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

// Commercial accounts (C6). Every action is refused here for anyone without money access, and
// refused again by the database function it calls. Nothing is written to a table directly.
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
const refresh = (contract: string) => {
  revalidatePath(`/admin/contracts/${contract}/accounts`, "layout");
  revalidatePath(`/admin/contracts/${contract}/money`);
  revalidatePath("/admin/money");
};
const DOCUMENT_KINDS: readonly DocumentKind[] = ["payment_application", "final_account", "invoice", "credit_note", "default_payment_notice", "variation_schedule",
  "daywork_summary", "statement"];

export async function saveBillingProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, member } = await moneyActor();
    if (member.role !== "owner") throw new ValidationError("Only the owner can change TileSPEC's business details.");
    checkRpc((await supabase.rpc("save_billing_profile", { p_version: integer(form, "version", 0), p_data: billingProfileInput(form) })).error);
    revalidatePath("/admin/accounts/settings");
    return { success: "Business details saved. Documents issued from now on print them; documents already issued keep what they printed." };
  } catch (error) { return failure(error); }
}
export async function savePaymentTermsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("save_payment_terms", { p_contract: contract, p_version: integer(form, "version", 0), p_data: termsInput(form) })).error);
    refresh(contract);
    return { success: "Payment terms saved. A draft is valued on the terms in force; submitted applications keep their own copy." };
  } catch (error) { return failure(error); }
}
export async function recordCompletionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("record_contract_completion", { p_contract: contract, p_version: integer(form, "version", 1), p_data: completionInput(form) })).error);
    refresh(contract);
    return { success: "Recorded. Retention is released on the next application valued to that date or later." };
  } catch (error) { return failure(error); }
}
export async function addStageAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const data = stageInput(form);
    checkRpc((await supabase.rpc("add_payment_stage", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(data.contract_id);
    return { success: "Stage added to the payment schedule." };
  } catch (error) { return failure(error); }
}
export async function voidStageAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("void_payment_stage", { p_stage: uuid(form, "stage_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Stage removed. It stays on record with your reason." };
  } catch (error) { return failure(error); }
}

async function claimOptions(contract: string) {
  const { supabase } = await moneyActor();
  const accounts = await accountsFor(supabase, contract);
  if (!accounts) throw new ValidationError("Commercial accounts are not available until the office applies the database update.");
  return { supabase, options: { extras: accounts.account.extras, stages: accounts.stages } };
}
export async function createApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const contract = uuid(form, "contract_id"), kind = (text(form, "kind", 10) || "interim") as ApplicationKind;
    if (!["interim", "advance", "final"].includes(kind)) throw new ValidationError("Choose the payment application type.");
    const { supabase, options } = await claimOptions(contract);
    const data = { contract_id: contract, kind, ...valuationInput(form, options, kind) };
    checkRpc((await supabase.rpc("create_payment_application", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "Draft saved. Open it to check the figures and preview the document." };
  } catch (error) { return failure(error); }
}
export async function updateApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const contract = uuid(form, "contract_id"), kind = (text(form, "kind", 10) || "interim") as ApplicationKind;
    const { supabase, options } = await claimOptions(contract);
    const data = valuationInput(form, options, kind);
    const application = uuid(form, "application_id"), key = uuid(form, "request_key"), version = integer(form, "version", 1);
    checkRpc((await supabase.rpc("update_payment_application", { p_application: application, p_request_key: key, p_version: version, p_data: data })).error);
    refresh(contract);
    return { success: "Draft corrected. The earlier figures stay on record." };
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

/** Approve and issue a document. A draft application is submitted in the same step. */
export async function issueDocumentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), kind = text(form, "kind", 30, true) as DocumentKind;
    if (!DOCUMENT_KINDS.includes(kind)) throw new ValidationError("Choose the document to issue.");
    if (form.get("confirm") !== "on") throw new ValidationError("Confirm you have checked the document before issuing it.");
    const data: Record<string, unknown> = { kind, contract_id: contract };
    if (text(form, "application_id", 36)) data.application_id = uuid(form, "application_id");
    if (text(form, "application_version", 10)) data.application_version = integer(form, "application_version", 1);
    if (text(form, "supersedes_id", 36)) { data.supersedes_id = uuid(form, "supersedes_id"); data.revision_reason = reason(form); }
    if (kind === "credit_note") Object.assign(data, creditNoteInput(form));
    if (kind === "default_payment_notice" && text(form, "basis", 2000)) data.basis = text(form, "basis", 2000);
    const result = await supabase.rpc("issue_commercial_document", { p_request_key: uuid(form, "request_key"), p_data: data });
    checkRpc(result.error);
    const issued = await supabase.from("commercial_documents").select("reference").eq("id", result.data as string).maybeSingle();
    refresh(contract);
    return { success: `Issued ${issued.data?.reference ?? "the document"}. It is now fixed; download or share it below.` };
  } catch (error) { return failure(error); }
}
export async function certifyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    const application = uuid(form, "application_id"), key = uuid(form, "request_key"), version = integer(form, "version", 1), data = certificateInput(form);
    checkRpc((await supabase.rpc("certify_payment_application", { p_application: application, p_request_key: key, p_version: version, p_data: data })).error);
    refresh(contract);
    return { success: "Certificate (payment notice) recorded." };
  } catch (error) { return failure(error); }
}
export async function payLessAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("record_pay_less_notice", { p_request_key: uuid(form, "request_key"), p_data: payLessInput(form) })).error);
    refresh(contract);
    return { success: "Pay less notice recorded, with whether it was given in time." };
  } catch (error) { return failure(error); }
}
export async function voidNoticeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("void_payment_notice", { p_notice: uuid(form, "notice_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "Notice voided. It stays on record with your reason." };
  } catch (error) { return failure(error); }
}
export async function receiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("record_payment_receipt", { p_request_key: uuid(form, "request_key"), p_data: receiptInput(form) })).error);
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
export async function disputeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("raise_commercial_dispute", { p_request_key: uuid(form, "request_key"), p_data: disputeInput(form) })).error);
    refresh(contract);
    return { success: "Dispute recorded." };
  } catch (error) { return failure(error); }
}
export async function resolveDisputeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("resolve_commercial_dispute", { p_dispute: uuid(form, "dispute_id"), p_data: resolutionInput(form) })).error);
    refresh(contract);
    return { success: "Dispute resolved." };
  } catch (error) { return failure(error); }
}
export async function includeDayworkAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id"), note = text(form, "note", 500);
    const data = { daywork_id: uuid(form, "daywork_id"), variation_id: uuid(form, "variation_id"), ...(note ? { note } : {}) };
    checkRpc((await supabase.rpc("include_daywork_in_variation", { p_request_key: uuid(form, "request_key"), p_data: data })).error);
    refresh(contract);
    return { success: "The daywork is now valued within the variation and will not be charged separately." };
  } catch (error) { return failure(error); }
}
export async function removeInclusionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("remove_daywork_inclusion", { p_inclusion: uuid(form, "inclusion_id"), p_reason: reason(form) })).error);
    refresh(contract);
    return { success: "The daywork can be charged on its own again." };
  } catch (error) { return failure(error); }
}

export type ShareState = ActionState & { link?: string };
/** A link that opens one issued document without signing in. The secret is shown once. */
export async function shareDocumentAction(_: ShareState, form: FormData): Promise<ShareState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    const result = await supabase.rpc("share_commercial_document", { p_document: uuid(form, "document_id"), p_data: shareInput(form) });
    checkRpc(result.error);
    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host");
    if (!host) throw new ValidationError("The link could not be made. Try again.");
    const protocol = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    refresh(contract);
    return { success: "Link made. Copy it now: it is shown only once.", link: `${protocol}://${host}/shared/documents/${result.data as string}` };
  } catch (error) { return failure(error); }
}
export async function revokeShareAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await moneyActor();
    const contract = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("revoke_commercial_document_share", { p_share: uuid(form, "share_id") })).error);
    refresh(contract);
    return { success: "Link revoked. It no longer opens the document." };
  } catch (error) { return failure(error); }
}
