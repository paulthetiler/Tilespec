import { test } from "node:test";
import assert from "node:assert/strict";
import { applicableChecks, currentTemplates, inspectionInput, templateInput, type InspectionTemplate } from "../lib/operations/inspections";
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
