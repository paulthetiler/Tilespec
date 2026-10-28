import { dayworkUnits, rateCategories } from "./dayworks";
import { isCalendarDate, isClockTime, londonDate, londonTimeToIso } from "./planning";
import { text, uuid, ValidationError } from "./validation";

const optionalId = (form: FormData, key: string) => (text(form, key) ? uuid(form, key) : null);
const twoPlaces = (value: unknown, label: string, minimum: number, maximum: number) => {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new ValidationError(`Enter ${label} as a number with up to two decimal places.`);
  const n = Number(raw);
  if (n < minimum || n > maximum) throw new ValidationError(`Enter ${label} from ${minimum} to ${maximum}.`);
  return n;
};
const optionalDate = (form: FormData, key: string, label: string) => {
  const value = text(form, key, 10);
  if (value && !isCalendarDate(value)) throw new ValidationError(`Enter a valid ${label}.`);
  if (value && value > londonDate()) throw new ValidationError(`The ${label} cannot be in the future.`);
  return value || null;
};

export type DayworkLineInput = { kind: "labour" | "plant" | "material"; label: string; role?: "operative" | "supervisor"; work_date?: string; quantity: number; unit?: string };

/** The people, plant and materials, sent by the form as one list. Empty rows are left out. */
export function linesInput(form: FormData): DayworkLineInput[] {
  const raw = text(form, "lines", 50000);
  let rows: unknown;
  try { rows = raw ? JSON.parse(raw) : []; } catch { throw new ValidationError("The lines could not be read. Refresh and try again."); }
  if (!Array.isArray(rows) || rows.length > 100) throw new ValidationError("Enter at most 100 lines.");
  const today = londonDate();
  return rows.filter(row => row && typeof row === "object" && String((row as Record<string, unknown>).label ?? "").trim()).map((row, index) => {
    const r = row as Record<string, unknown>, n = index + 1;
    const kind = r.kind, label = String(r.label).trim();
    if (kind !== "labour" && kind !== "plant" && kind !== "material") throw new ValidationError(`Line ${n}: choose labour, plant or materials.`);
    if (label.length > 120) throw new ValidationError(`Line ${n}: keep the name under 120 characters.`);
    const work_date = typeof r.work_date === "string" && r.work_date ? r.work_date : undefined;
    if (work_date && (!isCalendarDate(work_date) || work_date > today)) throw new ValidationError(`Line ${n}: enter a work date that is not in the future.`);
    if (kind === "labour") {
      if (r.role !== "operative" && r.role !== "supervisor") throw new ValidationError(`Line ${n}: say whether ${label} is an operative or a supervisor.`);
      if (!work_date) throw new ValidationError(`Line ${n}: enter the day ${label} worked.`);
      return { kind, label, role: r.role, work_date, quantity: twoPlaces(r.quantity, `the hours for ${label}`, 0.25, 24) };
    }
    if (typeof r.unit !== "string" || !dayworkUnits.some(unit => unit === r.unit)) throw new ValidationError(`Line ${n}: choose a unit for ${label}.`);
    return { kind, label, unit: r.unit, quantity: twoPlaces(r.quantity, `the quantity of ${label}`, 0.01, 100000), ...(work_date ? { work_date } : {}) };
  });
}

export function dayworkInput(form: FormData) {
  const description = text(form, "description", 2000, true);
  if (description.length < 5) throw new ValidationError("Say what extra work was done.");
  const company = text(form, "instructed_by_company", 120);
  const instructed_on = optionalDate(form, "instructed_on", "date it was asked for");
  const work_area_id = optionalId(form, "work_area_id");
  return {
    contract_id: uuid(form, "contract_id"), description, instructed_by_name: text(form, "instructed_by_name", 120, true),
    ...(company ? { instructed_by_company: company } : {}), ...(instructed_on ? { instructed_on } : {}), ...(work_area_id ? { work_area_id } : {}),
    lines: linesInput(form),
  };
}

