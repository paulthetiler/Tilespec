/*
 * Commercial accounts (C6): payment terms, applications, notices, invoices and credit notes.
 * Money access only. Pure types, wording and form parsing. Every figure shown or printed is
 * worked out by the database (`commercial_account`, `preview_commercial_document`); nothing here
 * adds up an amount.
 */
import { formatPounds, optionalPounds, parsePercent, parsePounds } from "./money";
import { longDate } from "../documents/model";
import { isCalendarDate, londonDate } from "./planning";
import { text, uuid, ValidationError } from "./validation";

export type ApplicationKind = "interim" | "advance" | "final";
export type DisplayStatus = "draft" | "submitted" | "certified" | "part_paid" | "paid" | "disputed" | "overdue" | "cancelled";
export type Basis = "interim" | "milestones" | "schedule" | "completion";
export type VatTreatment = "standard" | "reduced" | "zero" | "reverse_charge" | "exempt" | "outside_scope" | "not_registered";
export type ExtraState = "draft" | "submitted" | "approved" | "disputed" | "rejected";
export type DocumentKind = "payment_application" | "final_account" | "invoice" | "credit_note" | "default_payment_notice"
  | "variation_schedule" | "daywork_summary" | "statement";

export type Valuation = {
  works: number; stages: number; variations: number; dayworks: number; materials_on_site: number; other: number; gross: number;
  retention_base: number; retention_percent: number; retention_full: number; retention_cap: number | null; retention_capped: boolean; retention: number;
  retention_released_pc: number; retention_released_final: number; retention_held: number; advance: number; advance_recovered: number;
  deductions: number; net: number; practical_completion_on: string | null; making_good_on: string | null;
};
export type AccountRow = {
  application_id: string; number: number; kind: ApplicationKind; period_end: string; status: "draft" | "submitted" | "certified" | "cancelled";
  display_status: DisplayStatus; applied_on: string | null; due_on: string | null; final_on: string | null; final_on_effective: string | null;
  payment_notice_by: string | null; pay_less_by: string | null; construction_act: boolean; gross: number; retention_percent: number; retention_held: number;
  net: number; previous_notified: number; applied_this_period: number; certified_gross: number | null; certified_retention: number | null;
  certified_net: number | null; certified_on: string | null; certified_this_period: number | null; certificate_in_time: boolean | null;
  pay_less_sum: number | null; pay_less_on: string | null; pay_less_in_time: boolean | null; pay_less_effective: boolean;
  default_notice_on: string | null; default_notice_sum: number | null; notified_cumulative: number; due_this_period: number;
  vat_treatment: VatTreatment; vat_rate: number; vat: number; vat_reverse_charge: number; cis_rate: number; cis_materials: number; cis_expected: number;
  payable: number; invoiced: number; received: number; received_cash: number; received_cis: number; outstanding: number; disputed: boolean;
  overdue_days: number; valuation: Valuation;
};
export type Terms = {
  has_terms: boolean; basis: Basis; valuation_frequency: string | null; valuation_day: number | null; original_value: number; retention_percent: number;
  retention_cap_percent: number | null; retention_cap_amount: number | null; retention_on_materials: boolean; retention_pc_release_percent: number;
  defects_period_months: number; practical_completion_on: string | null; making_good_on: string | null; advance_payment: number;
  advance_recovery: "pro_rata" | "first_interim" | "final_account"; materials_on_site: boolean; construction_act: boolean; due_days: number;
  final_payment_days: number; payment_notice_days: number; pay_less_notice_days: number; vat_treatment: VatTreatment; vat_rate: number;
  cis_applies: boolean; cis_rate: number; order_reference: string | null;
};
export type Extra = {
  daywork_id: string; kind: "daywork" | "variation"; number: number; reference: string; description: string; instructed_on: string; state: ExtraState;
  claimable: boolean; approved_total: number | null; latest_total: number | null; pricing_method: string | null; included_in: string | null;
  sent: boolean; client_required: boolean; client_status: string;
};
export type Account = { terms: Terms; applications: AccountRow[]; extras: Extra[]; as_at: string };
export type PaymentTermsRecord = Omit<Terms, "has_terms" | "original_value" | "retention_percent" | "vat_treatment"> & {
  contract_id: string; vat_treatment: Exclude<VatTreatment, "not_registered">; daywork_labour_markup: number; daywork_plant_markup: number;
  daywork_materials_markup: number; bill_to_name: string | null; bill_to_address: string | null; bill_to_email: string | null; version: number;
  updated_by_name: string | null; updated_at: string;
};
export type BillingProfile = {
  legal_name: string | null; trading_name: string | null; registered_address: string | null; company_number: string | null; vat_registered: boolean;
  vat_number: string | null; cis_status: "not_registered" | "gross" | "net" | "higher"; email: string | null; phone: string | null; website: string | null;
  bank_account_name: string | null; bank_sort_code: string | null; bank_account_number: string | null; payment_instructions: string | null;
  document_footer: string | null; version: number; updated_by_name: string | null; updated_at: string;
};
export type Stage = { id: string; position: number; label: string; amount: number; planned_on: string | null; note: string | null; voided_at: string | null };
export type Notice = { id: string; application_id: string; kind: "pay_less" | "default_payment"; given_on: string; sum_stated: number; basis: string;
  reference: string | null; in_time: boolean; recorded_by_name: string; voided_at: string | null };
