import test from "node:test";
import assert from "node:assert/strict";
import { buildSiteDay, nextAction, type DayRecords } from "../lib/operations/site-day";
import { londonClock, londonTimeToIso } from "../lib/operations/planning";
import { arrivalInput, confirmAsPlannedInput, confirmChangesInput, finishDayInput, moveInput, notOnSiteInput, unplannedInput, ValidationError } from "../lib/operations/validation";
import type { ActualAllocation, Attendance, Location, Operative, PlannedAllocation } from "../lib/operations/types";

const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
};
const day = "2026-10-14";
const at = (clock: string) => londonTimeToIso(day, clock);
const place = (n: number, name: string, parent: Location | null): Location => ({
  id: id("a", n), contract_id: "c", name, location: "", substrate_notes: "", system_notes: "", specification_revision: "",
  parent_id: parent?.id ?? null, path_ids: [...(parent?.path_ids ?? []), id("a", n)], location_type: "", code: "", sort_order: n, version: 1, archived_at: null,
});
const block = place(1, "Block B", null), flat52 = place(2, "Flat 52", block), flat59 = place(3, "Flat 59", block);
const communal = place(4, "Communal", null), corridor1 = place(5, "Corridor 1", communal), corridor2 = place(6, "Corridor 2", communal), flat55 = place(7, "Flat 55", block);
const person = (n: number, display_name: string, status: Operative["status"] = "active"): Operative =>
  ({ id: id("d", n), organisation_id: "o", display_name, engagement: "subcontractor", company_id: null, user_id: null, status, version: 1 });
const operatives = [person(1, "Sam Smith"), person(2, "Tom Baker"), person(3, "Lee Hart"), person(4, "Max Reed"), person(5, "Jo Jones"), person(6, "Kim Lowe"),
  person(7, "Dan Price"), person(8, "Eve Shaw"), person(9, "Ian Cole"), person(10, "Uma Bell"), person(11, "Nia Fox", "provisional"), person(12, "Ali Khan")];
const plan = (n: number, team: number, area: Location, stage: PlannedAllocation["stage"] = "installation"): PlannedAllocation => ({
  id: id("7", n), contract_id: "c", work_area_id: area.id, work_package_id: null, team_id: id("b", team), stage, planned_start: "2026-10-13", planned_end: "2026-10-16",
  instructions: "", supersedes_id: null, superseded_by: null, cancelled_at: null, created_by: null, created_at: "2026-10-12T09:00:00Z",
});
const actual = (n: number, planRef: PlannedAllocation | null, area: Location, start: string, extra: Partial<ActualAllocation> = {}): ActualAllocation => ({
  id: id("8", n), contract_id: "c", planned_allocation_id: planRef?.id ?? null, previous_allocation_id: null, work_area_id: area.id, work_package_id: null,
  team_id: planRef?.team_id ?? null, stage: planRef?.stage ?? "installation", work_date: day, started_at: at(start), ended_at: null, deviations: [],
  deviation_reason: null, confirmed_by: "u", recorded_at: at(start), ended_by: null, voided_at: null, voided_by: null, void_reason: null, lead_operative_id: null, ...extra,
});
const present = (n: number, allocation: ActualAllocation, operative: number, joined: string, extra: Partial<Attendance> = {}): Attendance => ({
  id: id("9", n), actual_allocation_id: allocation.id, operative_id: id("d", operative), joined_at: at(joined), left_at: null, note: null,
  added_by: "u", recorded_at: at(joined), left_recorded_by: null, departure_note: null, ...extra,
});
const smithPlan = plan(1, 1, flat52), jonesPlan = plan(2, 2, flat52), directPlan = plan(3, 3, communal, "preparation"), hartPlan = plan(4, 4, flat55), wetPlan = plan(5, 5, flat55);
const smith = actual(1, smithPlan, flat52, "08:00", { deviations: ["operatives_changed"], deviation_reason: "Absent: Max Reed (Off sick)" });
const jones = actual(2, jonesPlan, flat59, "08:00", { deviations: ["location_changed"], deviation_reason: "Flat 52 screed still wet" });
const direct1 = actual(3, directPlan, corridor1, "08:00"), direct2 = actual(4, directPlan, corridor2, "08:00");
const extra = actual(5, null, flat55, "11:00", { deviations: ["unplanned"], deviation_reason: "Called in to tank Flat 55" });
const records: DayRecords = {
  day, now: at("12:30"), locations: [block, flat52, flat59, communal, corridor1, corridor2, flat55],
  plans: [smithPlan, jonesPlan, directPlan, hartPlan, wetPlan, { ...plan(9, 1, flat59), cancelled_at: "2026-10-13T09:00:00Z" }],
  plannedOperatives: [1, 2, 3, 4].map(n => ({ planned_allocation_id: smithPlan.id, operative_id: id("d", n) }))
    .concat([5, 6].map(n => ({ planned_allocation_id: jonesPlan.id, operative_id: id("d", n) }))),
  actuals: [smith, jones, direct1, direct2, extra, actual(6, smithPlan, flat59, "07:00", { voided_at: at("07:30"), void_reason: "Entered in error" })],
  attendance: [present(1, smith, 1, "08:00"), present(2, smith, 2, "08:00"), present(3, smith, 3, "08:00", { left_at: at("12:00"), departure_note: "Dentist" }),
    present(4, jones, 5, "08:00"), present(5, jones, 6, "08:00"), present(6, direct1, 7, "08:00"), present(7, direct1, 8, "08:00"),
    present(8, direct2, 9, "08:00"), present(9, direct2, 10, "08:00"), present(10, extra, 11, "11:00"), present(11, smith, 12, "09:30", { note: "Replacement for an absent operative" })],
  absences: [
    { id: id("6", 1), planned_allocation_id: smithPlan.id, work_date: day, operative_id: id("d", 4), reason: "Off sick", recorded_by: "u", recorded_at: at("08:00"), voided_at: null, voided_by: null, void_reason: null },
    { id: id("6", 2), planned_allocation_id: hartPlan.id, work_date: day, operative_id: null, reason: "Did not turn up", recorded_by: "u", recorded_at: at("08:30"), voided_at: null, voided_by: null, void_reason: null },
  ],
  teams: [1, 2, 3, 4, 5].map(n => ({ id: id("b", n), organisation_id: "o", name: ["Smith Tiling", "Jones Installations", "Direct Team A", "Hart Gang", "Wet Area Team"][n - 1], kind: "subcontract_gang" as const, company_id: null, active: true, version: 1 })),
  operatives,
  memberships: [[3, 7, true], [3, 8, false], [3, 9, false], [3, 10, false], [1, 1, true], [5, 11, true]].map(([team, operative, lead], n) => ({
    id: id("f", n), team_id: id("b", team as number), operative_id: id("d", operative as number), is_lead: lead as boolean, valid_from: "2026-09-01", valid_until: null, voided_at: null })),
  companies: [],
};

