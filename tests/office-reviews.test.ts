import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import { buildActivity, type ActivitySources } from "../lib/operations/activity";
import { itemState, outstandingQa, reviewLine, unacknowledgedInstructions, type OfficeItem, type OfficeReview, type OfficeWithdrawal } from "../lib/operations/daily";
import { officeItemInput, reviewInput } from "../lib/operations/daily-input";
import { ValidationError } from "../lib/operations/validation";
import { actionHref, adminActionHref, buildQueue, compute, siteUpdates, type NextActionSnapshot, type OfficeItemRow, type ViewerAction } from "../lib/operations/next-actions";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const make = () => Data.make("start") as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => s.members.find(m => m.display_name.startsWith(first))!;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const instruction = (s: NextActionSnapshot, over: Partial<OfficeItemRow>): OfficeItemRow => ({
  id: "m1", contract_id: "c1", kind: "instruction", title: "Kitchen grout first", body: "Grout the kitchen first thing.", recipient_id: who(s, "Dave").user_id,
  acknowledgement_required: true, work_area_id: null, stage: null, created_by: who(s, "Sam").user_id, created_at: `${s.today}T08:00:00+00:00`, due_on: null, ...over,
});
const ofRule = (actions: ViewerAction[], rule: string) => actions.filter(a => a.rule === rule);

// --- M2: changed, urgent and withdrawn instructions ------------------------------------------
test("a changed instruction replaces the old one on Supervisor Today and says what it replaces", () => {
  const s = make();
  s.supervisor_office_items = [instruction(s, {}), instruction(s, { id: "m2", title: "CHANGE: bathroom floor first", body: "Screed fix moved to 7:30.", replaces_id: "m1" })];
  s.supervisor_office_acknowledgements = [];
  const site = ofRule(compute(s, who(s, "Dave")), "R05");
  assert.deepEqual(site.map(a => a.title), ["Changed: CHANGE: bathroom floor first"], "the replaced version no longer asks for a reply");
  assert.match(site[0].why, /This replaces “Kitchen grout first”\.$/);
  const office = ofRule(compute(s, who(s, "Sam")), "R05");
  assert.deepEqual(office.map(a => [a.id, a.state]), [["ack:m2", "waiting"]], "the office waits only for the latest version");
});

test("an urgent instruction sits above everything except a safety stop", () => {
  const s = make();
  s.supervisor_office_items = [instruction(s, { urgent: true, title: "Stop grouting: wrong colour delivered" })];
  s.supervisor_office_acknowledgements = [];
  const actions = compute(s, who(s, "Dave"));
  const urgent = actions.find(a => a.rule === "R05")!;
  assert.equal(urgent.title, "Urgent: Stop grouting: wrong colour delivered");
  assert.equal(urgent.priority, 0);
  const ready = actions.filter(a => a.state === "ready");
  const position = ready.indexOf(urgent);
  assert.ok(ready.slice(0, position).every(a => a.priority === 0 && a.rule.startsWith("G")), "only safety gates come before it");
  assert.ok(ready.slice(position + 1).every(a => a.priority >= 0), "everything else follows it");
  assert.equal(buildQueue(actions).next?.id, ready[0].id);
});

test("a withdrawn instruction or inspection request leaves Today for both sides", () => {
  const s = make();
  const dave = who(s, "Dave");
  s.supervisor_office_items = [instruction(s, {}), instruction(s, { id: "q1", kind: "qa_request", title: "Kitchen ready?", acknowledgement_required: false, work_area_id: s.work_areas[0].id, stage: "installation" })];
  s.supervisor_office_acknowledgements = [];
  s.supervisor_qa_submissions = [];
  assert.equal(ofRule(compute(s, dave), "R05").length + ofRule(compute(s, dave), "R16").length, 2);
  s.office_item_withdrawals = [{ item_id: "m1" }, { item_id: "q1" }];
  assert.deepEqual([...ofRule(compute(s, dave), "R05"), ...ofRule(compute(s, dave), "R16")], []);
  assert.deepEqual([...ofRule(compute(s, who(s, "Sam")), "R05"), ...ofRule(compute(s, who(s, "Sam")), "R16")], []);
});