export function signoffInput(form: FormData) {
  const outcome = text(form, "outcome", 12, true);
  if (outcome !== "signed" && outcome !== "refused" && outcome !== "unavailable") throw new ValidationError("Choose signed, refused or not available.");
  const name = text(form, "signer_name", 120), position = text(form, "signer_position", 120), company = text(form, "signer_company", 120), reason = text(form, "reason", 1000);
  if (outcome === "signed" && !name) throw new ValidationError("Enter the name of the person who signed.");
  if (outcome !== "signed" && reason.length < 3) throw new ValidationError("Say why it was not signed.");
  const time = text(form, "signed_time", 5);
  if (time && !isClockTime(time)) throw new ValidationError("Enter the time as HH:MM.");
  return { outcome, ...(name ? { signer_name: name } : {}), ...(position ? { signer_position: position } : {}), ...(company ? { signer_company: company } : {}),
    ...(reason ? { reason } : {}), ...(time ? { signed_at: londonTimeToIso(londonDate(), time) } : {}) };
}

export function decisionInput(form: FormData) {
  const decision = text(form, "decision", 20, true);
  if (decision !== "approve" && decision !== "request_detail" && decision !== "reject") throw new ValidationError("Choose approve, ask for more detail or reject.");
  const note = text(form, "note", 1000), override_reason = text(form, "override_reason", 1000);
  if (decision !== "approve" && note.length < 3) throw new ValidationError(decision === "reject" ? "Say why it is rejected." : "Say what detail is needed.");
  return { decision, ...(note ? { note } : {}), ...(override_reason ? { override_reason } : {}) };
}

export function clientAuthorisationInput(form: FormData) {
  const outcome = text(form, "outcome", 12, true);
  if (outcome !== "authorised" && outcome !== "declined") throw new ValidationError("Choose authorised or declined.");
  const reference = text(form, "reference", 120), note = text(form, "note", 1000), document_id = optionalId(form, "document_id");
  const decided_on = optionalDate(form, "decided_on", "decision date");
  if (outcome === "authorised" && !reference && !document_id) throw new ValidationError("Enter the client's instruction reference or choose the document that authorises it.");
  if (outcome === "declined" && note.length < 3) throw new ValidationError("Say why the client declined.");
  return { outcome, client_name: text(form, "client_name", 120, true), ...(decided_on ? { decided_on } : {}), ...(reference ? { reference } : {}),
    ...(document_id ? { document_id } : {}), ...(note ? { note } : {}) };
}

export function rateInput(form: FormData) {
  const contract_id = uuid(form, "contract_id"), supersedes_id = optionalId(form, "supersedes_id");
  const retired = form.get("retired") === "on";
  if (supersedes_id) return { contract_id, supersedes_id, ...(retired ? { retired: true } : { rate: twoPlaces(form.get("rate"), "the rate", 0, 100000) }) };
  const category = text(form, "category", 12, true);
  if (!rateCategories.some(value => value === category)) throw new ValidationError("Choose operative, supervisor, plant or material.");
  const unit = category === "operative" || category === "supervisor" ? "hour" : text(form, "unit", 10, true);
  if (!dayworkUnits.some(value => value === unit)) throw new ValidationError("Choose a unit.");
  return { contract_id, category, item: text(form, "item", 120, true), unit, rate: twoPlaces(form.get("rate"), "the rate", 0, 100000) };
}

/** One chosen rate per line; the form names each select after its line. */
export function pricingInput(form: FormData) {
  const lineIds = text(form, "line_ids", 4000, true).split(",").filter(Boolean);
  if (!lineIds.length || lineIds.length > 100) throw new ValidationError("There are no lines to price.");
  return { lines: lineIds.map(line_id => {
    if (!/^[0-9a-f-]{36}$/i.test(line_id)) throw new ValidationError("The lines could not be read. Refresh and try again.");
    const rate_id = text(form, `rate_${line_id}`, 36);
    if (!rate_id) throw new ValidationError("Choose a rate for every line. Add any missing rate to the job first.");
    return { line_id, rate_id: uuid(form, `rate_${line_id}`) };
  }) };
}

export function chargeInput(form: FormData) {
  const note = text(form, "note", 1000), override_reason = text(form, "override_reason", 1000);
  return { ...(note ? { note } : {}), ...(override_reason ? { override_reason } : {}) };
}
