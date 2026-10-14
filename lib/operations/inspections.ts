import { text, uuid, ValidationError } from "./validation";
import { installationStages } from "./types";

export type InspectionCheck = { label: string; wet_only: boolean };
export type InspectionTemplate = {
  id: string; work_area_id: string; stage: string; title: string; specification_reference: string;
  specification_revision: string; wet_area: boolean; checklist: InspectionCheck[]; supersedes_id: string | null;
};
export type LocationInspection = {
  id: string; work_area_id: string; template_id: string; location_path: string[];
  answers: { item: string; status: string; note: string }[]; issues_count: number; actor_id: string; actor_name: string; created_at: string;
};
export function applicableChecks(template: Pick<InspectionTemplate, "checklist" | "wet_area">) {
  return template.checklist.filter(check => !check.wet_only || template.wet_area);
}
export function currentTemplates(templates: InspectionTemplate[], pathIds: string[]) {
  const revised = new Set(templates.map(template => template.supersedes_id));
  return templates.filter(template => pathIds.includes(template.work_area_id) && !revised.has(template.id));
}
// A line prefixed [wet] is included only when the specification requires wet-area work.
export function templateInput(form: FormData) {
  const stage = text(form, "stage", 30, true);
  if (!(installationStages as readonly string[]).includes(stage)) throw new ValidationError("Choose an installation stage.");
  const checklist = text(form, "checklist", 26000, true).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => ({
    label: line.replace(/^\[wet\]\s*/i, ""), wet_only: /^\[wet\]/i.test(line),
  }));
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
    const status = text(form, `status_${i}`, 10, true), note = text(form, `note_${i}`, 2000);
    if (!["pass", "issue", "na"].includes(status) || (status !== "pass" && !note)) throw new ValidationError("Answer every check; Issue and N/A need a reason.");
    return { status, note };
  });
  const allocation_ids = form.getAll("allocation_ids").map(value => {
    const single = new FormData(); single.set("id", value); return uuid(single, "id");
  });
  if (allocation_ids.length > 100) throw new ValidationError("Link at most 100 work periods.");
  return { contract_id: uuid(form, "contract_id"), work_area_id: uuid(form, "work_area_id"), template_id: uuid(form, "template_id"), answers, allocation_ids };
}
