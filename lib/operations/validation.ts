import { installationStages, roles } from "./types";
import type { LocationBuilderInput } from "./locations";

export class ValidationError extends Error {}
export function text(form: FormData, key: string, max = 2000, required = false) {
  const raw = form.get(key);
  if (raw !== null && typeof raw !== "string") throw new ValidationError(`Invalid ${key.replaceAll("_", " ")}.`);
  const value = (raw || "").toString().trim();
  if (value.length > max || (required && !value)) throw new ValidationError(`Check ${key.replaceAll("_", " ")} (maximum ${max} characters).`);
  return value;
}
export function uuid(form: FormData, key: string) {
  const value = text(form, key, 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError("The record identifier is invalid. Refresh and try again.");
  return value;
}
export function decimal(form: FormData, key: string, maximum = 1_000_000_000) {
  const value = text(form, key, 25, true);
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new ValidationError(`Enter a non-negative number for ${key.replaceAll("_", " ")} (up to two decimal places).`);
  const n = Number(value);
  if (!Number.isFinite(n) || n > maximum) throw new ValidationError(`Check ${key.replaceAll("_", " ")}.`);
  return n;
}
export function integer(form: FormData, key: string, minimum = 0, maximum = 1_000_000) {
  const n = decimal(form, key, maximum);
  if (!Number.isSafeInteger(n) || n < minimum) throw new ValidationError(`Enter a whole number for ${key.replaceAll("_", " ")}.`);
  return n;
}
function date(form: FormData, key: string) {
  const value = text(form, key, 10);
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError(`Enter a valid ${key.replaceAll("_", " ")}.`);
  return value;
}
export function contractInput(form: FormData) {
  const start_date = date(form, "start_date"), end_date = date(form, "end_date");
  if (start_date && end_date && end_date < start_date) throw new ValidationError("Programme end must follow programme start.");
  return {
    reference: text(form, "reference", 80, true), name: text(form, "name", 160, true),
    client: text(form, "client", 160, true), principal_contractor: text(form, "principal_contractor", 160),
    address: text(form, "address", 1000, true), site_contact: text(form, "site_contact", 500),
    scope: text(form, "scope", 8000, true), exclusions: text(form, "exclusions", 4000),
    tile_specification: text(form, "tile_specification", 4000), substrate_details: text(form, "substrate_details", 4000),
    installation_system: text(form, "installation_system", 4000), movement_joints: text(form, "movement_joints", 4000),
    access_restrictions: text(form, "access_restrictions", 2000), working_hours: text(form, "working_hours", 500),
    insurance_requirements: text(form, "insurance_requirements", 2000), defects_liability: text(form, "defects_liability", 2000),
    start_date, end_date,
  };
}
export function commercialInput(form: FormData, allowTargetMargin = true) {
  return {
    contract_value: decimal(form, "contract_value"), labour_budget: decimal(form, "labour_budget"),
    materials_budget: decimal(form, "materials_budget"), preliminaries_budget: decimal(form, "preliminaries_budget"),
    contingency: decimal(form, "contingency"), ...(allowTargetMargin ? { target_margin: decimal(form, "target_margin", 99) } : {}),
    retention_percent: decimal(form, "retention_percent", 100), payment_terms: text(form, "payment_terms", 4000),
  };
}
export function memberRole(form: FormData) {
  const role = text(form, "role", 30, true);
  if (!roles.some(r => r === role)) throw new ValidationError("Select a recognised staff role.");
  return role;
}
export function areaInput(form: FormData) {
  return { name: text(form, "name", 160, true), location: text(form, "location", 500, true), substrate_notes: text(form, "substrate_notes", 4000), system_notes: text(form, "system_notes", 4000) };
}
export function packageInput(form: FormData) {
  const unit = text(form, "unit", 10, true);
  if (!["m2", "lm", "item"].includes(unit)) throw new ValidationError("Select m², linear metres or items.");
  return { name: text(form, "name", 160, true), quantity: decimal(form, "quantity", 1_000_000), unit };
}

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export function fileType(bytes: Uint8Array, claimedType: string) {
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) throw new ValidationError("Choose a file between 1 byte and 4 MB.");
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b);
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (pdf && claimedType === "application/pdf") return { mime: claimedType, extension: "pdf" };
  if (png && claimedType === "image/png") return { mime: claimedType, extension: "png" };
  if (jpg && claimedType === "image/jpeg") return { mime: claimedType, extension: "jpg" };
  throw new ValidationError("Only PDF, JPEG and PNG files with a matching file signature are accepted.");
}

