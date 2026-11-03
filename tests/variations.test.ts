import test from "node:test";
import assert from "node:assert/strict";
import Data from "../docs/redesign/prototype/data.js";
import { buildActivity, type ActivitySources } from "../lib/operations/activity";
import { dayworkReference, eventLine, kindWords } from "../lib/operations/dayworks";
import { dayworkInput, quotedPriceInput } from "../lib/operations/daywork-input";
import { compute, type DayworkRow, type NextActionSnapshot } from "../lib/operations/next-actions";
import { ValidationError } from "../lib/operations/validation";

const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const make = () => Data.make("start") as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => s.members.find(m => m.display_name.startsWith(first))!;
const row = (s: NextActionSnapshot, over: Partial<DayworkRow> = {}): DayworkRow => ({
  id: "v1", contract_id: "c1", kind: "variation", number: 2, description: "Tile the shower wall to full height", created_by: who(s, "Dave").user_id,
  site_status: "sent", office_status: "awaiting_review", signoff_status: "none", commercial_status: "awaiting_pricing", client_status: "not_authorised",
  client_authorisation_required: true, submitted_by: [who(s, "Dave").user_id], ...over,
});

test("variations have their own numbering prefix and wording", () => {
  assert.equal(dayworkReference({ number: 2, kind: "variation" }), "VO-2");
  assert.equal(dayworkReference({ number: 2, kind: "daywork" }), "DW-2");
  assert.equal(dayworkReference({ number: 2 }), "DW-2", "a record from before the variations update is a daywork");
  assert.equal(kindWords.variation.plural, "Variations");
  assert.equal(eventLine({ action: "record", note: null, owner_override: false }, "VO-2"), "recorded variation VO-2");
  assert.equal(eventLine({ action: "record", note: null, owner_override: false }, "DW-2"), "recorded daywork DW-2");
});

test("a variation is raised on the daywork form, with or without people and materials", () => {
  const base = { contract_id: id(1), description: "Change the trim to brushed steel", instructed_by_name: "Sam Site" };
  assert.deepEqual(dayworkInput(form({ ...base, kind: "variation" })), { ...base, kind: "variation", lines: [] });
  assert.deepEqual(dayworkInput(form(base)), { ...base, lines: [] }, "a daywork sends no kind, so it works before the variations update too");
  assert.throws(() => dayworkInput(form({ ...base, kind: "extra" })), ValidationError);
  assert.throws(() => dayworkInput(form({ ...base, kind: "variation", description: "Tile" })), /what needs to change/);
});

test("a quoted price is pounds and pence with an optional reference", () => {
  assert.deepEqual(quotedPriceInput(form({ total: "1250.50", note: "Q-12" })), { method: "quoted", total: 1250.5, note: "Q-12" });
  assert.deepEqual(quotedPriceInput(form({ total: "99" })), { method: "quoted", total: 99 });
  for (const bad of ["0", "-5", "12.345", "abc", "", "10000000.01"]) assert.throws(() => quotedPriceInput(form({ total: bad })), ValidationError, bad);
});

test("Next Actions name variations as variations, and never ask for a signature before the work exists", () => {
  const s = make();
  s.dayworks = [row(s)];
  const office = compute(s, who(s, "Sam"));
  const review = office.find(a => a.rule === "R22")!;
  assert.equal(review.title, "Review variation VO-2: Tile the shower wall to full height");
  assert.match(review.why, /change to the agreed work/);
  s.dayworks = [row(s, { site_status: "recorded", office_status: null })];
  const site = compute(s, who(s, "Dave"));
  assert.ok(site.some(a => a.rule === "R23" && a.title === "Send variation VO-2 to the office"));
  assert.ok(!site.some(a => a.rule === "R25"), "no signature reminder for a variation");
  s.dayworks = [row(s, { kind: "daywork", site_status: "recorded", office_status: null })];
  assert.ok(compute(s, who(s, "Dave")).some(a => a.rule === "R25"), "dayworks still ask for the signature");
});

test("Job activity names a variation by its own reference", () => {
  const empty: ActivitySources = { snagEvents: [], snags: [], holdEvents: [], holds: [], messages: [], acknowledgements: [], results: [], handovers: [],
    morningChecks: [], inspections: [], plans: [], documents: [] };
  const entries = buildActivity({ ...empty, dayworkEvents: [{ id: 1, daywork_id: "v1", actor_id: "u-dave", actor_name: "Dave Collins", action: "record",
    note: null, owner_override: false, created_at: "2026-11-04T08:00:00Z", number: 2, kind: "variation", description: "Tile the shower wall" }] },
  { viewerId: "u-office", names: new Map(), siteBase: "/admin/supervisor/sites/c1", contractId: "c1", office: true });
  assert.equal(entries[0].what, "recorded variation VO-2");
});
