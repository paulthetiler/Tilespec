/*
 * Job costs (C3). Pure types, labels and form parsing shared by the pages, the server actions and
 * the tests. Materials used on site carry quantities only; every other type here is money and is
 * only ever filled from loaders that run for people with money access.
 */
import { isCalendarDate, londonDate } from "./planning";
import { text, uuid, ValidationError } from "./validation";

export const materialUnits = ["each", "m2", "m", "kg", "litre", "bag", "box", "tub", "tonne", "roll", "pack", "sheet", "length", "tube", "tile"] as const;
export type MaterialUnit = (typeof materialUnits)[number];
export const materialUnitLabels: Record<MaterialUnit, string> = {
  each: "each", m2: "m²", m: "metres", kg: "kg", litre: "litres", bag: "bags", box: "boxes", tub: "tubs", tonne: "tonnes",
  roll: "rolls", pack: "packs", sheet: "sheets", length: "lengths", tube: "tubes", tile: "tiles",
};
export const costCategories = ["materials", "subcontract", "plant", "other"] as const;
export type CostCategory = (typeof costCategories)[number];
export const costCategoryLabels: Record<CostCategory, string> = { materials: "Materials", subcontract: "Subcontract", plant: "Plant", other: "Other" };

/** What a supervisor recorded. Never a price. */
export type MaterialRecord = {
  id: string; contract_id: string; batch_id: string; position: number; work_date: string; item: string; quantity: number; unit: MaterialUnit;
  work_area_id: string | null; location_path: string[]; note: string | null; recorded_by: string; recorded_by_name: string; recorded_at: string;
  voided_at: string | null; void_reason: string | null;
};
/** Money access only. */
export type LabourCostLine = {
  work_date: string; subject: "operative" | "team"; subject_id: string; name: string; hours: number; basis: "hour" | "day" | null;
  rate: number | null; cost: number | null; status: "costed" | "no_rate" | "open";
};
export type LabourRate = {
  id: string; contract_id: string | null; operative_id: string | null; company_id: string | null; team_id: string | null; basis: "hour" | "day";
  rate: number; effective_from: string; note: string | null; created_by_name: string; created_at: string; voided_at: string | null;
};
export type JobCostEntry = {
  id: string; contract_id: string; category: CostCategory; company_id: string | null; supplier: string | null; reference: string | null; description: string;
  cost_date: string; net_amount: number; work_area_id: string | null; daywork_id: string | null; document_id: string | null;
  recorded_by_name: string; recorded_at: string; voided_at: string | null; void_reason: string | null;
};
export type MaterialMatch = { id: string; material_record_id: string; cost_entry_id: string; matched_by_name: string; matched_at: string; voided_at: string | null };

/** The labour position in plain numbers: what is costed, and what is not yet. */
export function labourSummary(lines: Pick<LabourCostLine, "hours" | "cost" | "status">[]) {
  const costed = lines.filter(line => line.status === "costed");
  return {
    cost: Math.round(costed.reduce((sum, line) => sum + (line.cost ?? 0), 0) * 100) / 100,
    costedHours: Math.round(costed.reduce((sum, line) => sum + line.hours, 0) * 100) / 100,
    noRateHours: Math.round(lines.filter(line => line.status === "no_rate").reduce((sum, line) => sum + line.hours, 0) * 100) / 100,
    open: lines.filter(line => line.status === "open").length,
  };
}

