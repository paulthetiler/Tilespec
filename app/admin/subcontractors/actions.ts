"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireFinancialActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { parseMoney } from "@/lib/operations/gang-invoices";
import { integer, text, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

/*
 * Office administration of subcontractors. Every action needs money access here and again in the
 * database function it calls, which is the authority. Publishing an agreement is the owner's alone.
 */
export type LinkState = ActionState & { link?: string; issuedTo?: string };
const message = (error: unknown, fallback: string) => (error instanceof ValidationError ? error.message : fallback);
const optional = (form: FormData, key: string, max: number) => text(form, key, max) || undefined;
function refresh(teamId?: string) {
  revalidatePath("/admin/subcontractors");
  if (teamId) revalidatePath(`/admin/subcontractors/${teamId}`);
}

export async function saveProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const teamId = uuid(form, "team_id");
    const version = text(form, "version", 10);
    const cis = text(form, "cis_status", 20) || "unverified";
    const vat = form.get("vat_registered") === "on";
    const result = await supabase.rpc("save_subcontractor_profile", { p_team: teamId, p_version: version ? Number(version) : null, p_data: {
      business_type: text(form, "business_type", 30) || "sole_trader", legal_name: text(form, "legal_name", 160, true), trading_name: optional(form, "trading_name", 160),
      address: text(form, "address", 500, true), email: optional(form, "email", 254), phone: optional(form, "phone", 40),
      company_number: optional(form, "company_number", 12), utr: optional(form, "utr", 20), cis_status: cis,
      ...(cis !== "unverified" ? { cis_verification_number: optional(form, "cis_verification_number", 40), cis_verified_on: optional(form, "cis_verified_on", 10) } : {}),
      vat_registered: vat, ...(vat ? { vat_number: optional(form, "vat_number", 20), vat_reverse_charge: form.get("vat_reverse_charge") === "on",
        self_billing_from: optional(form, "self_billing_from", 10), self_billing_until: optional(form, "self_billing_until", 10) } : {}),
    } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(teamId);
    return { success: "Details saved." };
  } catch (error) { return { error: message(error, "The details were not saved.") }; }
}

export async function saveBankAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const teamId = uuid(form, "team_id");
    if (form.get("confirmed") !== "on") throw new ValidationError("Confirm that you have checked these details with the subcontractor directly.");
    const result = await supabase.rpc("save_subcontractor_bank", { p_team: teamId, p_data: {
      account_name: text(form, "account_name", 120, true), sort_code: text(form, "sort_code", 12, true), account_number: text(form, "account_number", 12, true),
      verified_note: optional(form, "verified_note", 500) } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(teamId);
    return { success: "Bank details saved." };
  } catch (error) { return { error: message(error, "The bank details were not saved.") }; }
}

/** Issues a personal link. Its secret is shown once, here, and is never stored or shown again. */
export async function issueLinkAction(_: LinkState, form: FormData): Promise<LinkState> {
  const { supabase } = await requireFinancialActor();
  try {
    const teamId = uuid(form, "team_id");
    const issuedTo = text(form, "issued_to", 160, true);
    const result = await supabase.rpc("issue_portal_link", { p_team: teamId, p_data: { issued_to: issuedTo, days: integer(form, "days", 1, 90) } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    refresh(teamId);
    return { success: "Link created. Copy it now: it will not be shown again.", link: `${protocol}://${host}/subcontractors/access/${(result.data as { token: string }).token}`, issuedTo };
  } catch (error) { return { error: message(error, "The link was not created.") }; }
}

export async function revokeLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("revoke_portal_link", { p_link: uuid(form, "link_id") });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Link withdrawn. It stopped working immediately." };
  } catch (error) { return { error: message(error, "The link was not withdrawn.") }; }
}

export async function createAgreementVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("create_agreement_version", { p_data: { version_label: text(form, "version_label", 40, true), title: text(form, "title", 200, true),
      body: text(form, "body", 120000, true) } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    revalidatePath("/admin/subcontractors/agreement");
    return { success: "Draft saved. It cannot be issued until the owner records its legal review and publishes it." };
  } catch (error) { return { error: message(error, "The draft was not saved. Check the version label and the text.") }; }
}

export async function publishAgreementVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    if (form.get("confirmed") !== "on") throw new ValidationError("Confirm that this version has been legally reviewed.");
    const result = await supabase.rpc("publish_agreement_version", { p_version: uuid(form, "version_id"), p_data: {
      legal_reviewed_by: text(form, "legal_reviewed_by", 200, true), legal_reviewed_on: text(form, "legal_reviewed_on", 10, true),
      legal_review_note: optional(form, "legal_review_note", 2000) } });
    if (result.error) return { error: result.error.code === "42501" ? "Only the owner can publish a subcontractor agreement." : rpcErrorMessage(result.error) };
    revalidatePath("/admin/subcontractors/agreement"); refresh();
    return { success: "Published. This version can now be issued to subcontractors." };
  } catch (error) { return { error: message(error, "The version was not published.") }; }
}

