import test from "node:test";
import assert from "node:assert/strict";
import Data from "../docs/redesign/prototype/data.js";
import { compute, type InspectionRow, type NextActionSnapshot } from "../lib/operations/next-actions";
import { toInspection, toRequirement } from "../lib/operations/next-actions/snapshot-map";

const make = () => Data.make("start") as unknown as NextActionSnapshot;
const viewer = (s: NextActionSnapshot, id = "u-dave") => s.members.find(m => m.user_id === id)!;
const inspectionActions = (s: NextActionSnapshot) => compute(s, viewer(s)).filter(a => a.process === "inspection" && a.id.endsWith(":pa1"));
const observation = (overrides: Partial<InspectionRow> = {}): InspectionRow => ({
  id: "i1", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", template_id: "tpl1", work_package_id: null,
  blocking_failure: false, created_at: "2026-10-15T11:00:00Z", ...overrides,
});

test("a saved inspection of one room cannot clear the planned whole-flat inspection", () => {
  const s = make();
  s.planned_allocations[0].work_area_id = "l-f31";
  s.location_inspections.push(observation());
  assert.equal(inspectionActions(s)[0]?.rule, "G07");
  s.location_inspections.push(observation({ id: "i2", work_area_id: "l-f31" }));
  assert.deepEqual(inspectionActions(s), []);
});

test("a current mandatory requirement needs its own template and a saved observation after approval", () => {
  const s = make();
  s.location_inspection_requirements[0].created_at = "2026-10-15T10:00:00Z";
  s.location_inspections.push(observation({ created_at: "2026-10-15T09:59:59Z" }));
  assert.equal(inspectionActions(s)[0]?.rule, "G07", "an earlier pass cannot clear a newer requirement");
  s.location_inspections.push(observation({ id: "unrelated", template_id: "other-template" }));
  assert.equal(inspectionActions(s)[0]?.rule, "G07", "a pass against another checklist cannot clear it");
  s.location_inspections.push(observation({ id: "current", created_at: "2026-10-15T10:00:00Z" }));
  assert.deepEqual(inspectionActions(s), []);
  s.location_inspections.push(observation({ id: "later-failure", created_at: "2026-10-15T12:00:00Z", blocking_failure: true }));
  assert.equal(inspectionActions(s)[0]?.rule, "G06");
});

test("every applicable mandatory checklist needs a pass, independently of another checklist's newer result", () => {
  const s = make();
  s.location_inspection_requirements.push({ ...s.location_inspection_requirements[0], id: "req2", template_id: "tpl2" });
  s.location_inspections.push(observation());
  assert.equal(inspectionActions(s)[0]?.rule, "G07", "one of two requirements is still uninspected");
  s.location_inspections.push(observation({ id: "second-failed", template_id: "tpl2", blocking_failure: true }));
  assert.equal(inspectionActions(s)[0]?.rule, "G06");
  s.location_inspections.push(observation({ id: "first-newer", created_at: "2026-10-15T12:00:00Z" }));
  assert.equal(inspectionActions(s)[0]?.rule, "G06", "another checklist's later pass does not erase a failed requirement");
  s.location_inspections.push(observation({ id: "second-fixed", template_id: "tpl2", created_at: "2026-10-15T13:00:00Z" }));
  assert.deepEqual(inspectionActions(s), []);
});

test("approval boundaries and later saved observations preserve PostgreSQL microsecond ordering", () => {
  const s = make();
  s.location_inspection_requirements[0].created_at = "2026-10-15T10:00:00.123456+00:00";
  s.location_inspections.push(observation({ id: "z-earlier", created_at: "2026-10-15T10:00:00.123455Z" }));
  assert.equal(inspectionActions(s)[0]?.rule, "G07", "a pass one microsecond before approval cannot count");
  s.location_inspections.push(observation({ id: "z-pass", created_at: "2026-10-15T10:00:00.123457Z" }));
  assert.deepEqual(inspectionActions(s), []);
  s.location_inspections.push(observation({ id: "a-later-failure", created_at: "2026-10-15T10:00:00.123458Z", blocking_failure: true }));
  assert.equal(inspectionActions(s)[0]?.rule, "G06", "a later failed observation wins regardless of UUID ordering");
});

test("package-only applicability and observations do not clear unrelated or whole-location work", () => {
  const s = make();
  s.location_inspection_requirements[0].work_package_id = "p2";
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "another package's applicability is unknown for this package");
  s.location_inspection_requirements[0].work_package_id = null;
  s.planned_allocations[0].work_package_id = null;
  s.location_inspections.push(observation({ work_package_id: "p1" }));
  assert.equal(inspectionActions(s)[0]?.rule, "G07", "package-only observation cannot clear whole-location work");
  s.planned_allocations[0].work_package_id = "p1";
  assert.deepEqual(inspectionActions(s), [], "the same observation can satisfy its exact package");
  s.location_inspection_requirements[0].work_package_id = "p1";
  s.planned_allocations[0].work_package_id = null;
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "assessing one package does not assess the whole location");
});

