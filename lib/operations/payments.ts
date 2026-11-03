/*
 * Payment applications (C4). Money access only. Pure types and form parsing; every figure shown
 * comes from the database's `payment_application_summaries`.
 */
import { isCalendarDate, londonDate } from "./planning";
import { text, uuid, ValidationError } from "./validation";

export type PaymentSummary = {
  application_id: string; number: number; period_end: string; status: "draft" | "submitted" | "certified" | "cancelled";
  gross: number; retention_percent: number; retention: number; net: number; net_this_period: number | null;
  certified_gross: number | null; certified_retention: number | null; certified_net: number | null; certified_this_period: number | null; received: number;
};
export type PaymentApplication = {
  id: string; contract_id: string; number: number; period_end: string; status: PaymentSummary["status"]; note: string | null; lines_version: number; version: number;
  submitted_at: string | null; submitted_by_name: string | null; certified_on: string | null; certificate_reference: string | null; certified_by_name: string | null;
  cancel_reason: string | null; created_by_name: string; created_at: string;
};
export type PaymentLine = {
  id: string; application_id: string; lines_version: number; position: number; kind: "contract_works" | "extra_work" | "materials_on_site" | "other";
  daywork_id: string | null; description: string; amount: number;
};
export type PaymentReceipt = { id: string; application_id: string; received_on: string; amount: number; reference: string | null; recorded_by_name: string; voided_at: string | null };
/** An approved daywork or variation that may be claimed, with its priced total as the suggested value. */
export type ClaimableExtra = { id: string; reference: string; description: string; priced: number };

export const statusLabels: Record<PaymentSummary["status"], string> = { draft: "Draft", submitted: "Submitted", certified: "Certified", cancelled: "Cancelled" };

const pounds = (value: unknown, label: string, allowNegative = false) => {
  const raw = typeof value === "string" ? value.trim().replace(/^£/, "").replace(/,/g, "") : "";
  if (!(allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(raw)) throw new ValidationError(`Enter ${label} in pounds and pence.`);
  const n = Number(raw);
  if (Math.abs(n) > 100_000_000) throw new ValidationError(`Enter ${label} up to £100,000,000.`);
  return n;
};
const optionalPounds = (form: FormData, key: string, label: string, allowNegative = false) => {
  const raw = text(form, key, 30);
  return raw ? pounds(raw, label, allowNegative) : null;
};

/**
 * The office's valuation, cumulative to the period end: the value of work completed, each approved
 * extra being claimed (ticked, at the value entered), materials on site, and any other amount.
 */
export function applicationInput(form: FormData, extras: ClaimableExtra[]) {
  const period_end = text(form, "period_end", 10, true);
  if (!isCalendarDate(period_end)) throw new ValidationError("Enter the date the valuation runs to.");
  const works = pounds(form.get("contract_works"), "the value of work completed");
  const lines: { kind: string; daywork_id?: string; description: string; amount: number }[] = [
    { kind: "contract_works", description: text(form, "contract_works_description", 300) || `Work completed to ${period_end}`, amount: works }];
  for (const extra of extras) {
    if (form.get(`claim_${extra.id}`) !== "on") continue;
    const amount = optionalPounds(form, `amount_${extra.id}`, `the value of ${extra.reference}`) ?? extra.priced;
    lines.push({ kind: "extra_work", daywork_id: extra.id, description: `${extra.reference}: ${extra.description}`.slice(0, 300), amount });
  }
  const materials = optionalPounds(form, "materials_on_site", "materials on site");
  if (materials) lines.push({ kind: "materials_on_site", description: text(form, "materials_description", 300) || "Materials on site", amount: materials });
  const other = optionalPounds(form, "other_amount", "the other amount", true), otherDescription = text(form, "other_description", 300);
  if (other) {
    if (!otherDescription) throw new ValidationError("Say what the other amount is for.");
    lines.push({ kind: "other", description: otherDescription, amount: other });
  }
  const note = text(form, "note", 1000);
  return { period_end, ...(note ? { note } : {}), lines };
}

export function certifyInput(form: FormData) {
  const certified_on = text(form, "certified_on", 10), reference = text(form, "certificate_reference", 120);
  if (certified_on && (!isCalendarDate(certified_on) || certified_on > londonDate())) throw new ValidationError("Enter the certificate date, not in the future.");
  return { certified_gross: pounds(form.get("certified_gross"), "the certified gross value"), ...(certified_on ? { certified_on } : {}),
    ...(reference ? { certificate_reference: reference } : {}) };
}

export function receiptInput(form: FormData) {
  const amount = pounds(form.get("amount"), "the amount received");
  if (amount <= 0) throw new ValidationError("Enter the amount received.");
  const received_on = text(form, "received_on", 10), reference = text(form, "reference", 120), note = text(form, "note", 500);
  if (received_on && (!isCalendarDate(received_on) || received_on > londonDate())) throw new ValidationError("Enter the date received, not in the future.");
  return { application_id: uuid(form, "application_id"), amount, ...(received_on ? { received_on } : {}), ...(reference ? { reference } : {}), ...(note ? { note } : {}) };
}
