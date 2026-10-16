// Run with:  node --test docs/redesign/prototype/rules.test.mjs
// These check the DESIGN of the Next Action rules against the illustrative
// scenario data. They are not wired into `npm test` and touch no application code.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Data = require("./data.js");
const Rules = require("./rules.js");

const who = (s, first) => s.members.find((m) => m.display_name.startsWith(first));
const ids = (list) => list.map((a) => a.rule);
const ready = (list) => list.filter((a) => a.state === "ready");

test("every action carries the fields the brief requires", () => {
  for (const scenario of ["start", "busy"]) {
    const s = Data.make(scenario);
    for (const m of s.members) {
      for (const a of Rules.compute(s, m)) {
        assert.ok(a.id && a.rule && a.process, "identity");
        assert.ok(["gate", "reminder"].includes(a.kind), `kind on ${a.id}`);
        assert.ok(a.job && "name" in a.job, `job on ${a.id}`);
        assert.ok(a.responsible && a.responsible.role && a.responsible.label, `responsible on ${a.id}`);
        assert.ok(a.title && a.why, `plain-English text on ${a.id}`);
        assert.ok([0, 1, 2, 3].includes(a.priority), `priority on ${a.id}`);
        assert.ok(Array.isArray(a.requires) && a.requires.length, `requires on ${a.id}`);
        assert.ok(a.doneWhen, `completion condition on ${a.id}`);
        assert.ok(a.source && a.source.table, `source record on ${a.id}`);
      }
    }
  }
});

test("a quiet morning: the supervisor starts with the morning checks, nothing is invented", () => {
  const s = Data.make("start");
  const dave = who(s, "Dave");
  const list = Rules.compute(s, dave);
  const first = Rules.nextAction(list);
  assert.equal(first.rule, "R01");
  assert.equal(first.kind, "reminder");
  assert.equal(list.filter((a) => a.state === "ready").length, 4); // checks, read instruction, confirm gang, inspect
});

test("saving the morning checks changes the next action, no manual tick-box", () => {
  const s = Data.make("start");
  const dave = who(s, "Dave");
  s.supervisor_inspections.push({ id: "mc", contract_id: "c1", actor_id: dave.user_id, created_at: "2026-10-15T07:50:00Z", issues_count: 0 });
  assert.ok(!ids(Rules.compute(s, dave)).includes("R01"));
  assert.equal(Rules.nextAction(Rules.compute(s, dave)).rule, "R05");
  assert.equal(Rules.savedToday(s, dave)[0].label, "Morning checks");
});