test("replaced or unconfigured mandatory checklists require an office applicability decision", () => {
  const s = make();
  s.location_inspections.push(observation());
  s.location_inspection_requirements[0].template_current = false;
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "an old checklist's pass cannot clear its replacement");
  s.location_inspection_requirements[0].template_current = true;
  s.location_inspection_templates.push({ id: "new-mandatory", contract_id: "c1", work_area_id: "l-b", stage: "installation", mandatory: true });
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "a mandatory template needs its own current approved applicability");
});

test("missing template or approval metadata cannot be treated as a satisfied mandatory requirement", () => {
  const s = make();
  s.location_inspections.push(observation());
  s.location_inspection_requirements[0].created_at = undefined;
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "missing approval date stays unknown even when an inspection passed");
  s.location_inspection_requirements[0].created_at = "not-a-date";
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "an invalid approval date cannot clear a restriction");
  s.location_inspection_requirements[0].created_at = "2026-10-12T07:00:00Z";
  s.location_inspection_requirements[0].template_id = null;
  assert.equal(inspectionActions(s)[0]?.rule, "G08", "a missing approved checklist stays unknown");
});

function addSecondSupervisor(s: NextActionSnapshot) {
  s.contract_assignments.push({ contract_id: "c1", user_id: "u-ellie" });
  s.supervisor_office_items[0].recipient_id = null;
}

test("a broadcast instruction remains outstanding for each supervisor until their own acknowledgement", () => {
  const s = make();
  addSecondSupervisor(s);
  s.supervisor_office_acknowledgements.push({ item_id: "m1", user_id: "u-dave" });
  assert.ok(!compute(s, viewer(s)).some(a => a.id === "ack:m1"));
  assert.equal(compute(s, viewer(s, "u-ellie")).find(a => a.id === "ack:m1")?.state, "ready");
  assert.ok(compute(s, viewer(s, "u-sam")).some(a => a.id === "ack:m1"), "office still sees an outstanding recipient");
  s.supervisor_office_acknowledgements.push({ item_id: "m1", user_id: "u-ellie" });
  assert.ok(!compute(s, viewer(s, "u-sam")).some(a => a.id === "ack:m1"));
});

test("another supervisor's handover cannot complete the current supervisor's finish-today action", () => {
  const s = make();
  addSecondSupervisor(s);
  s.now = "18:00";
  s.site_handovers.push({ id: "h1", contract_id: "c1", actor_id: "u-dave", work_date: s.today, created_at: `${s.today}T16:00:00Z` });
  const handover = (id: string) => compute(s, viewer(s, id)).find(a => a.id === `handover:c1:${s.today}`);
  assert.equal(handover("u-dave"), undefined);
  assert.equal(handover("u-ellie")?.state, "ready");
  assert.equal(handover("u-sam")?.state, "waiting");
  s.site_handovers.push({ id: "h2", contract_id: "c1", actor_id: "u-ellie", work_date: s.today, created_at: `${s.today}T17:00:00Z` });
  assert.equal(handover("u-sam"), undefined);
});

test("unplanned open workforce still surfaces its site's expired-insurance warning to its supervisor", () => {
  const s = make();
  s.planned_allocations = [];
  s.actual_allocations.push({ id: "actual", contract_id: "c1", planned_allocation_id: null, work_area_id: "l-l2-corr", team_id: "t2",
    work_date: s.today, started_at: `${s.today}T07:00:00Z`, ended_at: null, voided_at: null });
  const warning = compute(s, viewer(s)).find(a => a.id === "insurance:co2");
  assert.equal(warning?.state, "waiting");
  assert.equal(warning?.job.id, "c1");
  assert.ok(!compute(s, viewer(s, "u-ellie")).some(a => a.id === "insurance:co2"), "another site's supervisor cannot see it");
});

test("saved requirement and observation mapping preserves approval, template and package scope", () => {
  const requirement = toRequirement({ id: "r", contract_id: "c", work_area_id: "a", stage: "installation", applicability: "required",
    template_id: "t", work_package_id: "p", created_at: "2026-10-15T10:00:00Z" });
  assert.equal(requirement.template_id, "t");
  assert.equal(requirement.work_package_id, "p");
  assert.equal(requirement.created_at, "2026-10-15T10:00:00Z");
  const saved = toInspection({ id: "i", contract_id: "c", work_area_id: "a", template_id: "t", work_package_id: "p", issues_count: 0,
    answers: [{ item: "mandatory", status: "pass", note: "", mandatory: true }], created_at: "2026-10-15T11:00:00Z" }, new Map([["t", "installation"]]));
  assert.equal(saved?.template_id, "t");
  assert.equal(saved?.work_package_id, "p");
});
