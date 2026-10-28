import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import { buildActivity, type ActivitySources } from "../lib/operations/activity";
import { currentLines, currentRates, dayworkStatuses, dayworkWarning, eventLine, suggestRates, type Daywork, type DayworkLine, type DayworkRate } from "../lib/operations/dayworks";
import { chargeInput, clientAuthorisationInput, dayworkInput, decisionInput, linesInput, pricingInput, rateInput, signoffInput } from "../lib/operations/daywork-input";
import { londonDate } from "../lib/operations/planning";
import { ValidationError } from "../lib/operations/validation";
import { alreadyStored } from "../lib/operations/evidence";
import { adminActionHref, compute, ctaLabel, hrefIsExistingForm, type DayworkRow, type NextActionSnapshot, type ViewerAction } from "../lib/operations/next-actions";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const make = () => Data.make("start") as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => s.members.find(m => m.display_name.startsWith(first))!;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ofRule = (actions: ViewerAction[], rule: string) => actions.filter(a => a.rule === rule);
const today = londonDate();

const daywork = (over: Partial<Daywork> = {}): Daywork => ({
  id: "d1", contract_id: "c1", number: 3, work_area_id: null, location_path: [], description: "Tile the bin store wall", instructed_by_name: "Sam Site",
  instructed_by_company: null, instructed_on: today, created_by: "u-dave", created_by_name: "Dave Collins", created_at: `${today}T08:00:00Z`,
  site_status: "recorded", office_status: null, signoff_status: "none", commercial_status: "awaiting_pricing", client_status: "not_authorised",
  lines_version: 1, version: 1, updated_at: `${today}T08:00:00Z`, ...over,
});
const line = (over: Partial<DayworkLine>): DayworkLine => ({ id: "l1", daywork_id: "d1", lines_version: 1, position: 1, kind: "labour", label: "Marek",
  role: "operative", work_date: today, quantity: 6.5, unit: "hour", ...over });
const rate = (over: Partial<DayworkRate>): DayworkRate => ({ id: "r1", contract_id: "c1", category: "operative", item: "Tiler", unit: "hour", rate: 30,
  retired: false, supersedes_id: null, created_by_name: "Sam Patel", created_at: `${today}T07:00:00Z`, ...over });

// --- Statuses and wording -------------------------------------------------------------------
test("the four statuses stay separate and say nothing about money", () => {
  const recorded = dayworkStatuses(daywork());
  assert.deepEqual(Object.values(recorded), ["Recorded, not sent yet", "Not signed yet", "Not sent to the office yet", "Awaiting pricing", "Client has not authorised the cost"]);
  const approved = dayworkStatuses(daywork({ site_status: "sent", office_status: "approved", signoff_status: "signed", commercial_status: "commercially_approved" }));
  assert.equal(approved.charge, "Charge approved internally by TileSPEC");
  assert.equal(approved.client, "Client has not authorised the cost", "an internal approval is never the client's acceptance");
  assert.equal(dayworkStatuses(daywork({ office_status: "more_detail" })).site, "Sent back for more detail");
  for (const value of [...Object.values(recorded), ...Object.values(approved)]) assert.doesNotMatch(value, /£|\d/);
});

test("recording work is never permission to proceed or agreement to pay", () => {
  assert.match(dayworkWarning(daywork())!, /not permission to proceed or an agreement to pay/);
  assert.match(dayworkWarning(daywork({ site_status: "sent", office_status: "approved", signoff_status: "signed" }))!, /signature on the sheet confirms the work only, not payment/);
  assert.equal(dayworkWarning(daywork({ site_status: "sent", office_status: "approved", client_status: "authorised" })), null);
  assert.match(dayworkWarning(daywork({ site_status: "sent", office_status: "rejected" }))!, /rejected/);
  assert.match(dayworkWarning(daywork({ client_status: "declined" }))!, /declined/);
});

test("only the current set of lines is shown, and the history reads in plain words", () => {
  const lines = [line({ id: "old", lines_version: 1 }), line({ id: "b", lines_version: 2, position: 2 }), line({ id: "a", lines_version: 2, position: 1 })];
  assert.deepEqual(currentLines(daywork({ lines_version: 2 }), lines).map(l => l.id), ["a", "b"]);
  assert.equal(eventLine({ action: "commercial_approval", note: null, owner_override: false }, "DW-3"), "approved the charge for DW-3 internally");
  assert.equal(eventLine({ action: "approve", note: "Only office user", owner_override: true }, "DW-3"), "approved DW-3 (owner override)");
  assert.equal(eventLine({ action: "sign_off", note: "refused", owner_override: false }, "DW-3"), "recorded that the client's representative refused to sign DW-3");
});