test("mandatory inspection stays a gate until a passing inspection is SAVED", () => {
  const s = Data.make("start");
  const dave = who(s, "Dave");
  assert.ok(Rules.compute(s, dave).some((a) => a.rule === "G07" && a.kind === "gate" && a.state === "ready"));
  s.location_inspections.push({ id: "li", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", created_at: "2026-10-15T08:30:00Z", issues_count: 0 });
  assert.ok(!ids(Rules.compute(s, dave)).includes("G07"));
  s.location_inspections.push({ id: "li2", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", created_at: "2026-10-15T09:30:00Z", issues_count: 2 });
  const failed = Rules.compute(s, dave).find((a) => a.rule === "G06");
  assert.ok(failed, "a later failed inspection re-opens the gate");
  assert.equal(failed.priority, 1);
});

test("unknown inspection applicability is a gate for the office, never treated as allowed", () => {
  const s = Data.make("start");
  const sam = who(s, "Sam");
  const a = Rules.compute(s, sam).filter((x) => x.rule === "G08");
  assert.equal(a.length, 2);
  assert.ok(a.every((x) => x.kind === "gate" && x.state === "ready"));
});

test("a hold release is only ever offered as a decision for an independent person", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam"), alex = who(s, "Alex"), dave = who(s, "Dave"), marek = who(s, "Marek");
  const h2 = (u) => Rules.compute(s, u).find((a) => a.id === "hold-release:h2");
  const h1 = (u) => Rules.compute(s, u).find((a) => a.id === "hold-release:h1");
  assert.equal(h1(alex).state, "ready");
  assert.equal(h1(sam).state, "ready");
  assert.equal(h1(dave).state, "waiting", "the supervisor cannot decide");
  assert.equal(h1(marek).state, "waiting", "the gang cannot decide");
  assert.equal(h2(sam).state, "blocked", "Sam raised h2");
  assert.match(h2(sam).blockedBy, /someone else/);
  assert.equal(h2(alex).state, "blocked", "critical defect still open on that work");
  assert.match(h2(alex).blockedBy, /critical defect/);
});

test("the engine never completes, approves or releases anything", () => {
  const s = Data.make("busy");
  const before = JSON.stringify(s);
  for (const m of s.members) Rules.compute(s, m);
  assert.equal(JSON.stringify(s), before, "compute() is read-only");
  assert.ok(!Object.keys(Rules).some((k) => /approve|release|authorise|bypass|complete/i.test(k)));
});

test("repairer cannot re-inspect their own repair; critical repairs go to the office", () => {
  const s = Data.make("busy");
  const dave = who(s, "Dave");
  assert.equal(Rules.compute(s, dave).find((a) => a.rule === "G10").state, "ready");
  s.supervisor_issues.find((i) => i.id === "s2").rectified_by = dave.user_id;
  assert.equal(Rules.compute(s, dave).find((a) => a.rule === "G10").state, "blocked");
  s.supervisor_issues.find((i) => i.id === "s2").escalated = true;
  const sam = who(s, "Sam");
  assert.equal(Rules.compute(s, sam).find((a) => a.rule === "G10").state, "ready");
  assert.equal(Rules.compute(s, dave).find((a) => a.rule === "G10").viewerMode, "see");
});

test("subcontractor sees only their own gang's actions and no money, ever", () => {
  const s = Data.make("busy");
  const marek = who(s, "Marek");
  const list = Rules.compute(s, marek);
  assert.ok(list.length > 0);
  for (const a of list) {
    assert.ok(!a.financial, "no financial action");
    assert.ok(a.parties && a.parties.teamIds.some((t) => ["t1"].includes(t)), `own gang only: ${a.id}`);
    assert.ok(!/£|margin|budget|profit/i.test(JSON.stringify([a.title, a.why, a.requires])), `no money words in ${a.id}`);
  }
  const mason = Data.make("busy");
  mason.package_assignments.push({ contract_id: "c1", work_package_id: "p3", user_id: "u-gary" });
  mason.members.push({ user_id: "u-gary", display_name: "Gary Mason", role: "subcontract_installer", financial_access: false });
  mason.operatives.find((o) => o.id === "o4").user_id = "u-gary";
  const gary = mason.members.find((m) => m.user_id === "u-gary");
  assert.deepEqual(Rules.compute(mason, gary).filter((a) => a.state === "ready"), [], "another gang's fixes are not visible");
});

test("subcontractor's allocation comes from the plan and carries no financial data", () => {
  const s = Data.make("start");
  const marek = who(s, "Marek");
  const alloc = Rules.allocationFor(s, marek);
  assert.equal(alloc.location, "Block B › Level 3 › Flat 31 › Bathroom");
  assert.match(alloc.instructions, /Floor tiles first/);
  assert.deepEqual(Object.keys(alloc).filter((k) => /money|value|budget|cost|rate|price/i.test(k)), []);
  assert.equal(Rules.allocationFor(s, who(s, "Dave")), null);
});

test("financial information is limited to the owner and permitted office staff", () => {
  const s = Data.make("start");
  const f = (name) => Rules.compute(s, who(s, name)).filter((a) => a.rule === "R14");
  assert.equal(f("Alex").length, 1);
  assert.equal(f("Sam").length, 1, "Sam has financial_access");
  assert.equal(f("Jo").length, 0, "Jo has no financial access");
  assert.equal(f("Dave").length, 0);
  assert.equal(f("Marek").length, 0);
  assert.equal(f("Alex")[0].state, "info", "owner acceptance cannot be recorded today, so it is information, not a fake gate");
});

test("reminders and gates are distinguished and gates are not dismissible", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam");
  const list = Rules.compute(s, sam);
  assert.ok(list.some((a) => a.kind === "gate") && list.some((a) => a.kind === "reminder"));
  assert.ok(list.filter((a) => a.kind === "gate").every((a) => !("dismiss" in a) && !("snooze" in a)));
  const insurance = list.find((a) => a.rule === "G13");
  assert.equal(insurance.enforcedByBackend, false, "honest about what the database does not block today");
});

test("parallel processes run side by side without blocking each other", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam");
  const processes = new Set(Rules.compute(s, sam).map((a) => a.process));
  for (const p of ["stop-work", "snag", "inspection", "compliance", "tender", "job-setup"]) assert.ok(processes.has(p), p);
  const dave = who(s, "Dave");
  const list = Rules.compute(s, dave);
  assert.ok(ready(list).some((a) => a.process === "snag") && ready(list).some((a) => a.process === "daily-site") && ready(list).some((a) => a.process === "inspection"));
  assert.equal(new Set(list.map((a) => a.id)).size, list.length, "no duplicate action ids");
});

test("ordering is deterministic and safety comes first", () => {
  const s = Data.make("busy");
  s.work_holds.push({ id: "h9", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", hold_type: "safety", status: "active", reason: "Unsafe access.", required_action: "",
    raised_by: "u-dave", assigned_team_id: null });
  const dave = who(s, "Dave");
  const a = Rules.compute(s, dave), b = Rules.compute(s, dave);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.equal(Rules.nextAction(a).rule, "G01");
  assert.equal(Rules.nextAction(a).priority, 0);
});

test("overdue repairs create a chase for the office, and escalate to the owner only after the threshold", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam"), alex = who(s, "Alex");
  const chase = Rules.compute(s, sam).find((a) => a.rule === "R07");
  assert.equal(chase.state, "ready");
  assert.match(chase.title, /2 days late/);
  assert.ok(!Rules.compute(s, alex).some((a) => a.rule === "R07"));
  s.supervisor_issues.find((i) => i.id === "s1").target_date = "2026-10-08";
  assert.ok(Rules.compute(s, alex).some((a) => a.rule === "R07" && a.state === "waiting"));
});