export type Dispute = { id: string; application_id: string | null; daywork_id: string | null; raised_on: string; raised_by_party: "client" | "tilespec";
  summary: string; amount_disputed: number | null; recorded_by_name: string; resolved_on: string | null; resolution: string | null };
export type IssuedDocument = { id: string; kind: DocumentKind; reference: string; title: string; revision: number; application_id: string | null;
  credits_document_id: string | null; supersedes_id: string | null; revision_reason: string | null; issued_on: string; net: number | null; vat: number | null;
  total: number | null; due_on: string | null; final_on: string | null; issued_by_name: string; issued_at: string; superseded_at: string | null;
  snapshot_sha256: string };
export type Share = { id: string; document_id: string; recipient: string | null; expires_at: string; created_by_name: string; created_at: string;
  revoked_at: string | null; view_count: number; last_viewed_at: string | null };
export type Inclusion = { id: string; variation_id: string; daywork_id: string; note: string | null; voided_at: string | null };
export type Receipt = { id: string; application_id: string; received_on: string; amount: number; cis_deducted: number; reference: string | null;
  recorded_by_name: string; voided_at: string | null };
export type Line = { id: string; application_id: string; lines_version: number; position: number;
  kind: "contract_works" | "stage" | "extra_work" | "materials_on_site" | "other" | "deduction"; daywork_id: string | null; stage_id: string | null;
  description: string; amount: number };