test("the original dashboard and the item state agree on changed and withdrawn messages", () => {
  const base: Omit<OfficeItem, "id" | "kind" | "title"> = { contract_id: "c1", body: "Body", recipient_id: "u-dave", recipient_name: "Dave", acknowledgement_required: true,
    work_area_id: null, location_path: [], stage: null, work_package_id: null, due_on: null, created_by: "u-sam", created_by_name: "Sam", created_at: "2026-10-23T08:00:00Z", request_key: "k" };
  const items: OfficeItem[] = [{ ...base, id: "a", kind: "instruction", title: "Old" }, { ...base, id: "b", kind: "instruction", title: "New", replaces_id: "a" },
    { ...base, id: "c", kind: "instruction", title: "Cancelled" }, { ...base, id: "q", kind: "qa_request", title: "Check" }];
  const withdrawals: OfficeWithdrawal[] = [{ id: "w", item_id: "c", reason: "Not needed", withdrawn_by: "u-sam", withdrawn_by_name: "Sam", withdrawn_at: "2026-10-23T09:00:00Z", request_key: "k" },
    { id: "w2", item_id: "q", reason: "Work not ready", withdrawn_by: "u-sam", withdrawn_by_name: "Sam", withdrawn_at: "2026-10-23T09:00:00Z", request_key: "k2" }];
  assert.equal(itemState(items[0], items, withdrawals).state, "replaced");
  assert.equal(itemState(items[1], items, withdrawals).state, "current");
  assert.equal(itemState(items[2], items, withdrawals).state, "withdrawn");
  assert.deepEqual(unacknowledgedInstructions(items, [], "u-dave", withdrawals).map(item => item.id), ["b"]);
  assert.deepEqual(outstandingQa(items, [], withdrawals), []);
  assert.deepEqual(unacknowledgedInstructions(items, [], "u-dave").map(item => item.id), ["b", "c"], "without withdrawals installed, only changes apply");
});

test("the message form sends the new fields only when they are used", () => {
  const fields = { contract_id: id(1), kind: "instruction", title: "Title", body: "Body", acknowledgement_required: "on" };
  const plain = officeItemInput(form(fields));
  assert.ok(!("urgent" in plain) && !("replaces_id" in plain), "a database without instruction changes receives exactly the fields it knows");
  const changed = officeItemInput(form({ ...fields, urgent: "on", replaces_id: id(2) }));
  assert.equal(changed.urgent, true);
  assert.equal(changed.replaces_id, id(2));
  assert.throws(() => officeItemInput(form({ ...fields, kind: "qa_request", recipient_id: id(3), work_area_id: id(4), stage: "installation", replaces_id: id(2) })), ValidationError);
  assert.ok(!("urgent" in officeItemInput(form({ ...fields, kind: "qa_request", recipient_id: id(3), work_area_id: id(4), stage: "installation", urgent: "on" }))),
    "an inspection request is never urgent");
});

// --- M3: office reviews -------------------------------------------------------------------------
const result = (s: NextActionSnapshot) => ({ item_id: "q1", submission_id: "r1", contract_id: "c1", title: "Splashback ready for grout?", location_path: ["Flat 1", "Kitchen"],
  inspection_id: "i1", has_issues: true, submitted_at: `${s.today}T11:00:00+00:00`, submitted_by_name: "Dave Collins", followed_up: false });
const note = (s: NextActionSnapshot) => ({ id: "h1", contract_id: "c1", actor_name: "Dave Collins", work_date: s.today, created_at: `${s.today}T16:00:00+00:00`,
  outstanding_problems: "", areas_awaiting_attention: "", office_notes: "Possible daywork: bin store wall." });