test("job setup is one step at a time, in a fixed order, and ends when complete", () => {
  const s = Data.make("start");
  const sam = who(s, "Sam");
  const steps = Rules.compute(s, sam).filter((a) => a.rule === "R08" && a.job.id === "c2").map((a) => a.id.split(":")[2]);
  assert.deepEqual(steps, ["locations", "supervisor", "spec"]);
  const done = Data.make("start");
  assert.equal(Rules.compute(done, who(done, "Sam")).filter((a) => a.rule === "R08" && a.job.id === "c1").length, 0);
});

test("a login that can't see its own planned job is flagged (the double-entry problem)", () => {
  const s = Data.make("start");
  s.package_assignments = s.package_assignments.filter((a) => a.work_package_id !== "p2");
  const sam = who(s, "Sam");
  assert.ok(Rules.compute(s, sam).some((a) => a.rule === "R10" && /cannot see this job/.test(a.title)));
});

test("expired subcontractor insurance is flagged before the gang arrives, and for the supervisor once on site", () => {
  const s = Data.make("start");
  assert.ok(Rules.compute(s, who(s, "Sam")).some((a) => a.rule === "G13"));
  assert.ok(!Rules.compute(s, who(s, "Dave")).some((a) => a.rule === "G13"));
  s.actual_allocations.push({ id: "a", contract_id: "c1", team_id: "t2", work_area_id: "l-l2-corr", stage: "installation", work_date: "2026-10-15", started_at: "2026-10-15T07:30:00Z", ended_at: null, voided_at: null });
  assert.ok(Rules.compute(s, who(s, "Dave")).some((a) => a.rule === "G13" && a.state === "waiting"));
});