export const displayStatusLabels: Record<DisplayStatus, string> = {
  draft: "Draft", submitted: "Submitted", certified: "Certified", part_paid: "Part-paid", paid: "Paid", disputed: "Disputed", overdue: "Overdue", cancelled: "Cancelled",
};
export const kindLabels: Record<ApplicationKind, string> = { interim: "Interim application", advance: "Advance payment", final: "Final account" };
export const basisLabels: Record<Basis, string> = {
  interim: "Interim valuations", milestones: "Stage or milestone payments", schedule: "Bespoke payment schedule", completion: "Payment on completion",
};
export const frequencyLabels: Record<string, string> = { monthly: "Monthly", four_weekly: "Every four weeks", fortnightly: "Every two weeks", weekly: "Weekly" };
export const recoveryLabels: Record<Terms["advance_recovery"], string> = {
  pro_rata: "In proportion to the contract works valued", first_interim: "In full from the first interim application", final_account: "In the final account",
};
export const vatLabels: Record<VatTreatment, string> = {
  standard: "Standard rate", reduced: "Reduced rate", zero: "Zero rated", reverse_charge: "Domestic reverse charge (customer accounts for VAT)",
  exempt: "Exempt", outside_scope: "Outside the scope of VAT", not_registered: "No VAT: TileSPEC's VAT registration is not recorded",
};
export const cisStatusLabels: Record<BillingProfile["cis_status"], string> = {
  not_registered: "Not recorded", gross: "Gross payment status", net: "Registered for net payment (20%)", higher: "Not verified (30%)",
};
export const extraStateLabels: Record<ExtraState, string> = { draft: "With site", submitted: "Submitted", approved: "Approved", disputed: "Disputed", rejected: "Rejected" };
export const documentKindLabels: Record<DocumentKind, string> = {
  payment_application: "Payment application", final_account: "Final account", invoice: "Invoice", credit_note: "Credit note",
  default_payment_notice: "Default payment notice", variation_schedule: "Variation schedule", daywork_summary: "Daywork summary", statement: "Statement of account",
};
export const lineKindLabels: Record<Line["kind"], string> = {
  contract_works: "Contract works", stage: "Stage payment", extra_work: "Variation or daywork", materials_on_site: "Materials on site", other: "Other addition",
  deduction: "Agreed deduction",
};

