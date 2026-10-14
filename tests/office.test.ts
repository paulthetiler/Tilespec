import test from "node:test";
import assert from "node:assert/strict";
import { buildLocationItems, splitNames, subtreeIds, type LocationBuilderInput } from "../lib/operations/locations";
import { addDays, isCalendarDate, londonDate, membershipOnDay, planCoversDay, planOverlaps, planStatus, weekDays, weekStart } from "../lib/operations/planning";
import { rpcErrorMessage } from "../lib/operations/errors";
import { accreditationSummary, coverStatus, daysUntil, insuranceSummary } from "../lib/operations/companies";
import {
  accreditationInput, companyInput, companyUpdateInput, insuranceInput, locationBuilderInput, locationUpdateInput, membershipInput,
  operativeInput, operativeUpdateInput, planInput, teamInput, ValidationError,
} from "../lib/operations/validation";
import type { CompanyAccreditation, CompanyInsurance, Location } from "../lib/operations/types";

const series = (overrides: Partial<LocationBuilderInput>): LocationBuilderInput => ({ mode: "series", label: "Flat", from: "51", to: "58", names: "", rooms: "", ...overrides });
const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("a numbered series with rooms becomes one nested request", () => {
  const { items, total } = buildLocationItems(series({ rooms: "Bathroom\nKitchen" }));
  assert.equal(total, 24);
  assert.deepEqual(items.map(item => item.name), ["Flat 51", "Flat 52", "Flat 53", "Flat 54", "Flat 55", "Flat 56", "Flat 57", "Flat 58"]);
  assert.deepEqual(items[1], { name: "Flat 52", location_type: "Flat", children: [{ name: "Bathroom" }, { name: "Kitchen" }] });
});

test("leading zeros, unlabelled numbers and typed lists are kept as entered", () => {
  assert.deepEqual(buildLocationItems(series({ label: "Room", from: "01", to: "03" })).items.map(item => item.name), ["Room 01", "Room 02", "Room 03"]);
  assert.deepEqual(buildLocationItems(series({ label: "", from: "9", to: "10" })).items, [{ name: "9" }, { name: "10" }]);
  const showroom = buildLocationItems({ ...series({}), mode: "names", label: "", names: "Sales floor, Customer entrance\nStaff toilets\nsales floor" });
  assert.deepEqual(showroom.items.map(item => item.name), ["Sales floor", "Customer entrance", "Staff toilets"]);
  assert.equal(showroom.total, 3);
});

test("the builder refuses impossible or oversized requests in plain language", () => {
  assert.throws(() => buildLocationItems(series({ from: "58", to: "51" })), /same as or after/);
  assert.throws(() => buildLocationItems(series({ from: "five" })), /whole numbers/);
  assert.throws(() => buildLocationItems(series({ from: "1", to: "501" })), /at most 500/);
  assert.throws(() => buildLocationItems(series({ from: "1", to: "400", rooms: "A, B, C, D, E" })), /2,400 locations/);
  assert.throws(() => buildLocationItems({ ...series({}), mode: "names", names: " , \n" }), /at least one/);
  assert.deepEqual(splitNames("  Bathroom ,ensuite\n\nEnsuite,  Utility   room "), ["Bathroom", "ensuite", "Utility room"]);
});

test("a location cannot be offered as a destination inside its own subtree", () => {
  const loc = (key: string, path: string[]): Location => ({ id: key, path_ids: path } as Location);
  const locations = [loc("block", ["block"]), loc("level", ["block", "level"]), loc("flat", ["block", "level", "flat"]), loc("other", ["other"])];
  assert.deepEqual([...subtreeIds(locations, "level")].sort(), ["flat", "level"]);
});

test("planning weeks run Monday to Sunday in UK calendar dates", () => {
  assert.equal(weekStart("2026-10-14"), "2026-10-12");
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
  assert.deepEqual([weekDays("2026-10-26")[0], weekDays("2026-10-26")[6]], ["2026-10-26", "2026-11-01"]);
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
  // 23:30 UTC on 13 October is already 14 October in London (BST).
  assert.equal(londonDate(new Date("2026-10-13T23:30:00Z")), "2026-10-14");
  assert.equal(londonDate(new Date("2026-12-13T23:30:00Z")), "2026-12-13");
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-02-28"), true);
});