test("handover and morning-check escalations use the stated, adjustable thresholds", () => {
  const s = Data.make("busy");
  const dave = who(s, "Dave"), sam = who(s, "Sam");
  assert.ok(!Rules.compute(s, dave).some((a) => a.rule === "R06" && a.state === "ready"), "11:25 is too early to nag");
  s.now = "15:10";
  assert.ok(Rules.compute(s, dave).some((a) => a.rule === "R06" && a.state === "ready"));
  assert.ok(!Rules.compute(s, sam).some((a) => a.rule === "R06"));
  s.now = "17:40";
  assert.ok(Rules.compute(s, sam).some((a) => a.rule === "R06" && a.state === "waiting"));
  assert.deepEqual(Object.keys(Rules.PROPOSED_THRESHOLDS).sort(), ["handoverOfficeSeesAfter", "handoverReminderAfter", "insuranceWarningDays", "jobSetupLeadDays", "morningChecksOfficeSeesAfter", "overdueEscalatesToOwnerAfterDays", "planHorizonDays"]);
});

test("nothing to do is reported honestly as nothing", () => {
  const s = Data.make("start");
  const marek = who(s, "Marek");
  assert.equal(Rules.nextAction(Rules.compute(s, marek)), null);
});

test("an ordinary snag nobody has been told to fix always has an owner (R13)", () => {
  const s = Data.make("busy");
  s.supervisor_issues.push({ id: "s9", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", check_label: "Chipped tile", description: "Corner chip.",
    severity: "minor", snag_status: "open", assigned_team_id: null, target_date: null, raised_by: "u-dave", rectified_by: null, escalated: false });
  const dave = who(s, "Dave");
  const a = Rules.compute(s, dave).find((x) => x.id === "snag-assign:s9");
  assert.ok(a && a.state === "ready" && a.kind === "reminder");
  s.supervisor_issues.find((i) => i.id === "s9").assigned_team_id = "t1";
  const after = Rules.compute(s, dave);
  assert.ok(!after.some((x) => x.id === "snag-assign:s9"));
  assert.ok(after.some((x) => x.id === "snag-fix:s9"), "the gang now owns it");
});

test("once the office has given a critical defect to a gang it stops asking the office to review it", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam");
  assert.ok(Rules.compute(s, sam).some((x) => x.id === "snag-critical:s3" && x.state === "ready"));
  Object.assign(s.supervisor_issues.find((i) => i.id === "s3"), { snag_status: "assigned", assigned_team_id: "t1", target_date: "2026-10-18" });
  const after = Rules.compute(s, sam);
  assert.ok(!after.some((x) => x.id === "snag-critical:s3"));
  const fix = after.find((x) => x.id === "snag-fix:s3");
  assert.equal(fix.kind, "gate", "a critical repair is still a mandatory gate for the gang");
  assert.equal(fix.state, "waiting");
});

test("insurance is append-only: a renewal is a new record and the old expired one is left alone (G13, R11)", () => {
  const s = Data.make("busy");
  const sam = who(s, "Sam");
  assert.ok(Rules.compute(s, sam).some((x) => x.id === "insurance:co2"));
  const before = JSON.stringify(s.company_insurances);
  s.company_insurances.push({ id: "i9", company_id: "co2", insurance_type: "public_liability", expires_on: "2027-10-14" });
  assert.ok(!Rules.compute(s, sam).some((x) => x.id === "insurance:co2"), "latest entry per type counts");
  assert.ok(JSON.stringify(s.company_insurances).startsWith(before.slice(0, -1)), "nothing existing was edited");
});

test("whoever submitted the fix to a stop cannot release it either (matches work_holds.sql)", () => {
  const s = Data.make("busy");
  const jo = who(s, "Jo");
  const h = s.work_holds.find((x) => x.id === "h1");
  assert.ok(Rules.compute(s, jo).some((a) => a.id === "hold-release:h1" && a.state === "ready"));
  h.corrected_by = jo.user_id;
  const a = Rules.compute(s, jo).find((x) => x.id === "hold-release:h1");
  assert.equal(a.state, "blocked");
  assert.match(a.blockedBy, /submitted the fix/);
});