test("once reviews exist, results with problems and handovers with notes are office Next Actions until reviewed", () => {
  const s = make();
  const sam = who(s, "Sam"), dave = who(s, "Dave");
  s.qa_results = [result(s), { ...result(s), item_id: "q2", submission_id: "r2", has_issues: false }, { ...result(s), item_id: "q3", submission_id: "r3", submitted_at: "2020-01-01T10:00:00+00:00" }];
  s.handover_notes = [note(s), { ...note(s), id: "h2", office_notes: "" }];
  s.office_reviews = [];
  const office = compute(s, sam);
  const review = ofRule(office, "R18"), read = ofRule(office, "R19");
  assert.deepEqual(review.map(a => [a.title, a.state]), [["Review the inspection result: Splashback ready for grout?", "ready"]]);
  assert.deepEqual(read.map(a => [a.title, a.state]), [["Read Dave Collins’s handover", "ready"]]);
  assert.equal(read[0].why, "Today. For the office: Possible daywork: bin store wall.");
  assert.equal(adminActionHref(review[0]), "/admin/supervisor/sites/c1/tasks/q1");
  assert.equal(adminActionHref(read[0]), "/admin/supervisor/sites/c1/messages?handover=h1#handover-h1");
  assert.deepEqual(siteUpdates(s, sam), [], "the From site list gives way to real actions");
  const site = compute(s, dave);
  assert.deepEqual(ofRule(site, "R18").map(a => [a.state, a.responsible.label]), [["waiting", "Office"]], "the supervisor sees their result waiting for the office");
  assert.deepEqual(ofRule(site, "R19"), [], "handover reviews are the office's alone");
  assert.equal(actionHref(ofRule(site, "R18")[0], "/admin/supervisor/sites/c1"), "/admin/supervisor/sites/c1/tasks/q1");
  s.office_reviews = [{ qa_submission_id: "r1", handover_id: null }, { qa_submission_id: null, handover_id: "h1" }];
  assert.deepEqual([...ofRule(compute(s, sam), "R18"), ...ofRule(compute(s, sam), "R19"), ...ofRule(compute(s, dave), "R18")], [], "a saved review completes it");
});

test("without reviews in the database, nothing becomes an action and the From site list stays", () => {
  const s = make();
  s.qa_results = [result(s)];
  s.handover_notes = [note(s)];
  const office = compute(s, who(s, "Sam"));
  assert.deepEqual([...ofRule(office, "R18"), ...ofRule(office, "R19")], []);
  assert.deepEqual(siteUpdates(s, who(s, "Sam")).map(u => u.id), ["handover:h1", "qa-result:q1"]);
});

test("a review records what the office did, and a linked record must match it", () => {
  const fields = { contract_id: id(1), subject: "qa_result", subject_id: id(2), outcome: "snag_raised", note: "  Gang to replace two cuts.  " };
  const plain = reviewInput(form(fields));
  assert.deepEqual(plain, { contract_id: id(1), data: { subject: "qa_result", subject_id: id(2), outcome: "snag_raised", note: "Gang to replace two cuts." } });
  assert.equal(reviewInput(form({ ...fields, follow_up: `snag_raised:${id(3)}` })).data.follow_up_id, id(3));
  assert.throws(() => reviewInput(form({ ...fields, follow_up: `instruction_sent:${id(3)}` })), /does not match/);
  assert.throws(() => reviewInput(form({ ...fields, outcome: "approved" })), ValidationError, "a review is never an approval");
  assert.throws(() => reviewInput(form({ ...fields, subject: "snag" })), ValidationError);
  const review: OfficeReview = { id: "v", contract_id: "c1", qa_submission_id: id(2), handover_id: null, outcome: "instruction_sent", note: "", follow_up_id: null,
    reviewed_by: "u-sam", reviewed_by_name: "Sam Patel", reviewed_at: "2026-10-23T10:20:00Z", request_key: "k" };
  assert.equal(reviewLine(review, () => "11:20"), "Reviewed by Sam Patel at 11:20: Instruction sent.");
});

// --- Job activity -----------------------------------------------------------------------------
const empty: ActivitySources = { snagEvents: [], snags: [], holdEvents: [], holds: [], messages: [], acknowledgements: [], results: [], handovers: [],
  morningChecks: [], inspections: [], plans: [], documents: [] };