test("the day shows each planned team's status and who is actually here, from saved records only", () => {
  const site = buildSiteDay(records);
  const status = Object.fromEntries(site.cards.map(card => [card.team?.name, card.status]));
  assert.deepEqual(status, { "Smith Tiling": "on_site", "Jones Installations": "on_site", "Direct Team A": "on_site", "Hart Gang": "not_on_site", "Wet Area Team": "unconfirmed" });
  assert.equal(site.cards[0].team?.name, "Wet Area Team", "unconfirmed teams come first");
  const smithCard = site.cards.find(card => card.team?.name === "Smith Tiling")!;
  assert.deepEqual(smithCard.people.map(item => `${item.name}:${item.status}`), ["Sam Smith:here", "Ali Khan:here", "Lee Hart:left", "Max Reed:absent", "Tom Baker:here"]);
  assert.equal(smithCard.periods.length, 1, "a voided record is not counted");
  assert.deepEqual(site.summary, { plannedTeams: 5, confirmedTeams: 3, unconfirmed: 1, notOnSite: 1, presentNow: 10, activeLocations: 5, openPeriods: 5 });
  const wet = site.cards.find(card => card.team?.name === "Wet Area Team")!;
  assert.deepEqual(wet.expected, [id("d", 11)], "a team planned without named people expects its current members");
});

test("planned and actual differences are listed for the office in plain words", () => {
  const kinds = buildSiteDay(records).exceptions.map(item => `${item.kind}: ${item.text}${item.reason ? ` (${item.reason})` : ""}`);
  for (const expected of [
    "operative_absent: Max Reed absent (Off sick)",
    "additional_operative: Ali Khan worked with Smith Tiling but was not planned (Replacement for an absent operative)",
    "late_arrival: Ali Khan joined at 09:30 (Replacement for an absent operative)",
    "left_early: Lee Hart left at 12:00 (Dentist)",
    "moved: Worked at Block B › Flat 59 instead of Block B › Flat 52 (Flat 52 screed still wet)",
    "split: Split between Communal › Corridor 1 and Communal › Corridor 2",
    "team_absent: Hart Gang not on site (Did not turn up)",
    "unconfirmed: Wet Area Team is not confirmed yet",
    "unplanned: Nia Fox at Block B › Flat 55, not on the plan (Called in to tank Flat 55)",
    "provisional: Nia Fox was added on site and is not yet confirmed by the office",
  ]) assert.ok(kinds.includes(expected), `missing: ${expected}\n${kinds.join("\n")}`);
  assert.equal(kinds.some(item => item.startsWith("moved") && item.includes("Corridor")), false, "work inside the planned area is not a move");
});

test("the next action follows the saved state of the day", () => {
  const site = buildSiteDay(records);
  const base = { siteHref: "/s", issuesHref: "/i", day: site, staleOpen: 0, openIssues: 2 };
  assert.equal(nextAction({ ...base, checksDone: false }).label, "Start morning checks");
  assert.equal(nextAction({ ...base, checksDone: true, staleOpen: 2 }).label, "Finish earlier work");
  assert.equal(nextAction({ ...base, checksDone: true }).label, "Review unconfirmed teams");
  const fresh = buildSiteDay({ ...records, actuals: [], attendance: [], absences: [] });
  assert.equal(nextAction({ ...base, checksDone: true, day: fresh }).label, "Confirm today's allocations");
  const done = buildSiteDay({ ...records, plans: [smithPlan] });
  assert.equal(nextAction({ ...base, checksDone: true, day: done }).label, "Review outstanding issues");
  assert.equal(nextAction({ ...base, checksDone: true, day: done, openIssues: 0 }).label, "Monitor today's work");
});