const money = (value: unknown, label: string, minimum: number, maximum: number, allowNegative = false) => {
  const raw = typeof value === "string" ? value.trim().replace(/^£/, "").replace(/,/g, "") : "";
  if (!(allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(raw)) throw new ValidationError(`Enter ${label} in pounds and pence.`);
  const n = Number(raw);
  if (n < minimum || n > maximum || n === 0) throw new ValidationError(`Enter ${label} from £${minimum.toLocaleString("en-GB")} to £${maximum.toLocaleString("en-GB")}.`);
  return n;
};
const quantity = (value: unknown, label: string) => {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 1_000_000) throw new ValidationError(`Enter how much ${label} as a number, up to two decimal places.`);
  return Number(raw);
};
const isId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export type MaterialLineInput = { item: string; quantity: number; unit: MaterialUnit; work_area_id?: string; note?: string };
/** Materials used, sent by the form as one list. Empty rows are left out. Never a price. */
export function materialsInput(form: FormData) {
  const raw = text(form, "materials", 30000);
  let rows: unknown;
  try { rows = raw ? JSON.parse(raw) : []; } catch { throw new ValidationError("The materials could not be read. Refresh and try again."); }
  if (!Array.isArray(rows)) throw new ValidationError("The materials could not be read. Refresh and try again.");
  const lines: MaterialLineInput[] = rows.filter(row => row && typeof row === "object" && String((row as Record<string, unknown>).item ?? "").trim()).map((row, index) => {
    const r = row as Record<string, unknown>, item = String(r.item).trim(), n = index + 1;
    if (item.length > 120) throw new ValidationError(`Line ${n}: keep the name under 120 characters.`);
    if (typeof r.unit !== "string" || !materialUnits.some(unit => unit === r.unit)) throw new ValidationError(`Line ${n}: choose a unit for ${item}.`);
    const note = typeof r.note === "string" ? r.note.trim() : "";
    if (note.length > 500) throw new ValidationError(`Line ${n}: keep the note under 500 characters.`);
    return { item, quantity: quantity(r.quantity, `${item}`), unit: r.unit as MaterialUnit,
      ...(isId(r.work_area_id) ? { work_area_id: r.work_area_id } : {}), ...(note ? { note } : {}) };
  });
  if (!lines.length) throw new ValidationError("Add at least one material and how much was used.");
  if (lines.length > 50) throw new ValidationError("Enter at most 50 materials at a time.");
  const work_date = text(form, "work_date", 10);
  if (work_date && (!isCalendarDate(work_date) || work_date > londonDate())) throw new ValidationError("Enter a date that is not in the future.");
  return { contract_id: uuid(form, "contract_id"), ...(work_date ? { work_date } : {}), lines };
}

export function labourRateInput(form: FormData) {
  const subject = text(form, "subject", 10, true);
  if (subject !== "operative" && subject !== "company" && subject !== "team") throw new ValidationError("Choose an operative, a company or a gang.");
  const basis = subject === "team" ? "day" : text(form, "basis", 4, true);
  if (basis !== "hour" && basis !== "day") throw new ValidationError("Choose per hour or per day.");
  const effective_from = text(form, "effective_from", 10, true);
  if (!isCalendarDate(effective_from)) throw new ValidationError("Enter the date the rate applies from.");
  const scope = text(form, "scope", 10, true), note = text(form, "note", 500);
  if (scope !== "job" && scope !== "all") throw new ValidationError("Say whether the rate is for this job or every job.");
  return { subject, subject_id: uuid(form, `${subject}_id`), basis, rate: money(form.get("rate"), "the rate", 0.01, 100_000), effective_from,
    ...(scope === "job" ? { contract_id: uuid(form, "contract_id") } : {}), ...(note ? { note } : {}) };
}

export function jobCostInput(form: FormData) {
  const category = text(form, "category", 12, true);
  if (!costCategories.some(value => value === category)) throw new ValidationError("Choose materials, subcontract, plant or other.");
  const company = text(form, "company_id", 36), supplier = text(form, "supplier", 160), reference = text(form, "reference", 120);
  if (!company && !supplier) throw new ValidationError("Say who the supplier or subcontractor is.");
  const description = text(form, "description", 500, true);
  if (description.length < 3) throw new ValidationError("Say what the cost is for.");
  const cost_date = text(form, "cost_date", 10);
  if (cost_date && !isCalendarDate(cost_date)) throw new ValidationError("Enter a valid date.");
  const optional = (key: string) => (text(form, key, 36) ? { [key]: uuid(form, key) } : {});
  return { contract_id: uuid(form, "contract_id"), category, ...(company ? { company_id: uuid(form, "company_id") } : {}), ...(supplier ? { supplier } : {}),
    ...(reference ? { reference } : {}), description, ...(cost_date ? { cost_date } : {}),
    net_amount: money(form.get("net_amount"), "the net amount", -10_000_000, 10_000_000, true),
    ...optional("work_area_id"), ...optional("daywork_id"), ...optional("document_id") };
}
