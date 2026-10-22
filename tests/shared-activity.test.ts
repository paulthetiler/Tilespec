import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import { buildActivity, type ActivitySources } from "../lib/operations/activity";
import { compute, configFromEnv, DEFAULT_CONFIG, siteUpdates, type NextActionSnapshot, type SnagRow } from "../lib/operations/next-actions";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const make = () => Data.make("start") as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => s.members.find(m => m.display_name.startsWith(first))!;
const snag = (over: Partial<SnagRow>): SnagRow => ({ id: "sn1", contract_id: "c1", work_area_id: "l-f31-bath", check_label: "Substrate/preparation issues",
  description: "Screed high spot by the shower tray.", severity: "major", snag_status: "open", assigned_team_id: null, target_date: null, raised_by: "u-dave",
  rectified_by: null, escalated: false, responsibility_state: null, responsibility_team_id: null, assigned_action: null, ...over });

// --- Job Activity -------------------------------------------------------------------
const empty: ActivitySources = { snagEvents: [], snags: [], holdEvents: [], holds: [], messages: [], acknowledgements: [], results: [], handovers: [],
  morningChecks: [], inspections: [], plans: [], documents: [] };
const options = { viewerId: "u-dave", names: new Map([["u-sam", "Sam Patel"]]), siteBase: "/admin/supervisor/sites/c1", contractId: "c1", office: false };