// Supervisor V2 office forms. Each returns exactly the payload its database
// function accepts; the database validates again and is the authority.
export const engagements = ["direct_employee", "subcontractor", "agency"] as const;
export const teamKinds = ["subcontract_gang", "individual_subcontractor", "direct_team", "mixed", "temporary"] as const;
function choice<T extends string>(form: FormData, key: string, choices: readonly T[], message: string): T {
  const value = text(form, key, 40, true);
  if (!choices.some(item => item === value)) throw new ValidationError(message);
  return value as T;
}
function optionalUuid(form: FormData, key: string) {
  return text(form, key, 36) ? uuid(form, key) : null;
}
export function requiredDate(form: FormData, key: string, label: string) {
  const value = date(form, key);
  if (!value) throw new ValidationError(`Enter the ${label}.`);
  return value;
}
export function operativeInput(form: FormData, canLinkLogin: boolean) {
  const userId = canLinkLogin ? optionalUuid(form, "user_id") : null;
  return {
    display_name: text(form, "display_name", 160, true),
    engagement: choice(form, "engagement", engagements, "Choose how this person is engaged."),
    company_name: text(form, "company_name", 160),
    ...(userId ? { user_id: userId } : {}),
  };
}
export function operativeUpdateInput(form: FormData) {
  const status = text(form, "status", 20, true);
  if (status !== "active" && status !== "inactive") throw new ValidationError("Choose active or inactive.");
  return { ...operativeInput(form, false), user_id: optionalUuid(form, "user_id"), status };
}
export function teamInput(form: FormData) {
  return {
    name: text(form, "name", 160, true),
    kind: choice(form, "kind", teamKinds, "Choose what kind of team this is."),
    contractor_name: text(form, "contractor_name", 160),
  };
}
export function membershipInput(form: FormData) {
  return {
    team_id: uuid(form, "team_id"), operative_id: uuid(form, "operative_id"),
    valid_from: requiredDate(form, "valid_from", "start date"), is_lead: form.get("is_lead") === "on",
  };
}
export function planInput(form: FormData) {
  const planned_start = requiredDate(form, "planned_start", "first planned day");
  const planned_end = date(form, "planned_end") || planned_start;
  if (planned_end < planned_start) throw new ValidationError("The last planned day must be on or after the first.");
  const stage = text(form, "stage", 30, true);
  if (!installationStages.some(item => item === stage)) throw new ValidationError("Choose the installation stage.");
  const operativeIds = form.getAll("operative_ids");
  if (operativeIds.some(value => typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) {
    throw new ValidationError("A selected operative is invalid. Refresh and try again.");
  }
  const packageId = optionalUuid(form, "work_package_id"), supersedesId = optionalUuid(form, "supersedes_id");
  if (!text(form, "work_area_id", 36)) throw new ValidationError("Choose where the work is planned.");
  return {
    contract_id: uuid(form, "contract_id"), work_area_id: uuid(form, "work_area_id"), team_id: uuid(form, "team_id"),
    stage, planned_start, planned_end, instructions: text(form, "instructions", 4000),
    operative_ids: [...new Set(operativeIds as string[])],
    ...(packageId ? { work_package_id: packageId } : {}), ...(supersedesId ? { supersedes_id: supersedesId } : {}),
  };
}
export function locationBuilderInput(form: FormData): LocationBuilderInput {
  const mode = text(form, "mode", 10, true);
  if (mode !== "series" && mode !== "names") throw new ValidationError("Choose a numbered series or a list of names.");
  return { mode, label: text(form, "label", 60), from: text(form, "from", 6), to: text(form, "to", 6), names: text(form, "names", 40000), rooms: text(form, "rooms", 4000) };
}
export function locationUpdateInput(form: FormData) {
  return {
    name: text(form, "name", 160, true), location_type: text(form, "location_type", 60), code: text(form, "code", 40),
    description: text(form, "description", 500), parent_id: optionalUuid(form, "parent_id"),
  };
}
