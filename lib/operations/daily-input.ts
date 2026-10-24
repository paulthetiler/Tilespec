import { aboutTypes, reviewOutcomes } from "./daily";
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
  const replaces_id = optionalId(form, "replaces_id");
  if (replaces_id && kind !== "instruction") throw new ValidationError("Only an instruction can be changed.");
  const urgent = kind === "instruction" && form.get("urgent") === "on";
  return {
    contract_id: uuid(form, "contract_id"), kind, title: text(form, "title", 160, true), body: text(form, "body", 2000, true),
    recipient_id, due_on, acknowledgement_required: kind === "instruction" && form.get("acknowledgement_required") === "on",
    work_area_id: kind === "qa_request" ? uuid(form, "work_area_id") : null,
    stage, work_package_id: kind === "qa_request" ? optionalId(form, "work_package_id") : null,
    // Sent only when used, so a database without instruction changes receives exactly the fields it knows.
    ...(replaces_id ? { replaces_id } : {}), ...(urgent ? { urgent } : {}),
  };
}

export function withdrawalInput(form: FormData) {
  return { item_id: uuid(form, "item_id"), contract_id: uuid(form, "contract_id"), reason: text(form, "reason", 500, true) };
}

export function reviewInput(form: FormData) {
  const subject = text(form, "subject", 20, true);
  if (subject !== "qa_result" && subject !== "handover") throw new ValidationError("Choose what you are reviewing.");
  const outcome = text(form, "outcome", 20, true);
  if (!reviewOutcomes.some(value => value === outcome)) throw new ValidationError("Choose what you did about it.");
  // The optional linked record is offered as "snag_raised:<id>", "stop_raised:<id>" or "instruction_sent:<id>".
  const linked = text(form, "follow_up", 80);
  const [linkedOutcome, follow_up_id] = linked ? linked.split(":") : [null, null];
  if (linked && (!follow_up_id || !isRecordId(follow_up_id) || !reviewOutcomes.some(value => value === linkedOutcome))) throw new ValidationError("Choose the linked record again.");
  if (linked && linkedOutcome !== outcome) throw new ValidationError("The linked record does not match what you did. Change one of them, or leave the link blank.");
  return {
    contract_id: uuid(form, "contract_id"),
    data: { subject, subject_id: uuid(form, "subject_id"), outcome, note: text(form, "note", 1000), ...(follow_up_id ? { follow_up_id } : {}) },
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

/** A new conversation names what it is about; a reply names its conversation. */
export function messageInput(form: FormData) {
  const thread = optionalId(form, "thread_id");
  const body = text(form, "body", 2000, true);
  const needs_answer = form.get("needs_answer") === "on";
  const contract_id = uuid(form, "contract_id");
  if (thread) return { contract_id, thread_id: thread, body, needs_answer };
  const about_type = text(form, "about_type", 20) || "job";
  if (!aboutTypes.some(value => value === about_type)) throw new ValidationError("Choose what the message is about.");
  return { contract_id, about_type, ...(about_type === "job" ? {} : { about_id: uuid(form, "about_id") }), body, needs_answer };
}

/** "about=snag:<id>" from an "Ask the office about this" link, or nothing. */
export function aboutParam(value: unknown): { about_type: string; about_id: string } | null {
  if (typeof value !== "string") return null;
  const [about_type, about_id] = value.split(":");
  return aboutTypes.some(kind => kind === about_type) && about_type !== "job" && isRecordId(about_id) ? { about_type, about_id } : null;
}
