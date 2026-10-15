import { text, uuid, ValidationError } from "./validation";
import { installationStages } from "./types";

export type InspectionCheck = { label: string; wet_only: boolean; mandatory?: boolean; hold_point?: boolean; evidence_required?: boolean };
export type InspectionTemplate = {
  id: string; work_area_id: string; stage: string; title: string; specification_reference: string;
  specification_revision: string; wet_area: boolean; checklist: InspectionCheck[]; supersedes_id: string | null;
};
export type LocationInspection = {
  id: string; work_area_id: string; template_id: string; location_path: string[];
  work_package_id?: string | null;
  answers: { item: string; status: string; note: string; mandatory?: boolean; hold_point?: boolean; evidence_required?: boolean; document_ids?: string[]; photo_ids?: string[] }[];
  issues_count: number; actor_id: string; actor_name: string; created_at: string;
};
export type InspectionRequirement = { id: string; work_area_id: string; work_package_id: string | null; stage: string; applicability: "required" | "not_required";
  template_id: string | null; approved_document_ids: string[]; basis: string; supersedes_id: string | null; created_at: string; created_by: string };
export type RequirementStatus = { configured: boolean; unknown: boolean; passed: boolean; failed: boolean;
  requirements: (InspectionRequirement & { status: string; inspection_id: string | null; inspection_at: string | null; title: string | null })[];
  blockers: (string | { requirement_id: string; template_id: string | null; status: string })[] };
export function applicableChecks(template: Pick<InspectionTemplate, "checklist" | "wet_area">) {
  return template.checklist.filter(check => !check.wet_only || template.wet_area);
}
// An office starter, published through the existing versioned-template action.
// It never replaces an approved checklist or changes saved observations.
export const everydayWorkmanshipChecks = [
  "Setting out and alignment", "Lippage", "Quality of cuts", "Tile bedding and adhesion",
  "Hollow-sounding floor tiles", "Grout joints and adhesive contamination", "Movement joints",
  "Trims and edges", "General workmanship",
] as const;
export const hollowInvestigationNote = "Hollow-sounding tile found. Investigate against the installation system and project requirements.";
export function isHollowSoundCheck(label: string) {
  return /\bhollow\b|\bdrummy\b/i.test(label);
}
export function inspectionHasBlockingFailure(record: Pick<LocationInspection, "issues_count" | "answers">) {
  return record.issues_count > 0 || record.answers.some(answer => (answer.mandatory || answer.hold_point) && answer.status !== "pass");
}
export function currentTemplates(templates: InspectionTemplate[], pathIds: string[]) {
  const revised = new Set(templates.map(template => template.supersedes_id));
  return templates.filter(template => pathIds.includes(template.work_area_id) && !revised.has(template.id));
}
// Flags describe the office's approved requirements; they introduce no technical thresholds.
export function templateInput(form: FormData) {
  const stage = text(form, "stage", 30, true);
  if (!(installationStages as readonly string[]).includes(stage)) throw new ValidationError("Choose an installation stage.");
  const checklist = text(form, "checklist", 26000, true).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const flags = new Set<string>();
    let label = line;
    while (/^\[(wet|mandatory|hold|evidence)\]\s*/i.test(label)) {
      const match = label.match(/^\[(wet|mandatory|hold|evidence)\]\s*/i)!;
      flags.add(match[1].toLowerCase()); label = label.slice(match[0].length);
    }
    return { label, wet_only: flags.has("wet"), ...(flags.has("mandatory") ? { mandatory: true } : {}),
      ...(flags.has("hold") ? { hold_point: true } : {}), ...(flags.has("evidence") ? { evidence_required: true } : {}) };
  });
  const wet_area = form.get("wet_area") === "on";
  if (checklist.length > 50 || checklist.some(check => !check.label || check.label.length > 500)
    || !applicableChecks({ checklist, wet_area }).length) throw new ValidationError("Supply 1–50 checks, each up to 500 characters, including an applicable check.");
  return { contract_id: uuid(form, "contract_id"), work_area_id: uuid(form, "work_area_id"), stage,
    title: text(form, "title", 160, true), specification_reference: text(form, "specification_reference", 160, true),
    specification_revision: text(form, "specification_revision", 80, true), wet_area, checklist,
    supersedes_id: form.get("supersedes_id") ? uuid(form, "supersedes_id") : null };
}
export function inspectionInput(form: FormData) {
  const countText = text(form, "check_count", 2, true);
  const count = Number(countText);
  if (!/^\d+$/.test(countText) || count < 1 || count > 50) throw new ValidationError("Refresh the inspection checklist.");
  const answers = Array.from({ length: count }, (_, i) => {
    let status = text(form, `status_${i}`, 10, true), note = text(form, `note_${i}`, 2000);
    const hollow = form.get(`hollow_found_${i}`);
    if (hollow !== null && hollow !== "true" && hollow !== "false") throw new ValidationError("Choose whether a hollow sound was found.");
    if (hollow === "true") { status = "issue"; note = note || hollowInvestigationNote; }
    if (!["pass", "issue", "na"].includes(status) || (status !== "pass" && !note)) throw new ValidationError("Answer every check; Issue and N/A need a reason.");
    const document_ids = uuidList(form, `document_ids_${i}`, 12), photo_ids = uuidList(form, `photo_ids_${i}`, 12);
    return { status, note, ...(hollow !== null ? { hollow_found: hollow === "true" } : {}), ...(document_ids.length ? { document_ids } : {}), ...(photo_ids.length ? { photo_ids } : {}) };
  });
  const allocation_ids = form.getAll("allocation_ids").map(value => {
    const single = new FormData(); single.set("id", value); return uuid(single, "id");
  });
  if (allocation_ids.length > 100) throw new ValidationError("Link at most 100 work periods.");
  return { contract_id: uuid(form, "contract_id"), work_area_id: uuid(form, "work_area_id"), template_id: uuid(form, "template_id"), answers, allocation_ids,
    ...(form.get("work_package_id") ? { work_package_id: uuid(form, "work_package_id") } : {}) };
}
function uuidList(form: FormData, key: string, max: number) {
  const values = form.getAll(key).filter(value => value !== "").map(value => { const single = new FormData(); single.set("id", value); return uuid(single, "id"); });
  if (values.length > max || new Set(values).size !== values.length) throw new ValidationError(`Choose at most ${max} distinct evidence records.`);
  return values;
}
export function requirementInput(form: FormData) {
  const stage = text(form, "stage", 30, true), applicability = text(form, "applicability", 20, true);
  if (!(installationStages as readonly string[]).includes(stage) || !["required", "not_required"].includes(applicability)) throw new ValidationError("Choose the activity and inspection applicability.");
  const approved_document_ids = uuidList(form, "approved_document_ids", 12), basis = text(form, "basis", 2000, true);
  if (!approved_document_ids.length || basis.length < 5 || form.get("approve_specification") !== "on") throw new ValidationError("Confirm approval of the selected specification or manufacturer revisions and record the basis.");
  return { contract_id: uuid(form, "contract_id"), work_area_id: uuid(form, "work_area_id"), stage, applicability,
    work_package_id: form.get("work_package_id") ? uuid(form, "work_package_id") : null,
    template_id: applicability === "required" ? uuid(form, "template_id") : null, approved_document_ids, basis,
    supersedes_id: form.get("supersedes_id") ? uuid(form, "supersedes_id") : null };
}
