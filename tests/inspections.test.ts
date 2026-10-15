import { test } from "node:test";
import assert from "node:assert/strict";
import { applicableChecks, everydayWorkmanshipChecks, hollowInvestigationNote, isHollowSoundCheck, inspectionHasBlockingFailure, currentTemplates, inspectionInput, templateInput, requirementInput, type InspectionTemplate } from "../lib/operations/inspections";
const id = "a1000000-0000-4000-8000-000000000001";
function form(values: Record<string, string>) { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
test("wet checks require explicit specification applicability", () => {
  const checklist = [{ label: "Substrate", wet_only: false }, { label: "Waterproofing", wet_only: true }];
  assert.equal(applicableChecks({ checklist, wet_area: false }).length, 1);
  assert.equal(applicableChecks({ checklist, wet_area: true }).length, 2);
});
test("only current revisions on the selected location ancestry are offered", () => {
  const templates = [{ id: "old", work_area_id: "parent", supersedes_id: null }, { id: "new", work_area_id: "parent", supersedes_id: "old" },
    { id: "other", work_area_id: "sibling", supersedes_id: null }] as InspectionTemplate[];
  assert.deepEqual(currentTemplates(templates, ["parent", "room"]).map(t => t.id), ["new"]);
});
test("template parser preserves references and conditional checks", () => {
  const values = { contract_id: id, work_area_id: id, stage: "preparation", title: "Substrate", specification_reference: "SPEC-1",
    specification_revision: "B", checklist: "Substrate stable\n[wet] Tanking details" };
  const input = templateInput(form(values));
  assert.equal(input.specification_revision, "B"); assert.equal(input.wet_area, false);
  assert.deepEqual(input.checklist[1], { label: "Tanking details", wet_only: true });
  assert.throws(() => templateInput(form({ ...values, checklist: "[wet] Only wet work" })));
  assert.throws(() => templateInput(form({ ...values, stage: "invented" })));
  assert.throws(() => templateInput(form({ ...values, checklist: "x\n".repeat(51) })));
});
test("inspection parser requires reasons and actual allocation identifiers", () => {
  const values = { contract_id: id, work_area_id: id, template_id: id, check_count: "1", status_0: "issue", note_0: "Uneven substrate" };
  assert.equal(inspectionInput(form(values)).answers[0].note, "Uneven substrate");
  assert.throws(() => inspectionInput(form({ ...values, note_0: " " })));
  assert.throws(() => inspectionInput(form({ ...values, status_0: "approved" })));
  assert.throws(() => inspectionInput(form({ ...values, check_count: "0" })));
  assert.throws(() => inspectionInput(form({ ...values, allocation_ids: "not-an-allocation" })));
});
test("new checklist revisions preserve explicit mandatory hold points and evidence without changing legacy checks", () => {
  const values = { contract_id: id, work_area_id: id, stage: "installation", title: "Approved system checks", specification_reference: "SPEC-1",
    specification_revision: "C", wet_area: "on", checklist: "[hold] [evidence] Waterproofing test meets approved system\n[wet] [mandatory] Specified movement joints\nGeneral observation" };
  const result = templateInput(form(values));
  assert.deepEqual(result.checklist, [
    { label: "Waterproofing test meets approved system", wet_only: false, hold_point: true, evidence_required: true },
    { label: "Specified movement joints", wet_only: true, mandatory: true }, { label: "General observation", wet_only: false },
  ]);
  assert.throws(() => templateInput(form({ ...values, checklist: "[mandatory] [evidence]" })));
});
test("inspection evidence and package identifiers are explicit and bounded", () => {
  const values = { contract_id: id, work_area_id: id, work_package_id: id, template_id: id, check_count: "1", status_0: "pass", note_0: "" };
  const input = form(values); input.append("document_ids_0", id);
  assert.deepEqual(inspectionInput(input).answers[0], { status: "pass", note: "", document_ids: [id] });
  assert.equal(inspectionInput(input).work_package_id, id);
  input.append("document_ids_0", id);
  assert.throws(() => inspectionInput(input), /distinct evidence/);
  assert.throws(() => inspectionInput(form({ ...values, photo_ids_0: "unknown-photo" })));
});
test("office applicability requires exact approved document revisions and an explicit approval", () => {
  const values = { contract_id: id, work_area_id: id, stage: "installation", applicability: "required", template_id: id,
    basis: "Approved specification and manufacturer requirements", approved_document_ids: id, approve_specification: "on" };
  const result = requirementInput(form(values));
  assert.equal(result.template_id, id); assert.deepEqual(result.approved_document_ids, [id]);
  assert.throws(() => requirementInput(form({ ...values, approve_specification: "" })), /Confirm approval/);
  assert.throws(() => requirementInput(form({ ...values, approved_document_ids: "" })), /Confirm approval/);
  assert.throws(() => requirementInput(form({ ...values, applicability: "unknown" })));
  assert.equal(requirementInput(form({ ...values, applicability: "not_required", template_id: "" })).template_id, null);
});

test("mandatory N/A stays blocking even when the preserved legacy issue count is zero", () => {
  assert.equal(inspectionHasBlockingFailure({issues_count:0,answers:[{item:"Hold point",status:"na",note:"Unable to inspect",hold_point:true}]}),true);
  assert.equal(inspectionHasBlockingFailure({issues_count:0,answers:[{item:"Optional check",status:"na",note:"Does not apply"}]}),false);
  assert.equal(inspectionHasBlockingFailure({issues_count:0,answers:[{item:"Mandatory check",status:"pass",note:"",mandatory:true}]}),false);
});

test("everyday starter is an office-published versioned checklist with the nine practical checks", () => {
  assert.equal(everydayWorkmanshipChecks.length, 9);
  const input = templateInput(form({ contract_id: id, work_area_id: id, stage: "installation", title: "Floor workmanship", specification_reference: "Actual project reference", specification_revision: "D", checklist: everydayWorkmanshipChecks.join("\n") }));
  assert.equal(input.checklist.length, 9);
  assert.equal(input.supersedes_id, null);
  assert.equal(isHollowSoundCheck(input.checklist[4].label), true);
  assert.equal(isHollowSoundCheck("HOLLOW sounding floor tiles"), true);
  assert.equal(isHollowSoundCheck("Lippage"), false);
});

test("a reported hollow tile is an investigation issue even if a client sends Pass", () => {
  const values = { contract_id: id, work_area_id: id, template_id: id, check_count: "1", status_0: "pass", note_0: "", hollow_found_0: "true" };
  assert.deepEqual(inspectionInput(form(values)).answers[0], { status: "issue", note: hollowInvestigationNote, hollow_found: true });
  assert.equal(inspectionInput(form({ ...values, hollow_found_0: "false" })).answers[0].status, "pass");
  assert.throws(() => inspectionInput(form({ ...values, hollow_found_0: "maybe" })), /Choose whether/);
});