export async function withdrawAgreementVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("withdraw_agreement_version", { p_version: uuid(form, "version_id") });
    if (result.error) return { error: result.error.code === "42501" ? "Only the owner can withdraw a subcontractor agreement." : rpcErrorMessage(result.error) };
    revalidatePath("/admin/subcontractors/agreement");
    return { success: "Withdrawn. Agreements already signed on this version stay in force." };
  } catch (error) { return { error: message(error, "The version was not withdrawn.") }; }
}

export async function issueAgreementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const teamId = uuid(form, "team_id");
    const result = await supabase.rpc("issue_subcontractor_agreement", { p_team: teamId, p_version: uuid(form, "version_id") });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(teamId);
    return { success: "Agreement issued. The subcontractor signs it from their link." };
  } catch (error) { return { error: message(error, "The agreement was not issued.") }; }
}

export async function withdrawAgreementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("withdraw_subcontractor_agreement", { p_agreement: uuid(form, "agreement_id"), p_reason: text(form, "reason", 1000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Agreement withdrawn. It is kept in the history." };
  } catch (error) { return { error: message(error, "The agreement was not withdrawn.") }; }
}

export async function saveVariationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const amount = parseMoney(text(form, "amount", 20, true), "the agreed sum");
    if (!amount || amount <= 0) throw new ValidationError("Enter the agreed sum for the variation.");
    const on = text(form, "instructed_on", 10);
    const result = await supabase.rpc("save_gang_variation", { p_request_key: uuid(form, "request_key"), p_data: {
      subcontract_id: uuid(form, "subcontract_id"), description: text(form, "description", 500, true), amount, ...(on ? { instructed_on: on } : {}) } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Variation approved. The subcontractor can now claim against it." };
  } catch (error) { return { error: message(error, "The variation was not saved.") }; }
}

export async function withdrawVariationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("withdraw_gang_variation", { p_variation: uuid(form, "variation_id"), p_reason: text(form, "reason", 1000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Variation withdrawn." };
  } catch (error) { return { error: message(error, "The variation was not withdrawn.") }; }
}

export async function releaseRetentionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const amount = parseMoney(text(form, "amount", 20, true), "the amount released");
    if (!amount || amount <= 0) throw new ValidationError("Enter the retention being released.");
    const on = text(form, "released_on", 10);
    const result = await supabase.rpc("release_gang_retention", { p_request_key: uuid(form, "request_key"), p_data: {
      subcontract_id: uuid(form, "subcontract_id"), amount, ...(on ? { released_on: on } : {}),
      payment_reference: optional(form, "payment_reference", 120), note: optional(form, "note", 1000) } });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Retention release recorded, less CIS at the verified rate." };
  } catch (error) { return { error: message(error, "The release was not recorded.") }; }
}

export async function voidRetentionReleaseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireFinancialActor();
  try {
    const result = await supabase.rpc("void_gang_retention_release", { p_release: uuid(form, "release_id"), p_reason: text(form, "reason", 1000, true) });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(text(form, "team_id", 36) || undefined);
    return { success: "Release voided. It is kept in the history." };
  } catch (error) { return { error: message(error, "The release was not voided.") }; }
}