test("plan state, coverage and membership are read from the records, never assumed", () => {
  const plan = { planned_start: "2026-10-13", planned_end: "2026-10-15", superseded_by: null, cancelled_at: null };
  assert.equal(planStatus(plan), "active");
  assert.equal(planStatus({ ...plan, superseded_by: "next" }), "revised");
  assert.equal(planStatus({ ...plan, cancelled_at: "2026-10-12T09:00:00Z" }), "cancelled");
  assert.deepEqual(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"].map(day => planCoversDay(plan, day)), [false, true, true, false]);
  assert.equal(planOverlaps(plan, "2026-10-15", "2026-10-21"), true);
  assert.equal(planOverlaps(plan, "2026-10-16", "2026-10-22"), false);
  const membership = { valid_from: "2026-10-01", valid_until: "2026-10-13", voided_at: null };
  assert.deepEqual(["2026-09-30", "2026-10-13", "2026-10-14"].map(day => membershipOnDay(membership, day)), [false, true, false]);
  assert.equal(membershipOnDay({ ...membership, voided_at: "2026-10-02T09:00:00Z" }, "2026-10-05"), false);
});

test("office forms produce exactly the payload the database functions accept", () => {
  assert.deepEqual(operativeInput(form({ display_name: " Sam Smith ", engagement: "subcontractor", company_id: id(8), user_id: id(1) }), true),
    { display_name: "Sam Smith", engagement: "subcontractor", company_id: id(8), user_id: id(1) });
  assert.equal("user_id" in operativeInput(form({ display_name: "Sam", engagement: "agency", user_id: id(1) }), false), false);
  assert.deepEqual(operativeUpdateInput(form({ display_name: "Sam", engagement: "agency", status: "inactive", user_id: "", company_id: "" })),
    { display_name: "Sam", engagement: "agency", company_id: null, user_id: null, status: "inactive" });
  assert.equal(operativeInput(form({ display_name: "Dan", engagement: "direct_employee", company_id: id(8) }), true).company_id, null);
  assert.throws(() => operativeInput(form({ display_name: "Sam", engagement: "freelance" }), true), ValidationError);
  assert.throws(() => operativeInput(form({ display_name: "Sam", engagement: "subcontractor", company_id: "Smith Tiling Ltd" }), true), ValidationError);
  assert.deepEqual(teamInput(form({ name: "Smith Tiling", kind: "subcontract_gang", company_id: id(8) })),
    { name: "Smith Tiling", kind: "subcontract_gang", company_id: id(8) });
  assert.equal(teamInput(form({ name: "Direct Team A", kind: "direct_team", company_id: id(8) })).company_id, null);
  assert.deepEqual(membershipInput(form({ team_id: id(2), operative_id: id(3), valid_from: "2026-10-14", is_lead: "on" })),
    { team_id: id(2), operative_id: id(3), valid_from: "2026-10-14", is_lead: true });
  assert.deepEqual(locationUpdateInput(form({ name: "Flat 52", location_type: "Flat", code: "52", description: "", parent_id: "" })),
    { name: "Flat 52", location_type: "Flat", code: "52", description: "", substrate_notes: "", system_notes: "", parent_id: null });
  assert.equal(locationBuilderInput(form({ mode: "series", label: "Flat", from: "51", to: "58", rooms: "Bathroom" })).mode, "series");
  assert.throws(() => locationBuilderInput(form({ mode: "grid" })), ValidationError);
});

test("a plan needs a place, a team, a stage and real dates; named people are optional", () => {
  const base = { contract_id: id(1), work_area_id: id(2), team_id: id(3), stage: "installation", planned_start: "2026-10-14" };
  assert.deepEqual(planInput(form(base)), { ...base, planned_end: "2026-10-14", instructions: "", operative_ids: [] });
  const full = planInput(form({ ...base, planned_end: "2026-10-16", operative_ids: [id(4), id(5), id(4)], work_package_id: id(6), supersedes_id: id(7), instructions: "Bathroom first" }));
  assert.deepEqual(full.operative_ids, [id(4), id(5)]);
  assert.equal(full.work_package_id, id(6));
  assert.equal(full.supersedes_id, id(7));
  assert.throws(() => planInput(form({ ...base, planned_end: "2026-10-13" })), /on or after/);
  assert.throws(() => planInput(form({ ...base, stage: "tiling" })), /stage/);
  assert.throws(() => planInput(form({ ...base, work_area_id: "" })), /where the work/);
  assert.throws(() => planInput(form({ ...base, planned_start: "2026-02-30" })), ValidationError);
});

test("database messages written for people are shown; raw PostgreSQL text never is", () => {
  assert.equal(rpcErrorMessage({ code: "23505", message: 'Another active location here is already called "Flat 52"' }), 'Another active location here is already called "Flat 52"');
  assert.equal(rpcErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "teams_active_name"' }), "An active team already has that name.");
  assert.equal(rpcErrorMessage({ code: "23514", message: 'new row for relation "teams" violates check constraint "teams_kind_check"' }), "The record could not be saved. Check your connection and try again.");
  assert.equal(rpcErrorMessage({ code: "42501", message: "Office permission required" }), "You do not have permission for this operation.");
  assert.equal(rpcErrorMessage({ code: "40001", message: "That plan has already been revised or cancelled; reload the current plan" }), "That plan has already been revised or cancelled; reload the current plan");
  assert.equal(rpcErrorMessage({ code: "PGRST301", message: "JWT expired" }), "The record could not be saved. Check your connection and try again.");
  assert.equal(rpcErrorMessage({ code: "23514", message: "This company still has 2 active teams. Deactivate them or link them to another company first." }),
    "This company still has 2 active teams. Deactivate them or link them to another company first.");
  assert.equal(rpcErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "subcontractor_companies_name"' }),
    "A company with that name is already on record. Check the list, including inactive companies.");
});

test("company, insurance and accreditation forms produce the payload the database functions accept", () => {
  const details = { name: "  Smith   Tiling Ltd ", contact_name: "Sam Smith", contact_phone: "07700 900123", contact_email: "office@smith.example", company_number: "01234567", address: "", notes: "" };
  assert.deepEqual(companyInput(form(details)),
    { name: "Smith Tiling Ltd", company_number: "01234567", contact_name: "Sam Smith", contact_phone: "07700 900123", contact_email: "office@smith.example", address: "", notes: "" });
  assert.equal(companyUpdateInput(form({ ...details, active: "on" })).active, true);
  assert.equal(companyUpdateInput(form(details)).active, false);
  assert.throws(() => companyInput(form({ ...details, contact_email: "office at smith" })), /valid contact email/);
  assert.throws(() => companyInput(form({ ...details, name: " " })), ValidationError);
  assert.deepEqual(insuranceInput(form({ company_id: id(8), insurance_type: "public_liability", expires_on: "2027-06-30", starts_on: "2026-07-01", cover_amount: "£10,000,000", insurer: "Example Mutual", policy_number: "PL-1" })),
    { company_id: id(8), insurance_type: "public_liability", insurer: "Example Mutual", policy_number: "PL-1", cover_amount: 10000000, starts_on: "2026-07-01", expires_on: "2027-06-30", notes: "" });
  assert.deepEqual(insuranceInput(form({ company_id: id(8), insurance_type: "employers_liability", expires_on: "2027-01-31", cover_amount: "", starts_on: "" })),
    { company_id: id(8), insurance_type: "employers_liability", insurer: "", policy_number: "", expires_on: "2027-01-31", notes: "" });
  assert.throws(() => insuranceInput(form({ company_id: id(8), insurance_type: "public_liability", expires_on: "" })), /expiry date/);
  assert.throws(() => insuranceInput(form({ company_id: id(8), insurance_type: "public_liability", expires_on: "2027-01-01", starts_on: "2027-02-01" })), /on or after/);
  assert.throws(() => insuranceInput(form({ company_id: id(8), insurance_type: "public_liability", expires_on: "2027-01-01", cover_amount: "5m" })), /whole pounds/);
  assert.throws(() => insuranceInput(form({ company_id: id(8), insurance_type: "van", expires_on: "2027-01-01" })), /type of insurance/);
  assert.deepEqual(accreditationInput(form({ company_id: id(8), scheme: "CHAS", reference: "CH-778", expires_on: "" })),
    { company_id: id(8), scheme: "CHAS", reference: "CH-778", notes: "" });
  assert.throws(() => accreditationInput(form({ company_id: id(8), scheme: "" })), ValidationError);
});

test("cover status uses each policy's latest renewal and warns 30 days ahead", () => {
  const today = "2026-10-14";
  assert.deepEqual(["2026-10-13", "2026-10-14", "2026-11-13", "2026-11-14", null].map(date => coverStatus(date, today)), ["expired", "expiring", "expiring", "valid", "valid"]);
  assert.equal(daysUntil("2026-10-30", today), 16);
  const entry = (insurance_type: CompanyInsurance["insurance_type"], expires_on: string, company_id = "smith"): CompanyInsurance =>
    ({ id: `${company_id}-${insurance_type}-${expires_on}`, company_id, insurance_type, insurer: "", policy_number: "", cover_amount: null, starts_on: null, expires_on, notes: "", recorded_at: "" });
  const renewed = [entry("public_liability", "2026-06-30"), entry("public_liability", "2027-06-30"), entry("public_liability", "2026-01-01", "jones")];
  assert.equal(insuranceSummary(renewed, "smith", today).status, "valid");
  const mixed = insuranceSummary([...renewed, entry("employers_liability", "2026-10-30")], "smith", today);
  assert.equal(mixed.status, "expiring");
  assert.equal(mixed.attention?.entry.insurance_type, "employers_liability");
  assert.equal(insuranceSummary(renewed, "jones", today).status, "expired");
  assert.deepEqual(insuranceSummary(renewed, "agency", today), { status: "none", policies: [], attention: null });
  const accreditation = (scheme: string, expires_on: string | null): CompanyAccreditation => ({ id: scheme + expires_on, company_id: "smith", scheme, reference: "", expires_on, notes: "", recorded_at: "" });
  const schemes = accreditationSummary([accreditation("CHAS", "2025-03-31"), accreditation("chas", "2027-03-31"), accreditation("TTA member", null)], "smith", today);
  assert.equal(schemes.status, "valid");
  assert.deepEqual(schemes.schemes.map(item => item.entry.expires_on), ["2027-03-31", null]);
});