test("pricing suggests a rate only when there is exactly one sensible match", () => {
  const lines = [line({ id: "marek" }), line({ id: "saw", kind: "plant", label: "Wet saw", role: null, unit: "day", quantity: 1, work_date: null }),
    line({ id: "glue", kind: "material", label: "Adhesive", role: null, unit: "bag", quantity: 3, work_date: null }),
    line({ id: "grout", kind: "material", label: "Grout", role: null, unit: "bag", quantity: 1, work_date: null })];
  const rates = [rate({}), rate({ id: "old-saw", category: "plant", item: "Wet saw", unit: "day", rate: 70 }),
    rate({ id: "saw", category: "plant", item: "wet SAW", unit: "day", rate: 85, supersedes_id: "old-saw" }),
    rate({ id: "glue", category: "material", item: "Adhesive", unit: "bag", rate: 12.5 }), rate({ id: "glue-each", category: "material", item: "Adhesive", unit: "each", rate: 1 }),
    rate({ id: "retired", category: "material", item: "Grout", unit: "bag", rate: 9, retired: true })];
  assert.deepEqual(currentRates(rates).map(r => r.id), ["r1", "saw", "glue", "glue-each"]);
  assert.deepEqual(Object.fromEntries(suggestRates(lines, rates)), { marek: "r1", saw: "saw", glue: "glue" },
    "the only operative rate, the current saw rate by name, and adhesive by bag; nothing for the retired grout rate");
});

// --- Form input -----------------------------------------------------------------------------
test("the daywork form keeps hours, quantities and dates honest", () => {
  const lines = JSON.stringify([
    { kind: "labour", label: "Marek", role: "operative", work_date: today, quantity: "6.5" },
    { kind: "plant", label: "Wet saw", unit: "day", quantity: "1" },
    { kind: "material", label: "  ", unit: "bag", quantity: "" },
  ]);
  assert.deepEqual(dayworkInput(form({ contract_id: id(1), description: "Tile the bin store wall", instructed_by_name: "Sam Site", lines })), {
    contract_id: id(1), description: "Tile the bin store wall", instructed_by_name: "Sam Site",
    lines: [{ kind: "labour", label: "Marek", role: "operative", work_date: today, quantity: 6.5 }, { kind: "plant", label: "Wet saw", unit: "day", quantity: 1 }],
  }, "an empty row is left out");
  const bad = (rows: unknown[]) => assert.throws(() => linesInput(form({ lines: JSON.stringify(rows) })), ValidationError);
  bad([{ kind: "labour", label: "Marek", role: "operative", work_date: today, quantity: "25" }]);
  bad([{ kind: "labour", label: "Marek", role: "operative", quantity: "8" }]);
  bad([{ kind: "labour", label: "Marek", role: "boss", work_date: today, quantity: "8" }]);
  bad([{ kind: "labour", label: "Marek", role: "operative", work_date: "2999-01-01", quantity: "8" }]);
  bad([{ kind: "plant", label: "Saw", unit: "fortnight", quantity: "1" }]);
  bad([{ kind: "material", label: "Glue", unit: "bag", quantity: "1.005" }]);
  assert.throws(() => dayworkInput(form({ contract_id: id(1), description: "Tile", instructed_by_name: "Sam" })), ValidationError);
  assert.throws(() => dayworkInput(form({ contract_id: id(1), description: "Tile the wall", instructed_by_name: "" })), ValidationError);
});