test("site times are UK wall-clock times in both GMT and BST", () => {
  assert.equal(londonTimeToIso("2026-07-01", "08:00"), "2026-07-01T07:00:00.000Z");
  assert.equal(londonTimeToIso("2026-12-01", "08:00"), "2026-12-01T08:00:00.000Z");
  assert.equal(londonTimeToIso("2026-10-25", "08:00"), "2026-10-25T08:00:00.000Z", "the morning the clocks go back");
  assert.equal(londonClock("2026-07-01T07:00:00Z"), "08:00");
});

test("supervisor forms produce the payloads the database functions accept", () => {
  const base = { contract_id: id("c", 1), planned_allocation_id: smithPlan.id, day };
  assert.deepEqual(confirmAsPlannedInput(form({ ...base, operative_ids: [id("d", 1), id("d", 2)], lead_operative_id: id("d", 1), started_time: "" })),
    { contract_id: id("c", 1), planned_allocation_id: smithPlan.id, groups: [{ operative_ids: [id("d", 1), id("d", 2)], lead_operative_id: id("d", 1) }] });
  assert.equal(confirmAsPlannedInput(form({ ...base, operative_ids: [id("d", 1)], started_time: "07:30" })).started_at, "2026-10-14T06:30:00.000Z");
  assert.throws(() => confirmAsPlannedInput(form({ ...base })), /Make changes/);
  assert.throws(() => confirmAsPlannedInput(form({ ...base, operative_ids: [id("d", 1)], started_time: "7.30am" })), /for example 08:00/);

  const changes = confirmChangesInput(form({ ...base, person: [id("d", 1), id("d", 2), id("d", 4)], [`status_${id("d", 4)}`]: "absent",
    [`absent_reason_${id("d", 4)}`]: "Off sick", lead_a: id("d", 1), reason: "", reason_other: "" }));
  assert.deepEqual(changes, { contract_id: id("c", 1), planned_allocation_id: smithPlan.id,
    groups: [{ operative_ids: [id("d", 1), id("d", 2)], lead_operative_id: id("d", 1) }], absent: [{ operative_id: id("d", 4), reason: "Off sick" }] });
  assert.throws(() => confirmChangesInput(form({ ...base, person: [id("d", 4)], [`status_${id("d", 4)}`]: "absent" })), /reason for each absent/);
  const split = confirmChangesInput(form({ ...base, person: [id("d", 7), id("d", 8), id("d", 9)], split: "on", [`group_${id("d", 9)}`]: "b",
    work_area_id: corridor1.id, work_area_id_b: corridor2.id, lead_a: id("d", 7), lead_b: id("d", 9), reason: "Split to finish sooner" }));
  assert.deepEqual(split.groups, [{ operative_ids: [id("d", 7), id("d", 8)], work_area_id: corridor1.id, lead_operative_id: id("d", 7) },
    { operative_ids: [id("d", 9)], work_area_id: corridor2.id, lead_operative_id: id("d", 9) }]);
  assert.throws(() => confirmChangesInput(form({ ...base, person: [id("d", 7)], split: "on", work_area_id_b: corridor2.id })), /each location/);

  assert.deepEqual(notOnSiteInput(form({ ...base, reason: "Did not turn up" })), { planned_allocation_id: smithPlan.id, work_date: day, reason: "Did not turn up" });
  assert.throws(() => notOnSiteInput(form({ ...base, reason: "", reason_other: "" })), ValidationError);
  assert.deepEqual(moveInput(form({ allocation_id: smith.id, day, person: [id("d", 1)], work_area_id: flat59.id, at_time: "11:00", reason: "", reason_other: "Bathroom finished" })),
    { allocation_id: smith.id, data: { at: "2026-10-14T10:00:00.000Z", reason: "Bathroom finished", targets: [{ work_area_id: flat59.id }] } });
  assert.deepEqual(arrivalInput(form({ allocation_id: smith.id, operative_id: id("d", 2), day, at_time: "", note: "Late arrival" })),
    { allocation_id: smith.id, operative_id: id("d", 2), joined_at: null, note: "Late arrival" });
  assert.throws(() => finishDayInput(form({ contract_id: id("c", 1), day, at_time: "" }), true), /time work finished/);
  assert.deepEqual(unplannedInput(form({ contract_id: id("c", 1), day, operative_ids: [id("d", 11)], stage: "waterproofing", work_area_id: flat55.id, team_id: "", reason: "Extra labour needed" })),
    { contract_id: id("c", 1), work_area_id: flat55.id, stage: "waterproofing", operative_ids: [id("d", 11)], reason: "Extra labour needed" });
});