/** Plain words for the office about what is still needed on an application. */
export function nextStep(row: AccountRow, today = londonDate()): string {
  switch (row.display_status) {
    case "draft": return "Check the figures and preview the document, then approve and issue it.";
    case "submitted":
      if (row.construction_act && row.payment_notice_by && today > row.payment_notice_by && !row.default_notice_on)
        return `No payment notice by ${longDate(row.payment_notice_by)}. You can give a default payment notice.`;
      return row.payment_notice_by ? `Waiting for the client's payment notice, due by ${longDate(row.payment_notice_by)}.` : "Waiting for the client's certificate.";
    case "certified": return `Certified. ${formatPounds(row.payable)} expected by ${row.final_on_effective ? longDate(row.final_on_effective) : "the final date"}.`;
    case "part_paid": return `${formatPounds(row.outstanding)} still to be paid.`;
    case "overdue": return `${formatPounds(row.outstanding)} overdue by ${row.overdue_days} day${row.overdue_days === 1 ? "" : "s"}.`;
    case "disputed": return "In dispute. Record the outcome when it is resolved.";
    case "paid": return "Paid in full.";
    default: return "";
  }
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------
const choice = <T extends string>(form: FormData, key: string, choices: readonly T[], fallback: T): T => {
  const value = text(form, key, 30) || fallback;
  if (!(choices as readonly string[]).includes(value)) throw new ValidationError(`Choose ${key.replaceAll("_", " ")}.`);
  return value as T;
};
const checked = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";
const whole = (form: FormData, key: string, label: string, min: number, max: number, fallback: number) => {
  const raw = text(form, key, 6);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new ValidationError(`Enter ${label} as a whole number from ${min} to ${max}.`);
  return Number(raw);
};
const percent = (form: FormData, key: string, label: string) => { const raw = text(form, key, 10); return raw ? parsePercent(raw, label) : null; };
const optionalDate = (form: FormData, key: string, label: string, notFuture = true) => {
  const value = text(form, key, 10);
  if (!value) return null;
  if (!isCalendarDate(value) || (notFuture && value > londonDate())) throw new ValidationError(`Enter ${label}${notFuture ? ", not in the future" : ""}.`);
  return value;
};
const email = (form: FormData, key: string) => {
  const value = text(form, key, 254);
  if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new ValidationError("Enter a valid email address.");
  return value || null;
};

/** Each contract's own payment terms. Blank optional fields are sent as absent, not invented. */
export function termsInput(form: FormData) {
  const basis = choice(form, "basis", ["interim", "milestones", "schedule", "completion"] as const, "interim");
  const vat = choice(form, "vat_treatment", ["standard", "reduced", "zero", "reverse_charge", "exempt", "outside_scope"] as const, "standard");
  const advance = optionalPounds(form, "advance_payment", "the advance payment") ?? 0;
  const data: Record<string, unknown> = {
    basis, advance_payment: advance,
    advance_recovery: choice(form, "advance_recovery", ["pro_rata", "first_interim", "final_account"] as const, "pro_rata"),
    materials_on_site: checked(form, "materials_on_site"), retention_on_materials: checked(form, "retention_on_materials"),
    retention_percent: percent(form, "retention_percent", "the retention percentage") ?? 0,
    retention_cap_percent: percent(form, "retention_cap_percent", "the retention limit"),
    retention_cap_amount: optionalPounds(form, "retention_cap_amount", "the retention limit"),
    retention_pc_release_percent: percent(form, "retention_pc_release_percent", "the share released at practical completion") ?? 50,
    defects_period_months: whole(form, "defects_period_months", "the defects period in months", 0, 120, 12),
    construction_act: checked(form, "construction_act"),
    due_days: whole(form, "due_days", "the days to the due date", 0, 120, 7),
    final_payment_days: whole(form, "final_payment_days", "the days to the final date for payment", 0, 120, 17),
    payment_notice_days: whole(form, "payment_notice_days", "the payment notice period", 0, 60, 5),
    pay_less_notice_days: whole(form, "pay_less_notice_days", "the pay less notice period", 0, 60, 7),
    vat_treatment: vat, cis_applies: checked(form, "cis_applies"),
    cis_rate: Number(choice(form, "cis_rate", ["0", "20", "30"] as const, "20")),
    daywork_labour_markup: percent(form, "daywork_labour_markup", "the labour markup") ?? 0,
    daywork_plant_markup: percent(form, "daywork_plant_markup", "the plant markup") ?? 0,
    daywork_materials_markup: percent(form, "daywork_materials_markup", "the materials markup") ?? 0,
    order_reference: text(form, "order_reference", 120) || null, bill_to_name: text(form, "bill_to_name", 160) || null,
    bill_to_address: text(form, "bill_to_address", 500) || null, bill_to_email: email(form, "bill_to_email"),
    payment_terms: text(form, "payment_terms", 4000),
  };
  if (basis === "interim") {
    data.valuation_frequency = choice(form, "valuation_frequency", ["monthly", "four_weekly", "fortnightly", "weekly"] as const, "monthly");
    if (data.valuation_frequency === "monthly" && text(form, "valuation_day", 2)) data.valuation_day = whole(form, "valuation_day", "the valuation day", 1, 31, 31);
  }
  if (["standard", "reduced", "reverse_charge"].includes(vat)) data.vat_rate = percent(form, "vat_rate", "the VAT rate") ?? (vat === "reduced" ? 5 : 20);
  if (data.retention_cap_percent !== null && data.retention_cap_amount !== null)
    throw new ValidationError("Give the retention limit as a percentage or an amount, not both.");
  for (const key of ["retention_cap_percent", "retention_cap_amount"]) if (data[key] === null) delete data[key];
  return data;
}

export function billingProfileInput(form: FormData) {
  const vatRegistered = checked(form, "vat_registered");
  return {
    legal_name: text(form, "legal_name", 160), trading_name: text(form, "trading_name", 160), registered_address: text(form, "registered_address", 500),
    company_number: text(form, "company_number", 12), vat_registered: vatRegistered, vat_number: vatRegistered ? text(form, "vat_number", 20) : "",
    cis_status: choice(form, "cis_status", ["not_registered", "gross", "net", "higher"] as const, "not_registered"),
    email: email(form, "email") ?? "", phone: text(form, "phone", 40), website: text(form, "website", 200),
    bank_account_name: text(form, "bank_account_name", 120), bank_sort_code: text(form, "bank_sort_code", 10),
    bank_account_number: text(form, "bank_account_number", 12), payment_instructions: text(form, "payment_instructions", 500),
    document_footer: text(form, "document_footer", 500),
  };
}

/** What the server says may be claimed, so a form can never name anything else. */
export type ClaimOptions = { extras: Extra[]; stages: Stage[] };

/**
 * A cumulative valuation to the period end. Contract works or the stages reached, each agreed
 * extra ticked at the value entered (no more than agreed), materials on site, other additions and
 * agreed deductions. An advance application has no lines.
 */
export function valuationInput(form: FormData, options: ClaimOptions, kind: ApplicationKind = "interim") {
  const period_end = text(form, "period_end", 10, true);
  if (!isCalendarDate(period_end)) throw new ValidationError("Enter the date the valuation runs to.");
  const note = text(form, "note", 1000);
  const cis = optionalPounds(form, "cis_materials", "the materials element for CIS");
  const base = { period_end, ...(note ? { note } : {}), ...(cis !== null ? { cis_materials: cis } : {}) };
  if (kind === "advance") return { ...base, lines: [] as Record<string, unknown>[] };
  const lines: { kind: Line["kind"]; daywork_id?: string; stage_id?: string; description: string; amount: number }[] = [];
  const works = optionalPounds(form, "contract_works", "the value of contract works");
  if (works !== null) lines.push({ kind: "contract_works", description: text(form, "contract_works_description", 300) || `Contract works to ${longDate(period_end)}`, amount: works });
  for (const stage of options.stages.filter(s => !s.voided_at)) {
    if (!checked(form, `stage_${stage.id}`)) continue;
    const amount = optionalPounds(form, `stage_amount_${stage.id}`, `the value of "${stage.label}"`) ?? stage.amount;
    if (amount > stage.amount) throw new ValidationError(`"${stage.label}" can be claimed up to ${formatPounds(stage.amount)}.`);
    lines.push({ kind: "stage", stage_id: stage.id, description: stage.label.slice(0, 300), amount });
  }
  for (const extra of options.extras.filter(e => e.claimable)) {
    if (!checked(form, `claim_${extra.daywork_id}`)) continue;
    const agreed = extra.approved_total ?? 0;
    const amount = optionalPounds(form, `amount_${extra.daywork_id}`, `the value of ${extra.reference}`) ?? agreed;
    if (amount > agreed) throw new ValidationError(`${extra.reference} can be claimed up to its agreed value of ${formatPounds(agreed)}.`);
    lines.push({ kind: "extra_work", daywork_id: extra.daywork_id, description: `${extra.reference} ${extra.description}`.slice(0, 300), amount });
  }
  const materials = optionalPounds(form, "materials_on_site", "materials on site");
  if (materials) lines.push({ kind: "materials_on_site", description: text(form, "materials_description", 300) || "Materials on site", amount: materials });
  const other = optionalPounds(form, "other_amount", "the other addition", { allowNegative: true }), otherDescription = text(form, "other_description", 300);
  if (other) { if (!otherDescription) throw new ValidationError("Say what the other addition is for."); lines.push({ kind: "other", description: otherDescription, amount: other }); }
  for (const n of [1, 2, 3]) {
    const amount = optionalPounds(form, `deduction_${n}`, "the agreed deduction"), description = text(form, `deduction_${n}_description`, 300);
    if (!amount) continue;
    if (!description) throw new ValidationError("Say what each agreed deduction is for.");
    lines.push({ kind: "deduction", description, amount });
  }
  if (!lines.some(line => line.kind !== "deduction")) throw new ValidationError("Enter the value of the work, or tick the stages reached.");
  return { ...base, lines };
}

export function certificateInput(form: FormData) {
  const certified_on = optionalDate(form, "certified_on", "the certificate date"), reference = text(form, "certificate_reference", 120);
  const retention = optionalPounds(form, "certified_retention", "the retention certified"), deductions = optionalPounds(form, "certified_deductions", "the deductions certified");
  return { certified_gross: parsePounds(form.get("certified_gross"), "the certified gross value"), ...(certified_on ? { certified_on } : {}),
    ...(reference ? { certificate_reference: reference } : {}), ...(retention !== null ? { certified_retention: retention } : {}),
    ...(deductions !== null ? { certified_deductions: deductions } : {}) };
}
export function payLessInput(form: FormData) {
  const given_on = optionalDate(form, "given_on", "the date the notice was given"), basis = text(form, "basis", 2000, true), reference = text(form, "reference", 120);
  if (basis.length < 3) throw new ValidationError("Record the basis the notice gives.");
  return { application_id: uuid(form, "application_id"), sum_stated: parsePounds(form.get("sum_stated"), "the sum the notice states", { allowNegative: true }),
    basis, ...(given_on ? { given_on } : {}), ...(reference ? { reference } : {}) };
}
export function receiptInput(form: FormData) {
  const amount = parsePounds(form.get("amount"), "the amount received");
  if (amount <= 0) throw new ValidationError("Enter the amount received.");
  const received_on = optionalDate(form, "received_on", "the date received"), reference = text(form, "reference", 120), note = text(form, "note", 500);
  const cis = optionalPounds(form, "cis_deducted", "the CIS deducted");
  return { application_id: uuid(form, "application_id"), amount, ...(cis ? { cis_deducted: cis } : {}), ...(received_on ? { received_on } : {}),
    ...(reference ? { reference } : {}), ...(note ? { note } : {}) };
}
export function disputeInput(form: FormData) {
  const summary = text(form, "summary", 1000, true);
  if (summary.length < 5) throw new ValidationError("Say what is in dispute.");
  const subject = text(form, "application_id", 36) ? { application_id: uuid(form, "application_id") } : { daywork_id: uuid(form, "daywork_id") };
  const raised_on = optionalDate(form, "raised_on", "the date"), amount = optionalPounds(form, "amount_disputed", "the amount in dispute");
  return { ...subject, raised_by_party: choice(form, "raised_by_party", ["client", "tilespec"] as const, "client"), summary,
    ...(raised_on ? { raised_on } : {}), ...(amount !== null ? { amount_disputed: amount } : {}) };
}
export function resolutionInput(form: FormData) {
  const resolution = text(form, "resolution", 1000, true), resolved_on = optionalDate(form, "resolved_on", "the date resolved");
  if (resolution.length < 3) throw new ValidationError("Record how it was resolved.");
  return { resolution, ...(resolved_on ? { resolved_on } : {}) };
}
export function stageInput(form: FormData) {
  const label = text(form, "label", 200, true), planned_on = text(form, "planned_on", 10), note = text(form, "note", 500);
  if (label.length < 2) throw new ValidationError("Name the stage.");
  if (planned_on && !isCalendarDate(planned_on)) throw new ValidationError("Enter the planned date.");
  return { contract_id: uuid(form, "contract_id"), label, amount: parsePounds(form.get("amount"), "the stage value"), ...(planned_on ? { planned_on } : {}),
    ...(note ? { note } : {}) };
}
export function completionInput(form: FormData) {
  const pc = optionalDate(form, "practical_completion_on", "the date of practical completion"), mg = optionalDate(form, "making_good_on", "the date of making good");
  if (!pc && !mg) throw new ValidationError("Enter the date of practical completion or making good.");
  if (pc && mg && mg < pc) throw new ValidationError("Making good cannot be before practical completion.");
  return { ...(pc ? { practical_completion_on: pc } : {}), ...(mg ? { making_good_on: mg } : {}) };
}
export function creditNoteInput(form: FormData) {
  const reason = text(form, "reason", 1000, true), amount = optionalPounds(form, "amount", "the amount to credit");
  if (reason.length < 3) throw new ValidationError("Say why the credit note is issued.");
  return { invoice_id: uuid(form, "invoice_id"), reason, ...(amount !== null ? { amount } : {}) };
}
export function shareInput(form: FormData) {
  const days = whole(form, "days", "the number of days", 1, 90, 30), recipient = text(form, "recipient", 200);
  return { days, ...(recipient ? { recipient } : {}) };
}
