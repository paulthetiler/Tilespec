import test from "node:test";
import assert from "node:assert/strict";
import { confirmsWorkforceAbsence, confirmsWorkforceGroups, savedAllocationIds, type SavedAllocation } from "../lib/operations/workforce-save-confirmation";

const id = (number: number) => `b2000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const expected = { contract: id(1), actor: id(2), plan: id(3), previous: null, day: "2026-10-15", groups: [
  { operative_ids: [id(4), id(5)], work_area_id: id(6), stage: "installation", lead_operative_id: id(4), team_id: id(16), work_package_id: id(17), started_at: "2026-10-15T07:00:00Z" },
  { operative_ids: [id(7)], work_area_id: id(8), stage: "grouting", team_id: id(16), work_package_id: id(17), started_at: "2026-10-15T07:00:00Z" },
] };
const base: SavedAllocation = { id: id(10), contract_id: id(1), confirmed_by: id(2), planned_allocation_id: id(3), previous_allocation_id: null, work_date: expected.day, work_area_id: id(6), stage: "installation", lead_operative_id: id(4), recorded_at: "2026-10-15T07:00:00Z", started_at: "2026-10-15T07:00:00Z", team_id: id(16), work_package_id: id(17) };
const allocations = [base, { ...base, id: id(11), work_area_id: id(8), stage: "grouting", lead_operative_id: null }];
const attendance = [
  { actual_allocation_id: id(10), operative_id: id(4), added_by: id(2), recorded_at: base.recorded_at },
  { actual_allocation_id: id(10), operative_id: id(5), added_by: id(2), recorded_at: base.recorded_at },
  { actual_allocation_id: id(11), operative_id: id(7), added_by: id(2), recorded_at: base.recorded_at },
];

test("workforce results must identify exactly the saved periods, including split groups", () => {
  assert.deepEqual(savedAllocationIds([id(10), id(11)], 2), [id(10), id(11)]);
  for (const result of [null, id(10), [], [id(10)], [id(10), id(10)], [id(10), "HTTP 200"]]) assert.equal(savedAllocationIds(result, 2), null);
  assert.equal(confirmsWorkforceGroups([id(11), id(10)], [...allocations].reverse(), attendance, expected), true, "idempotent replay may reorder IDs");
});

test("HTTP success and an existing plan ID cannot replace actual persisted attendance", () => {
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], [], [], expected), false);
  assert.equal(confirmsWorkforceGroups([id(3), id(11)], allocations, attendance, expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [], expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, attendance.slice(1), expected), false);
});

test("another site, reporter, day, plan, location, stage or acting lead cannot confirm the submitted people", () => {
  for (const changed of [
    { contract_id: id(99) }, { confirmed_by: id(99) }, { planned_allocation_id: id(99) }, { previous_allocation_id: id(99) },
    { work_date: "2026-10-14" }, { work_area_id: id(99) }, { stage: "preparation" }, { lead_operative_id: id(99) }, { team_id: id(99) }, { work_package_id: null }, { started_at: "2026-10-15T06:00:00Z" },
  ]) assert.equal(confirmsWorkforceGroups([id(10), id(11)], [{ ...base, ...changed }, allocations[1]], attendance, expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [{ ...attendance[0], added_by: id(99) }, ...attendance.slice(1)], expected), false);
});

test("duplicated or different people do not count as the workforce that was confirmed", () => {
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [attendance[0], attendance[0], attendance[2]], expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [{ ...attendance[0], operative_id: id(99) }, ...attendance.slice(1)], expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], [base, base], attendance, expected), false);
});

test("an independent later arrival does not prevent an exact original confirmation retry", () => {
  const arrival = { actual_allocation_id: id(10), operative_id: id(15), added_by: id(99), recorded_at: "2026-10-15T08:30:00Z" };
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [...attendance, arrival], expected), true);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [...attendance, { ...arrival, recorded_at: base.recorded_at }], expected), false, "an extra original-transaction person is not the requested group");
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [...attendance, { ...arrival, recorded_at: "invalid" }], expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, [...attendance, { ...arrival, recorded_at: "2026-10-15T06:59:59Z" }], expected), false);
  assert.equal(confirmsWorkforceGroups([id(10), id(11)], allocations, attendance.map((row, index) => index ? row : { ...row, recorded_at: arrival.recorded_at }), expected), false, "a later arrival cannot replace missing initial attendance");
});

test("not-on-site confirmation requires the exact recorded absence on this site and day", () => {
  const saved = { id: id(12), contract_id: id(1), planned_allocation_id: id(3), recorded_by: id(2), work_date: expected.day, reason: "Materials not on site", operative_id: null, voided_at: null };
  const request = { contract: id(1), actor: id(2), plan: id(3), day: expected.day, reason: saved.reason };
  assert.equal(confirmsWorkforceAbsence(saved, id(12), request), true);
  assert.equal(confirmsWorkforceAbsence(null, id(12), request), false);
  assert.equal(confirmsWorkforceAbsence(saved, null, request), false);
  for (const changed of [{ id: id(99) }, { contract_id: id(99) }, { recorded_by: id(99) }, { planned_allocation_id: id(99) }, { work_date: "2026-10-14" }, { reason: "A different reason" }, { operative_id: id(99) }, { voided_at: "2026-10-15T17:00:00Z" }]) {
    assert.equal(confirmsWorkforceAbsence({ ...saved, ...changed }, id(12), request), false);
  }
});