test("job activity tells the story of changes, withdrawals and reviews", () => {
  const message = { kind: "instruction", body: "Body", created_by: "u-sam", created_by_name: "Sam Patel", recipient_name: "Dave Collins", location_path: [], due_on: null };
  const entries = buildActivity({
    ...empty,
    messages: [{ ...message, id: "m1", title: "Kitchen grout first", created_at: "2026-10-23T08:00:00+00:00" },
      { ...message, id: "m2", title: "Bathroom floor first", created_at: "2026-10-23T08:30:00+00:00", replaces_id: "m1", urgent: true },
      { ...message, id: "q1", kind: "qa_request", title: "Splashback ready?", location_path: ["Kitchen"], created_at: "2026-10-23T09:00:00+00:00" }],
    withdrawals: [{ id: "w1", item_id: "m2", reason: "Main contractor cancelled", withdrawn_by: "u-sam", withdrawn_by_name: "Sam Patel", withdrawn_at: "2026-10-23T12:00:00+00:00" }],
    results: [{ id: "r1", item_id: "q1", submitted_by: "u-dave", submitted_at: "2026-10-23T10:00:00+00:00", has_issues: true }],
    handovers: [{ id: "h1", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-23T16:00:00+00:00", work_completed: "", outstanding_problems: "",
      areas_awaiting_attention: "", office_notes: "Possible daywork." }],
    reviews: [{ id: "v1", qa_submission_id: "r1", handover_id: null, outcome: "snag_raised", note: "Two cuts to replace.", reviewed_by: "u-sam", reviewed_by_name: "Sam Patel", reviewed_at: "2026-10-23T11:00:00+00:00" },
      { id: "v2", qa_submission_id: null, handover_id: "h1", outcome: "noted", note: "", reviewed_by: "u-sam", reviewed_by_name: "Sam Patel", reviewed_at: "2026-10-23T17:00:00+00:00" }],
  }, { viewerId: "u-dave", names: new Map(), siteBase: "/admin/supervisor/sites/c1", contractId: "c1", office: false });
  const line = (key: string) => { const entry = entries.find(e => e.id === key)!; return `${entry.who} ${entry.what}`; };
  assert.equal(line("message:m2"), "Sam Patel changed “Kitchen grout first” to Dave Collins: “Bathroom floor first” (urgent)");
  assert.equal(line("withdrawal:w1"), "Sam Patel withdrew the instruction “Bathroom floor first”");
  assert.equal(entries.find(e => e.id === "withdrawal:w1")!.detail, "Main contractor cancelled");
  assert.equal(line("review:v1"), "Sam Patel reviewed the inspection result for “Splashback ready?”: snag raised");
  assert.equal(entries.find(e => e.id === "review:v1")!.href, "/admin/supervisor/sites/c1/tasks/q1");
  assert.equal(line("review:v2"), "Sam Patel reviewed your handover: noted");
  assert.equal(entries.find(e => e.id === "review:v2")!.href, "/admin/supervisor/sites/c1/finish");
});

test("review and change screens stay hidden until their migration is applied", () => {
  const messages = source("app/admin/supervisor/sites/[id]/messages/page.tsx");
  assert.match(messages, /office && followUp && current && <div className=\{styles\.cardList\}><ChangeInstructionForm/);
  assert.match(messages, /: followUp && <ReviewForm subject="handover"/);
  assert.match(source("app/admin/supervisor/sites/[id]/tasks/[taskId]/page.tsx"), /daily!\.followUp && <section className=\{styles\.panel\} aria-label="Office review"/);
  assert.match(source("lib/operations/daily-data.ts"), /const followUp = !missing\(withdrawals\.error\) && !missing\(reviews\.error\)/);
  assert.match(source("lib/operations/next-actions/office-snapshot.ts"), /optionalRows\("office_reviews"/);
  // Reading pages and loaders never write.
  for (const file of ["lib/operations/review-data.ts", "lib/operations/activity-data.ts", "lib/operations/next-actions/office-snapshot.ts"])
    assert.doesNotMatch(source(file), /\.(insert|update|upsert|delete)\(|\.rpc\("(record_office_review|withdraw_supervisor_office_item|create_supervisor_office_item)/);
});
