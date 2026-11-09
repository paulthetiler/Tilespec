import { ValidationError } from "./validation";

/*
 * Gang invoices: gangs claim the work, supervisors verify the work, the office approves the money.
 * These helpers shape what each screen sends to its database function. The database checks every
 * value again and is the authority on permissions, quantities and money.
 */

export const gangUnits = ["m2", "lm", "item"] as const;
export type GangUnit = (typeof gangUnits)[number];
export const unitLabels: Record<GangUnit, string> = { m2: "m²", lm: "linear m", item: "items" };
export const unitLabel = (unit: string) => unitLabels[unit as GangUnit] ?? unit;
export const quantityText = (quantity: number | string | null | undefined, unit: string) =>
  quantity === null || quantity === undefined || quantity === "" ? "—" : `${Number(quantity).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${unitLabel(unit)}`;

export type GangInvoiceStatus = "uploading" | "awaiting_check" | "with_office" | "query_gang" | "returned" | "approved" | "paid" | "rejected" | "cancelled" | "superseded";
export type Workmanship = "satisfactory" | "correction_needed" | null;

/** Plain labels, the same on every screen. */
export function gangStatusLabel(status: string, workmanship?: Workmanship | string | null): string {
  switch (status) {
    case "uploading": return "Upload not finished";
    case "awaiting_check": return "Awaiting check";
    case "with_office": return workmanship === "correction_needed" ? "Correction needed · Sent to office" : "Checked and passed · Sent to office";
    case "query_gang": return "Question from the office";
    case "returned": return "Returned for correction";
    case "approved": return "Approved for payment";
    case "paid": return "Payment recorded";
    case "rejected": return "Rejected";
    case "cancelled": return "Withdrawn";
    case "superseded": return "Replaced by a corrected invoice";
    default: return status;
  }
}
export type StatusTone = "wait" | "good" | "attention" | "closed";
export function gangStatusTone(status: string, workmanship?: string | null): StatusTone {
  if (status === "approved" || status === "paid") return "good";
  if (status === "with_office") return workmanship === "correction_needed" ? "attention" : "good";
  if (status === "query_gang" || status === "returned" || status === "uploading") return "attention";
  if (status === "rejected" || status === "cancelled" || status === "superseded") return "closed";
  return "wait";
}
/** Who the invoice is waiting on, in words a gang understands. */
export function gangNextStep(status: string): string {
  switch (status) {
    case "uploading": return "Your invoice file did not finish uploading. Send it again or withdraw it.";
    case "awaiting_check": return "The site supervisor will check the work.";
    case "with_office": return "Checked on site. The office is reviewing it.";
    case "query_gang": return "The office has asked you a question. Answer it below.";
    case "returned": return "The office returned it. Send a corrected invoice or withdraw it.";
    case "approved": return "Approved. It will be paid on the scheduled date.";
    case "paid": return "Payment has been recorded.";
    default: return "";
  }
}

const weekdays = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type GangTerms = { payment_cycle: string; pay_weekday: number; payment_days: number; cycle_anchor: string | null };
export function paymentTermsText(t: GangTerms): string {
  const day = weekdays[t.pay_weekday] ?? "Friday";
  const after = t.payment_days === 7 ? `the following ${day}` : `${t.payment_days} days later`;
  if (t.payment_cycle === "weekly") return `Weekly: invoices in by ${day} are paid ${after}.`;
  if (t.payment_cycle === "fortnightly") return `Fortnightly: periods end every other ${day}${t.cycle_anchor ? ` (from ${t.cycle_anchor})` : ""}; paid ${t.payment_days} days after the period ends.`;
  return `Custom: paid ${t.payment_days} days after the invoice is received.`;
}

/** Same rule as the database's private.gang_payment_due, for previews only. */
export function paymentDue(t: GangTerms, invoiceDate: string): string {
  const d = new Date(`${invoiceDate}T00:00:00Z`);
  const isoDow = ((d.getUTCDay() + 6) % 7) + 1;
  const add = (days: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + days); return x; };
  let due: Date;
  if (t.payment_cycle === "weekly") due = add((t.pay_weekday - isoDow + 7) % 7 + t.payment_days);
  else if (t.payment_cycle === "fortnightly" && t.cycle_anchor) {
    const anchor = new Date(`${t.cycle_anchor}T00:00:00Z`);
    const diff = Math.round((d.getTime() - anchor.getTime()) / 86400000);
    const r = ((diff % 14) + 14) % 14;
    due = add(((14 - r) % 14) + t.payment_days);
  } else due = add(t.payment_days);
  return due.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Form parsing. Quantities are decimals with at most two places; empty optional fields are omitted.