test("signatures, decisions, client authorisations, rates and prices each need what makes them meaningful", () => {
  assert.deepEqual(signoffInput(form({ outcome: "signed", signer_name: "Sam Site", signer_position: "Site manager" })), { outcome: "signed", signer_name: "Sam Site", signer_position: "Site manager" });
  assert.throws(() => signoffInput(form({ outcome: "refused" })), ValidationError);
  assert.throws(() => signoffInput(form({ outcome: "signed" })), ValidationError);
  assert.deepEqual(decisionInput(form({ decision: "approve" })), { decision: "approve" });
  assert.throws(() => decisionInput(form({ decision: "reject" })), ValidationError);
  assert.throws(() => clientAuthorisationInput(form({ outcome: "authorised", client_name: "Pat Client" })), ValidationError);
  assert.deepEqual(clientAuthorisationInput(form({ outcome: "authorised", client_name: "Pat Client", reference: "CVI-12" })), { outcome: "authorised", client_name: "Pat Client", reference: "CVI-12" });
  assert.throws(() => clientAuthorisationInput(form({ outcome: "declined", client_name: "Pat Client" })), ValidationError);
  assert.deepEqual(rateInput(form({ contract_id: id(1), category: "supervisor", item: "Supervisor", unit: "day", rate: "42.50" })),
    { contract_id: id(1), category: "supervisor", item: "Supervisor", unit: "hour", rate: 42.5 }, "people are always priced per hour");
  assert.deepEqual(rateInput(form({ contract_id: id(1), supersedes_id: id(2), rate: "35" })), { contract_id: id(1), supersedes_id: id(2), rate: 35 });
  assert.deepEqual(rateInput(form({ contract_id: id(1), supersedes_id: id(2), retired: "on" })), { contract_id: id(1), supersedes_id: id(2), retired: true });
  assert.throws(() => rateInput(form({ contract_id: id(1), category: "plant", item: "Saw", unit: "day", rate: "-1" })), ValidationError);
  assert.deepEqual(pricingInput(form({ line_ids: `${id(3)},${id(4)}`, [`rate_${id(3)}`]: id(5), [`rate_${id(4)}`]: id(6) })),
    { lines: [{ line_id: id(3), rate_id: id(5) }, { line_id: id(4), rate_id: id(6) }] });
  assert.throws(() => pricingInput(form({ line_ids: `${id(3)},${id(4)}`, [`rate_${id(3)}`]: id(5) })), ValidationError, "every line needs a rate");
  assert.deepEqual(chargeInput(form({ note: "Checked" })), { note: "Checked" });
});

// --- Next Actions ---------------------------------------------------------------------------
const row = (s: NextActionSnapshot, over: Partial<DayworkRow> = {}): DayworkRow => ({
  id: "d1", contract_id: "c1", number: 3, description: "Tile the bin store wall", created_by: who(s, "Dave").user_id,
  site_status: "sent", office_status: "awaiting_review", signoff_status: "signed", commercial_status: "awaiting_pricing", client_status: "not_authorised",
  submitted_by: [who(s, "Dave").user_id], ...over,
});

test("a daywork sent to the office is reviewed by an office user who did not submit it", () => {
  const s = make();
  s.dayworks = [row(s)];
  const [sam] = ofRule(compute(s, who(s, "Sam")), "R22");
  assert.equal(sam.state, "ready");
  assert.equal(sam.title, "Review daywork DW-3: Tile the bin store wall");
  assert.equal(ctaLabel(sam), "Review");
  assert.equal(adminActionHref(sam), "/admin/supervisor/sites/c1/dayworks/d1");
  assert.ok(hrefIsExistingForm(adminActionHref(sam), "/admin/supervisor/sites/c1"));
  assert.equal(ofRule(compute(s, who(s, "Dave")), "R22")[0]?.state, "waiting", "the supervisor sees it is with the office");
  s.dayworks = [row(s, { created_by: who(s, "Sam").user_id, submitted_by: [who(s, "Sam").user_id] })];
  const [own] = ofRule(compute(s, who(s, "Sam")), "R22");
  assert.equal(own.state, "blocked");
  assert.match(own.blockedBy!, /another office user must approve it/);
  assert.equal(ofRule(compute(s, who(s, "Jo")), "R22")[0].state, "ready");
  s.dayworks = [row(s, { created_by: who(s, "Alex").user_id, submitted_by: [who(s, "Alex").user_id] })];
  assert.equal(ofRule(compute(s, who(s, "Alex")), "R22")[0].state, "ready", "the owner may approve their own, with a logged reason on the record");
});