test("job activity tells one story, newest first, in plain English with links to the saved records", () => {
  const entries = buildActivity({
    ...empty,
    snags: [{ id: "sn1", check_label: "Substrate/preparation issues", location: "Block A › Flat 1 › Bathroom" }],
    snagEvents: [
      { id: 1, issue_id: "sn1", action: "submit", note: "Screed high spot.", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-22T08:00:00+00:00" },
      { id: 2, issue_id: "sn1", action: "assign", note: "Office reviewed the photo.", actor_id: "u-sam", actor_name: "Sam Patel", created_at: "2026-10-22T09:00:00+00:00",
        assigned_action: "Grind the high spot, then re-check level.", target_date: "2026-10-23", assigned_party: "Kowalski gang" },
    ],
    messages: [{ id: "m1", kind: "instruction", title: "Kitchen first today", body: "Screed is ground tomorrow.", created_by: "u-sam", created_by_name: "Sam Patel",
      recipient_name: "Dave Collins", location_path: [], due_on: null, created_at: "2026-10-22T09:05:00+00:00" }],
    acknowledgements: [{ id: "a1", item_id: "m1", actor_id: "u-dave", acknowledged_at: "2026-10-22T09:10:00+00:00" }],
  }, options);
  assert.deepEqual(entries.map(e => e.id), ["ack:a1", "message:m1", "snag-event:2", "snag-event:1"]);
  assert.deepEqual(entries.map(e => `${e.who} ${e.what}`), [
    "You acknowledged “Kitchen first today”",
    "Sam Patel sent an instruction to Dave Collins: “Kitchen first today”",
    "Sam Patel asked Kowalski gang to fix a snag: Substrate/preparation issues at Block A › Flat 1 › Bathroom",
    "You reported a snag: Substrate/preparation issues at Block A › Flat 1 › Bathroom",
  ]);
  assert.equal(entries[2].detail, "Repair: Grind the high spot, then re-check level. · Target 2026-10-23");
  assert.equal(entries[2].href, "/admin/snags/sn1");
  assert.equal(entries[1].href, "/admin/supervisor/sites/c1/messages#message-m1");
});

test("job activity covers results, handovers, checks, inspections, plans, stops and documents", () => {
  const entries = buildActivity({
    ...empty,
    messages: [{ id: "q1", kind: "qa_request", title: "Splashback ready for grout?", body: "Check before grouting.", created_by: "u-sam", created_by_name: "Sam Patel",
      recipient_name: "Dave Collins", location_path: ["Flat 1", "Kitchen"], due_on: "2026-10-23", created_at: "2026-10-22T10:00:00+00:00" }],
    results: [{ id: "r1", item_id: "q1", submitted_by: "u-dave", submitted_at: "2026-10-22T11:00:00+00:00", has_issues: true }],
    handovers: [{ id: "h1", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-22T16:00:00+00:00", work_completed: "Kitchen tiled.",
      outstanding_problems: "", areas_awaiting_attention: "", office_notes: "Possible daywork: bin store wall." }],
    morningChecks: [{ id: "mc1", actor_id: "u-dave", created_at: "2026-10-22T07:40:00+00:00", issues_count: 1 }],
    inspections: [{ id: "i1", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-22T10:55:00+00:00", issues_count: 0, location: "Flat 1 › Kitchen" }],
    plans: [{ id: "p2", team: "Kowalski gang", location: "Flat 1 › Bathroom", planned_start: "2026-10-23", planned_end: "2026-10-23", instructions: "Bathroom first.",
      created_by: "u-sam", created_at: "2026-10-22T12:00:00+00:00", supersedes_id: "p1", cancelled_at: null, cancelled_by: null }],
    holds: [{ id: "w1", hold_type: "safety", location: "Flat 1 › Bathroom" }],
    holdEvents: [{ id: 9, hold_id: "w1", action: "raise", note: "Unsafe access.", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-22T13:00:00+00:00" }],
    documents: [{ id: "d1", title: "Kitchen layout", revision: 2, created_by: "u-sam", uploaded_at: "2026-10-22T06:00:00+00:00" }],
  }, options);
  const line = (id: string) => entries.find(e => e.id === id)!;
  assert.equal(line("result:r1").what, "sent the inspection result for “Splashback ready for grout?”: problems found");
  assert.equal(line("result:r1").tone, "problem");
  assert.equal(line("message:q1").what, "asked Dave Collins to inspect at Flat 1 › Kitchen: “Splashback ready for grout?”");
  assert.equal(line("handover:h1").detail, "For the office: Possible daywork: bin store wall.");
  assert.equal(line("handover:h1").href, "/admin/supervisor/sites/c1/finish", "a supervisor reads handovers on Finish today");
  assert.equal(line("morning:mc1").detail, "1 problem reported to the office");
  assert.equal(line("inspection:i1").what, "inspected at Flat 1 › Kitchen: all checks passed");
  assert.equal(line("plan:p2").what, "changed the plan: Kowalski gang at Flat 1 › Bathroom for 2026-10-23");
  assert.equal(line("hold-event:9").what, "stopped work (safety stop) at Flat 1 › Bathroom");
  assert.equal(line("hold-event:9").tone, "stop");
  assert.equal(line("document:d1").href, "/admin/documents/d1");
  const office = buildActivity({ ...empty, handovers: [{ id: "h1", actor_id: "u-dave", actor_name: "Dave Collins", created_at: "2026-10-22T16:00:00+00:00",
    work_completed: "", outstanding_problems: "", areas_awaiting_attention: "", office_notes: "" }] }, { ...options, viewerId: "u-sam", office: true });
  assert.equal(office[0].href, "/admin/messages?contract_id=c1#handover-h1", "the office reads handovers in Messages");
  assert.equal(office[0].who, "Dave Collins");
});

test("job activity reads only, is shared by office and supervisor, and stays behind the opt-in", () => {
  const loader = source("lib/operations/activity-data.ts");
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(loader), "no writes");
  assert.deepEqual(loader.match(/\.rpc\("[a-z_]+"/g), ['.rpc("snag_events"'], "the only function call is the existing read-only snag history, with its own permission check");
  assert.ok(!/from\("supervisor_issue_events"\)/.test(loader), "snag history is never read past its revoked table grant");
  assert.match(loader, /checkDatabase\(result\.error\)/, "a failed read is an error, not an empty timeline");
  const page = source("app/admin/supervisor/sites/[id]/activity/page.tsx");
  assert.match(page, /requireSite\(id\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(source("components/site/next-actions-today.tsx"), /\$\{base\}\/activity/, "supervisor reaches it from Today");
  assert.match(source("app/admin/contracts/[id]/page.tsx"), /\/activity`\}>Job activity/, "office reaches it from the job");
});

// --- Office Today: what came back from site ----------------------------------------------
test("office sees inspection results with problems and handovers with notes, until a snag or stop is raised or the window passes", () => {
  const s = make();
  const sam = who(s, "Sam"), dave = who(s, "Dave");
  const result = { item_id: "q1", contract_id: "c1", title: "Splashback ready for grout?", location_path: ["Flat 1", "Kitchen"], inspection_id: "i1", has_issues: true,
    submitted_at: `${s.today}T11:00:00+00:00`, submitted_by_name: "Dave Collins", followed_up: false };
  const note = { id: "h1", contract_id: "c1", actor_name: "Dave Collins", work_date: s.today, created_at: `${s.today}T16:00:00+00:00`,
    outstanding_problems: "Lippage at the socket.", areas_awaiting_attention: "", office_notes: "Possible daywork: bin store wall." };
  s.qa_results = [result, { ...result, item_id: "q2", has_issues: false }, { ...result, item_id: "q3", followed_up: true },
    { ...result, item_id: "q4", submitted_at: "2020-01-01T10:00:00+00:00" }];
  s.handover_notes = [note, { ...note, id: "h2", outstanding_problems: "", office_notes: "" }];
  const updates = siteUpdates(s, sam);
  assert.deepEqual(updates.map(u => u.id), ["handover:h1", "qa-result:q1"]);
  assert.equal(updates[0].title, "Handover from Dave Collins: notes for the office, problems");
  assert.equal(updates[0].detail, "For the office: Possible daywork: bin store wall.");
  assert.equal(updates[1].title, "Inspection found problems: Splashback ready for grout?");
  assert.equal(updates[1].href, "/admin/supervisor/sites/c1/tasks/q1");
  assert.deepEqual(siteUpdates(s, dave), [], "supervisors are not shown the office's list");
  assert.equal(configFromEnv({ NEXT_ACTIONS_SITE_UPDATE_DAYS: "3" }).siteUpdateDays, 3);
  assert.equal(configFromEnv({ NEXT_ACTIONS_SITE_UPDATE_DAYS: "99" }).siteUpdateDays, DEFAULT_CONFIG.siteUpdateDays, "bad values are ignored");
  const today = source("components/admin/admin-today.tsx");
  assert.match(today, /siteUpdates\(snapshot, viewer, settings\)/, "Office Today renders the list");
  assert.match(source("lib/operations/next-actions/office-snapshot.ts"), /qa_results:[\s\S]*handover_notes:/, "the office loader supplies both");
});

// --- One owner for each action, and the office's instructions on site --------------------
test("a reported snag has one owner: the office chooses who fixes it and the supervisor sees it waiting", () => {
  const s = make();
  s.supervisor_issues = [snag({})];
  const office = compute(s, who(s, "Sam")).find(a => a.rule === "R13")!;
  const site = compute(s, who(s, "Dave")).find(a => a.rule === "R13")!;
  assert.equal(office.state, "ready");
  assert.equal(site.state, "waiting");
  assert.equal(site.responsible.label, "Office");
});

test("the supervisor sees the office's repair instructions and target date on the snag and the stop", () => {
  const s = make();
  s.supervisor_issues = [snag({ snag_status: "assigned", assigned_team_id: "t1", target_date: "2026-10-23", assigned_action: "Grind the high spot, then re-check level." })];
  s.work_holds = [{ id: "w1", contract_id: "c1", work_area_id: "l-f31-bath", hold_type: "quality", status: "active", reason: "Screed not level.",
    required_action: "Grind and re-level before tiling.", raised_by: "u-sam", corrected_by: null, assigned_team_id: "t1", assigned_operative_id: null,
    target_date: "2026-10-23", critical_snags_open: false }];
  const actions = compute(s, who(s, "Dave"));
  const fix = actions.find(a => a.rule === "S03")!;
  assert.equal(fix.instruction, "Grind the high spot, then re-check level.");
  assert.equal(fix.due, "2026-10-23");
  const stop = actions.find(a => a.rule === "G03")!;
  assert.equal(stop.instruction, "Grind and re-level before tiling.");
  assert.equal(stop.why, "Screed not level.");
  assert.match(source("components/site/next-actions-today.tsx"), /Office instructions: \{a\.instruction\}/, "shown on each row, including waiting rows");
});

test("duplicate navigation and actions are gone when the new screens are on", () => {
  const office = source("components/admin/admin-today.tsx");
  assert.match(office, /\{!tabs && <>[\s\S]*Job setup[\s\S]*People and workforce[\s\S]*Paperwork[\s\S]*<\/>\}/, "no shortcuts that repeat the tab bar");
  assert.match(source("app/admin/snags/new/page.tsx"), /offerStop=\{!\(simple&&flagEnabled\("nextActions",member\.role\)\)\}/, "no second Stop Work choice after Report an issue");
  assert.match(source("app/admin/snags/[id]/page.tsx"), /reportFlow\?"Stop work for this snag"/, "escalating a snag stays available, not as a big duplicate button");
  const messages = source("app/admin/supervisor/sites/[id]/messages/page.tsx");
  assert.ok(!/>Back to today</.test(messages), "the site bar already offers ← Today");
  assert.match(messages, /Acknowledged by \{nameOf\.get\(row\.actor_id\)/, "the office sees who acknowledged and when");
  assert.match(source("app/admin/messages/page.tsx"), /Acknowledged by \$\{nameOf\.get\(row\.actor_id\)/);
});