// ---------------------------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function field(form: FormData, key: string, max = 2000): string {
  const raw = form.get(key);
  if (raw !== null && typeof raw !== "string") throw new ValidationError("Check the form and try again.");
  const value = (raw ?? "").trim();
  if (value.length > max) throw new ValidationError(`Keep ${key.replaceAll("_", " ")} under ${max} characters.`);
  return value;
}
function id(value: string, message: string): string {
  if (!UUID.test(value)) throw new ValidationError(message);
  return value;
}
export function parseQuantity(raw: string, label: string, { allowZero = false, required = true } = {}): number | null {
  const value = raw.trim().replace(/,/g, "");
  if (!value) {
    if (required) throw new ValidationError(`Enter the quantity for ${label}.`);
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new ValidationError(`Enter the quantity for ${label} as a number, for example 55 or 55.5.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n >= 100000 || (!allowZero && n <= 0)) throw new ValidationError(`Check the quantity for ${label}.`);
  return n;
}
export function parseMoney(raw: string, label: string, { allowNegative = false } = {}): number | null {
  const value = raw.trim().replace(/[£,\s]/g, "");
  if (!value) return null;
  if (!(allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value)) throw new ValidationError(`Enter ${label} in pounds and pence, for example 1250.50.`);
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 10_000_000) throw new ValidationError(`Check ${label}.`);
  return n;
}
function optionalDate(form: FormData, key: string): string | null {
  const value = field(form, key, 10);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new ValidationError("Enter a real date.");
  return value;
}

export type GangInvoiceLineInput = { work_area_id: string; unit: GangUnit; quantity: number; description?: string };
export type GangInvoiceInput = {
  contract_id: string; team_id: string; lines: GangInvoiceLineInput[];
  invoice_number?: string; invoice_total?: number; note?: string; period_start?: string; period_end?: string; replaces_invoice_id?: string;
};
/** The gang's form: a job (with its gang), one or more location + quantity lines, optional extras. */
export function parseGangInvoiceForm(form: FormData): GangInvoiceInput {
  const job = field(form, "job", 80);
  const [contract_id, team_id] = job.split(":");
  if (!contract_id || !team_id) throw new ValidationError("Choose the job.");
  id(contract_id, "Choose the job."); id(team_id, "Choose the job.");
  const areas = form.getAll("line_area").map(v => String(v).trim());
  const quantities = form.getAll("line_quantity").map(v => String(v));
  const units = form.getAll("line_unit").map(v => String(v).trim());
  const lines: GangInvoiceLineInput[] = [];
  const seen = new Set<string>();
  areas.forEach((area, index) => {
    const quantityRaw = quantities[index] ?? "";
    if (!area && !quantityRaw.trim()) return; // an unused extra row
    if (!area) throw new ValidationError(`Choose the work area for line ${index + 1}.`);
    id(area, "Choose a work area from the list.");
    const unit = (units[index] || "m2") as GangUnit;
    if (!gangUnits.includes(unit)) throw new ValidationError("Choose m², linear metres or items.");
    const key = `${area}:${unit}`;
    if (seen.has(key)) throw new ValidationError("The same work area is listed twice. Put its total on one line.");
    seen.add(key);
    lines.push({ work_area_id: area, unit, quantity: parseQuantity(quantityRaw, `line ${index + 1}`) as number });
  });
  if (lines.length === 0) throw new ValidationError("Enter the work area and quantity you are claiming.");
  if (lines.length > 20) throw new ValidationError("Claim up to twenty work areas on one invoice.");
  const result: GangInvoiceInput = { contract_id, team_id, lines };
  const invoiceNumber = field(form, "invoice_number", 60);
  if (invoiceNumber) result.invoice_number = invoiceNumber;
  const total = parseMoney(field(form, "invoice_total", 20), "the invoice total");
  if (total !== null) result.invoice_total = total;
  const note = field(form, "note", 2000);
  if (note) result.note = note;
  const periodStart = optionalDate(form, "period_start");
  if (periodStart) result.period_start = periodStart;
  const replaces = field(form, "replaces_invoice_id", 36);
  if (replaces) result.replaces_invoice_id = id(replaces, "The invoice you are correcting could not be found. Refresh and try again.");
  return result;
}

export type VerificationLineInput = { line_id: string; verified_quantity: number; measured_passed?: number; measured_correction?: number; note?: string };
export type VerificationInput = { lines: VerificationLineInput[]; workmanship: "satisfactory" | "correction_needed"; note?: string; correction_note?: string };
export function parseVerificationForm(form: FormData, lineIds: string[]): VerificationInput {
  const lines = lineIds.map((lineId, index) => {
    const label = field(form, `label_${lineId}`, 200) || `line ${index + 1}`;
    const line: VerificationLineInput = { line_id: lineId, verified_quantity: parseQuantity(field(form, `verified_${lineId}`, 20), label, { allowZero: true }) as number };
    const passed = parseQuantity(field(form, `passed_${lineId}`, 20), label, { required: false });
    const correction = parseQuantity(field(form, `correction_${lineId}`, 20), label, { required: false });
    if (passed !== null) line.measured_passed = passed;
    if (correction !== null) line.measured_correction = correction;
    const note = field(form, `note_${lineId}`, 1000);
    if (note) line.note = note;
    return line;
  });
  const workmanship = field(form, "workmanship", 30) === "correction_needed" || lines.some(l => l.measured_correction) ? "correction_needed" : "satisfactory";
  const result: VerificationInput = { lines, workmanship };
  const note = field(form, "note", 2000);
  if (note) result.note = note;
  const correction = field(form, "correction_note", 2000);
  if (correction) result.correction_note = correction;
  if (workmanship === "correction_needed" && (result.correction_note ?? "").length < 3) throw new ValidationError("Describe the correction needed.");
  return result;
}

export const officeActions = ["approve", "recheck", "query_gang", "return", "reject", "mark_paid"] as const;
export type OfficeAction = (typeof officeActions)[number];
export function parseDecisionForm(form: FormData, lineIds: string[]): { action: OfficeAction; data: Record<string, unknown> } {
  const action = field(form, "action", 20) as OfficeAction;
  if (!officeActions.includes(action)) throw new ValidationError("Choose what to do with this invoice.");
  const note = field(form, "note", 2000);
  if (action === "approve") {
    const lines = lineIds.map((lineId, index) => {
      const label = field(form, `label_${lineId}`, 200) || `line ${index + 1}`;
      const approved = parseQuantity(field(form, `approved_${lineId}`, 20), label, { allowZero: true }) as number;
      const rate = parseMoney(field(form, `rate_${lineId}`, 20), `the rate for ${label}`);
      if (approved > 0 && (rate === null || rate <= 0)) throw new ValidationError(`Enter the agreed rate for ${label}.`);
      return { line_id: lineId, approved_quantity: approved, rate: rate ?? 0 };
    });
    const data: Record<string, unknown> = { lines };
    const adjustment = parseMoney(field(form, "adjustment_amount", 20), "the adjustment", { allowNegative: true });
    if (adjustment !== null && adjustment !== 0) {
      data.adjustment_amount = adjustment;
      data.adjustment_reason = field(form, "adjustment_reason", 1000);
      if ((data.adjustment_reason as string).length < 3) throw new ValidationError("Give the reason for the agreed adjustment.");
    }
    if (note) data.note = note;
    const agreed = optionalDate(form, "agreed_payment_on");
    if (agreed) data.agreed_payment_on = agreed;
    return { action, data };
  }
  if (action === "mark_paid") {
    const amount = parseMoney(field(form, "paid_amount", 20), "the amount paid");
    if (amount === null) throw new ValidationError("Enter the amount paid.");
    const data: Record<string, unknown> = { paid_amount: amount };
    const paidOn = optionalDate(form, "paid_on");
    if (paidOn) data.paid_on = paidOn;
    const reference = field(form, "payment_reference", 120);
    if (reference) data.payment_reference = reference;
    if (note) data.note = note;
    return { action, data };
  }
  if (note.length < 3) throw new ValidationError(action === "reject" ? "Give the reason for rejecting it." : "Write a short note explaining what is needed.");
  return { action, data: { note } };
}

// ---------------------------------------------------------------------------------------------
// The agreed rate for a line, the same choice the database records with the approval.
// ---------------------------------------------------------------------------------------------
export type GangRate = { id: string; work_area_id: string | null; unit: string; rate: number; effective_from: string; created_at: string; voided_at: string | null };
export function rateFor(rates: GangRate[], areaPath: string[], unit: string, on: string): GangRate | null {
  const depth = (rate: GangRate) => (rate.work_area_id === null ? 0 : areaPath.indexOf(rate.work_area_id) + 1);
  const candidates = rates.filter(r => !r.voided_at && r.unit === unit && r.effective_from <= on && (r.work_area_id === null || areaPath.includes(r.work_area_id)));
  candidates.sort((a, b) => depth(b) - depth(a) || b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
  return candidates[0] ?? null;
}

export type LedgerRow = { work_area_id: string; area: string; unit: string; passed: number; correction: number; approved: number; verified: number; claimed: number; available: number };
export const emptyLedger = (work_area_id: string, unit: string, area = ""): LedgerRow => ({ work_area_id, area, unit, passed: 0, correction: 0, approved: 0, verified: 0, claimed: 0, available: 0 });
export function ledgerFor(rows: LedgerRow[], workAreaId: string, unit: string): LedgerRow {
  const row = rows.find(r => r.work_area_id === workAreaId && r.unit === unit);
  return row ? { ...row, passed: Number(row.passed), correction: Number(row.correction), approved: Number(row.approved), verified: Number(row.verified), claimed: Number(row.claimed), available: Number(row.available) } : emptyLedger(workAreaId, unit);
}
