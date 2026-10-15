import { installationStages } from "./types";
import { isCalendarDate } from "./planning";
import { finishDayInput, text, uuid, ValidationError } from "./validation";

export const isRecordId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const optionalId = (form: FormData, key: string) => text(form, key) ? uuid(form, key) : null;

export function officeItemInput(form: FormData) {
  const kind = text(form, "kind", 20, true);
  if (kind !== "instruction" && kind !== "qa_request") throw new ValidationError("Choose a message or an inspection request.");
  const recipient_id = optionalId(form, "recipient_id");
  const due_on = text(form, "due_on", 10) || null;
  if (due_on && !isCalendarDate(due_on)) throw new ValidationError("Choose a valid due date.");
  const stage = kind === "qa_request" ? text(form, "stage", 30, true) : null;
  if (stage && !installationStages.some(value => value === stage)) throw new ValidationError("Choose the work to inspect.");
  if (kind === "qa_request" && !recipient_id) throw new ValidationError("Choose the supervisor who should inspect this work.");
  if (kind === "qa_request" && !text(form, "work_area_id")) throw new ValidationError("Choose the location to inspect.");
  return {
    contract_id: uuid(form, "contract_id"), kind, title: text(form, "title", 160, true), body: text(form, "body", 2000, true),
    recipient_id, due_on, acknowledgement_required: kind === "instruction" && form.get("acknowledgement_required") === "on",
    work_area_id: kind === "qa_request" ? uuid(form, "work_area_id") : null,
    stage, work_package_id: kind === "qa_request" ? optionalId(form, "work_package_id") : null,
  };
}

export function handoverInput(form: FormData) {
  // Use the same London day/time validation as the existing workforce screen.
  const finish = finishDayInput(form, true);
  const fields = {
    work_completed: text(form, "work_completed", 2000), outstanding_problems: text(form, "outstanding_problems", 2000),
    materials_needed: text(form, "materials_needed", 2000), areas_awaiting_attention: text(form, "areas_awaiting_attention", 2000),
    office_notes: text(form, "office_notes", 2000),
  };
  if (!Object.values(fields).some(Boolean)) throw new ValidationError("Add a short handover for the office.");
  return { contract_id: finish.contract_id, finished_at: finish.at, finish_workforce: form.get("finish_workforce") === "on", ...fields };
}