test("pricing and the internal charge approval reach only people with money access", () => {
  const s = make();
  s.dayworks = [row(s, { office_status: "approved" })];
  assert.equal(ofRule(compute(s, who(s, "Sam")), "R26")[0].state, "ready");
  assert.equal(ofRule(compute(s, who(s, "Alex")), "R26")[0].state, "ready");
  assert.deepEqual(ofRule(compute(s, who(s, "Jo")), "R26"), [], "an office user without money access is not asked to price");
  assert.deepEqual(ofRule(compute(s, who(s, "Dave")), "R26"), [], "a supervisor never sees a money action");
  s.dayworks = [row(s, { office_status: "approved", commercial_status: "priced" })];
  const [charge] = ofRule(compute(s, who(s, "Sam")), "R27");
  assert.equal(charge.title, "Approve the charge for daywork DW-3");
  assert.match(charge.why, /not the client's acceptance or agreement to pay/);
  assert.deepEqual(ofRule(compute(s, who(s, "Jo")), "R27"), []);
  s.dayworks = [row(s, { office_status: "approved", commercial_status: "priced", submitted_by: [who(s, "Sam").user_id] })];
  assert.equal(ofRule(compute(s, who(s, "Sam")), "R27")[0].state, "blocked", "nobody approves the charge on a daywork they submitted");
  s.dayworks = [row(s, { office_status: "rejected" })];
  assert.deepEqual([...ofRule(compute(s, who(s, "Sam")), "R26"), ...ofRule(compute(s, who(s, "Sam")), "R28")], [], "a rejected daywork is never priced");
  s.dayworks = [row(s, { office_status: "approved", commercial_status: "priced" })];
  for (const person of ["Sam", "Jo", "Alex", "Dave"]) for (const a of compute(s, who(s, person)).filter(a => a.source.table === "dayworks"))
    assert.doesNotMatch(`${a.title} ${a.why} ${a.requires.join(" ")}`, /£|\d+\.\d\d/, "no daywork action carries an amount");
});

test("site is asked to send, sign and add detail; the office records the client's decision", () => {
  const s = make();
  const dave = who(s, "Dave");
  s.dayworks = [row(s, { site_status: "recorded", office_status: null, signoff_status: "none" })];
  assert.deepEqual(compute(s, dave).filter(a => a.rule.startsWith("R2") && a.source.table === "dayworks").map(a => [a.rule, a.state]), [["R23", "ready"], ["R25", "ready"]]);
  s.dayworks = [row(s, { site_status: "recorded", office_status: "more_detail" })];
  const [detail] = ofRule(compute(s, dave), "R24");
  assert.equal(detail.title, "Office needs more detail on daywork DW-3");
  assert.equal(ofRule(compute(s, who(s, "Sam")), "R24")[0].state, "waiting");
  s.dayworks = [row(s, { office_status: "approved", commercial_status: "commercially_approved" })];
  const [client] = ofRule(compute(s, who(s, "Jo")), "R28");
  assert.equal(client.title, "Record the client's decision on daywork DW-3");
  s.dayworks = [row(s, { office_status: "approved", client_status: "authorised", commercial_status: "commercially_approved" })];
  assert.deepEqual(compute(s, who(s, "Sam")).filter(a => a.source.table === "dayworks"), [], "nothing is left once every status is complete");
});

test("without dayworks in the database there are no daywork actions", () => {
  const s = make();
  for (const person of ["Sam", "Dave", "Alex"]) assert.deepEqual(compute(s, who(s, person)).filter(a => a.source.table === "dayworks"), []);
});

// --- Job activity ---------------------------------------------------------------------------
const empty: ActivitySources = { snagEvents: [], snags: [], holdEvents: [], holds: [], messages: [], acknowledgements: [], results: [], handovers: [],
  morningChecks: [], inspections: [], plans: [], documents: [] };
test("job activity tells each daywork step without any money", () => {
  const entries = buildActivity({ ...empty, dayworkEvents: [
    { id: 1, daywork_id: "d1", actor_id: "u-dave", actor_name: "Dave Collins", action: "record", note: null, owner_override: false, created_at: `${today}T08:00:00Z`, number: 3, description: "Tile the bin store wall" },
    { id: 2, daywork_id: "d1", actor_id: "u-sam", actor_name: "Sam Patel", action: "request_detail", note: "Which day was the saw on site?", owner_override: false, created_at: `${today}T09:00:00Z`, number: 3, description: "Tile the bin store wall" },
    { id: 3, daywork_id: "d1", actor_id: "u-sam", actor_name: "Sam Patel", action: "price", note: null, owner_override: false, created_at: `${today}T10:00:00Z`, number: 3, description: "Tile the bin store wall" },
  ] }, { viewerId: "u-dave", names: new Map(), siteBase: "/admin/supervisor/sites/c1", contractId: "c1", office: false });
  const line = (key: string) => { const entry = entries.find(e => e.id === key)!; return `${entry.who} ${entry.what}${entry.detail ? ` — ${entry.detail}` : ""}`; };
  assert.equal(line("daywork-event:1"), "You recorded daywork DW-3 — Tile the bin store wall");
  assert.equal(line("daywork-event:2"), "Sam Patel asked for more detail on DW-3 — Which day was the saw on site?");
  assert.equal(line("daywork-event:3"), "Sam Patel priced DW-3");
  assert.equal(entries[0].href, "/admin/supervisor/sites/c1/dayworks/d1");
});

// --- Photographs ----------------------------------------------------------------------------
test("a photo retry may find its object already stored; every other upload failure is a failure", () => {
  for (const error of [{ status: 409 }, { status: 400, statusCode: "409" }, { code: "ResourceAlreadyExists" }, { message: "The resource already exists" }])
    assert.equal(alreadyStored(error), true, JSON.stringify(error));
  for (const error of [null, { status: 503, statusCode: "503", message: "Simulated lost storage connection" }, { status: 403, message: "new row violates row-level security policy" }])
    assert.equal(alreadyStored(error), false, JSON.stringify(error));
  const route = source("app/api/supervisor/dayworks/[id]/photos/route.ts");
  assert.match(route, /if\(upload\.error && !alreadyStored\(upload\.error\)\)/, "an upload failure is handled, not ignored");
  assert.ok(route.indexOf("verifyStoredEvidence(") < route.indexOf('rpc("complete_daywork_photo"'), "the stored bytes are checked before completion");
  assert.doesNotMatch(source("app/admin/supervisor/daywork-actions.ts"), /photo/i, "saving or sending a daywork never depends on photographs");
});

test("without photo storage, a photograph is refused before anything is reserved and the daywork stays saved", () => {
  const route = source("app/api/supervisor/dayworks/[id]/photos/route.ts");
  const unavailable = route.indexOf("catch { return NextResponse.json({error:\"Photographs cannot be saved here yet. The daywork is saved without them");
  assert.ok(unavailable > route.indexOf("createStorageVerifier()"), "a missing storage key is answered with a plain message, not an error page");
  assert.ok(unavailable < route.indexOf('rpc("reserve_daywork_photo"'), "nothing is reserved when photographs cannot be verified");
  assert.doesNotMatch(route, /from\("dayworks"\)|rpc\("(create|send|save)_daywork/, "the photo route never changes the daywork itself");
});

// --- Money stays with money access; screens stay hidden until the migration is applied --------
test("money is read only for money access, and dayworks stay hidden until their migration is applied", () => {
  const record = source("app/admin/supervisor/sites/[id]/dayworks/[dayworkId]/page.tsx");
  assert.match(record, /money \? dayworkMoneyFor\(supabase, id\) : Promise\.resolve\(null\)/);
  assert.match(record, /\{money && moneyRecords && <section className=\{styles\.panel\} aria-label="Charge">/);
  assert.match(source("app/admin/contracts/[id]/page.tsx"), /financial \? dayworkMoneyFor\(supabase, id\) : Promise\.resolve\(null\)/);
  for (const file of ["lib/operations/next-actions/office-snapshot.ts", "lib/operations/next-actions/snapshot-data.ts", "lib/operations/activity-data.ts",
    "app/admin/supervisor/sites/[id]/commercial/page.tsx", "components/site/daywork-lines.tsx", "lib/operations/next-actions/rules.ts"])
    assert.doesNotMatch(source(file), /contract_daywork_rates|daywork_pricings|daywork_pricing_lines|daywork_commercial_approvals|dayworkMoneyFor/, file);
  assert.match(source("lib/operations/daywork-data.ts"), /if \(missing\(dayworks\.error\)\) return null;/);
  assert.match(source("components/site/next-actions-today.tsx"), /snapshot\.dayworks \? <Link/);
  assert.match(source("lib/operations/next-actions/office-snapshot.ts"), /optionalRows\("dayworks"/);
  assert.match(source("app/admin/supervisor/sites/[id]/report/page.tsx"), /\{dayworks && <>/);
  for (const file of ["lib/operations/daywork-data.ts", "lib/operations/activity-data.ts", "lib/operations/next-actions/office-snapshot.ts", "lib/operations/next-actions/snapshot-data.ts"])
    assert.doesNotMatch(source(file), /\.(insert|update|upsert|delete)\(|\.rpc\("(create_daywork|save_daywork|send_daywork|decide_daywork|record_daywork|price_daywork|approve_daywork)/);
  // Every daywork write goes through its reviewed function.
  const actions = source("app/admin/supervisor/daywork-actions.ts");
  for (const name of ["create_daywork", "save_daywork_lines", "send_daywork", "decide_daywork", "record_daywork_signoff", "record_daywork_client_authorisation",
    "save_daywork_rate", "price_daywork", "approve_daywork_charge"]) assert.match(actions, new RegExp(`\\.rpc\\("${name}"`));
  assert.doesNotMatch(actions, /from\("(dayworks|daywork_\w+|contract_daywork_rates)"\)\.(insert|update|upsert|delete)/);
});
