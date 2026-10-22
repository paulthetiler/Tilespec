import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import * as engine from "../lib/operations/next-actions";
import {
  actionHref, buildQueue, compute, configFromEnv, DEFAULT_CONFIG, flagEnabled, hrefIsExistingForm, idleCopy, nextAction, parseWorkingHours, queueCounts, queueIds, resolveTimings, todayCountCopy, workflowPreviewExposed,
  type NextActionSnapshot, type ViewerAction,
} from "../lib/operations/next-actions";
import { buildSiteDay, nextAction as legacyNextAction } from "../lib/operations/site-day";

// The fixture is the prototype's illustrative scenario: fictional people, real table shapes.
const make = (name: "start" | "busy") => Data.make(name) as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => {
  const m = s.members.find(x => x.display_name.startsWith(first));
  assert.ok(m, `member ${first}`);
  return m;
};
const ids = (list: ViewerAction[]) => list.map(a => a.rule);
const find = (list: ViewerAction[], id: string) => list.find(a => a.id === id);
const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

test("every action carries the fields the brief requires, and is classed honestly", () => {
  for (const scenario of ["start", "busy"] as const) {
    const s = make(scenario);
    for (const m of s.members) {
      for (const a of compute(s, m)) {
        assert.ok(a.id && a.rule && a.process, "identity");
        assert.ok(["gate", "alert", "reminder"].includes(a.kind), `class on ${a.id}`);
        assert.ok(a.job && "name" in a.job, `job on ${a.id}`);
        assert.ok(a.responsible.role && a.responsible.label, `responsible on ${a.id}`);
        assert.ok(a.title && a.why, `plain-English text on ${a.id}`);
        assert.ok([0, 1, 2, 3].includes(a.priority), `priority on ${a.id}`);
        assert.ok(a.doneWhen, `completion condition on ${a.id}`);
        assert.ok(a.source.table, `source record on ${a.id}`);
        if (a.kind === "gate") assert.ok(a.blocks && a.enforcedByBackend, `a gate says exactly what it holds up: ${a.id}`);
        else assert.ok(!a.blocks && !a.enforcedByBackend, `only gates claim to hold anything up: ${a.id}`);
        if (!a.informationOnly) assert.ok(a.requires.length, `requires on ${a.id}`);
      }
    }
  }
});

test("a quiet morning: the supervisor starts with the morning checks and nothing is invented", () => {
  const s = make("start");
  const list = compute(s, who(s, "Dave"));
  const first = nextAction(list);
  assert.equal(first?.rule, "R01");
  assert.equal(first?.kind, "reminder");
  assert.equal(list.filter(a => a.state === "ready").length, 4);
});

test("saving the morning checks changes the next action with no manual tick-box", () => {
  const s = make("start");
  const dave = who(s, "Dave");
  s.supervisor_inspections.push({ id: "mc", contract_id: "c1", created_at: "2026-10-15T07:50:00Z" });
  assert.ok(!ids(compute(s, dave)).includes("R01"));
  assert.equal(nextAction(compute(s, dave))?.rule, "R05");
});

test("a supervisor who opens a site with no gang planned still has the daily routine", () => {
  const s = make("start");
  const dave = who(s, "Dave");
  s.planned_allocations = [];
  s.actual_allocations = [];
  assert.ok(!ids(compute(s, dave)).includes("R01"), "nothing is invented for a site nobody is working on");
  s.attended_sites = ["c1"];
  assert.equal(nextAction(compute(s, dave))?.rule, "R01");
  s.supervisor_inspections.push({ id: "mc", contract_id: "c1", created_at: "2026-10-15T07:50:00Z" });
  assert.ok(!ids(compute(s, dave)).includes("R01"), "a saved morning check still completes it");
  s.now = "15:30";
  assert.ok(compute(s, dave).some(a => a.rule === "R06" && a.state === "ready"), "handover reminder from the job's working hours");
  // Only the supervisor's own site loader marks a site as attended. Office views are unchanged.
  assert.match(source("lib/operations/next-actions/snapshot-data.ts"), /attended_sites: options\.attended && member\.role === "supervisor"/);
  assert.ok(!source("lib/operations/next-actions/office-snapshot.ts").includes("attended_sites"));
  assert.match(source("components/site/next-actions-today.tsx"), /\{ attended: true \}/);
  assert.match(source("app/admin/supervisor/page.tsx"), /\{ attended: false \}/);
});

test("the site picker says what is next and never hides stopped work", () => {
  assert.deepEqual(engine.siteSummaryCopy({ next: null, todo: 0, stopped: 0 }), { line: "No tasks waiting for you here", stopped: null });
  assert.deepEqual(engine.siteSummaryCopy({ next: null, todo: 0, stopped: 2 }), { line: "No tasks waiting for you here", stopped: "Work stopped here: 2" });
  assert.deepEqual(engine.siteSummaryCopy({ next: "Check the repair", todo: 1, stopped: 0 }), { line: "Next: Check the repair", stopped: null });
  assert.deepEqual(engine.siteSummaryCopy({ next: "Check the repair", todo: 3, stopped: 1 }), { line: "Next: Check the repair (+2 more)", stopped: "Work stopped here: 1" });
});

test("a mandatory inspection stays a gate until a passing inspection is SAVED", () => {
  const s = make("start");
  const dave = who(s, "Dave");
  assert.ok(compute(s, dave).some(a => a.rule === "G07" && a.kind === "gate" && a.state === "ready"));
  s.location_inspections.push({ id: "li", contract_id: "c1", work_area_id: "l-f31-bath", template_id: "tpl1", work_package_id: null, stage: "installation", created_at: "2026-10-15T08:30:00Z", blocking_failure: false });
  assert.ok(!ids(compute(s, dave)).includes("G07"));
  s.location_inspections.push({ id: "li2", contract_id: "c1", work_area_id: "l-f31-bath", template_id: "tpl1", work_package_id: null, stage: "installation", created_at: "2026-10-15T09:30:00Z", blocking_failure: true });
  const failed = compute(s, dave).find(a => a.rule === "G06");
  assert.ok(failed, "a later failed inspection re-opens the gate");
  assert.equal(failed.priority, 1);
});

test("unknown inspection applicability is a gate for the office and never treated as allowed", () => {
  const s = make("start");
  const a = compute(s, who(s, "Sam")).filter(x => x.rule === "G08");
  assert.equal(a.length, 2);
  assert.ok(a.every(x => x.kind === "gate" && x.state === "ready"));
});

test("a hold release is only ever offered as a decision for an independent person", () => {
  const s = make("busy");
  const [sam, alex, dave, marek] = ["Sam", "Alex", "Dave", "Marek"].map(n => who(s, n));
  const h1 = (u: typeof sam) => find(compute(s, u), "hold-release:h1");
  const h2 = (u: typeof sam) => find(compute(s, u), "hold-release:h2");
  assert.equal(h1(alex)?.state, "ready");
  assert.equal(h1(sam)?.state, "ready");
  assert.equal(h1(dave)?.state, "waiting", "the supervisor cannot decide");
  assert.equal(h1(marek)?.state, "waiting", "the gang cannot decide");
  assert.equal(h2(sam)?.state, "blocked", "Sam raised h2");
  assert.match(h2(sam)?.blockedBy ?? "", /someone else/);
  assert.equal(h2(alex)?.state, "blocked", "a critical defect is still open on that work");
  assert.match(h2(alex)?.blockedBy ?? "", /critical defect/);
});

test("the engine never completes, approves or releases anything", () => {
  const s = make("busy");
  const before = JSON.stringify(s);
  for (const m of s.members) compute(s, m);
  assert.equal(JSON.stringify(s), before, "compute() is read-only");
  assert.deepEqual(Object.keys(engine).filter(k => /approve|release|authori[sz]e|bypass|complete|dismiss|snooze/i.test(k)), []);
});

test("a repairer cannot re-inspect their own repair, and critical repairs go to the office", () => {
  const s = make("busy");
  const dave = who(s, "Dave"), sam = who(s, "Sam");
  assert.equal(compute(s, dave).find(a => a.rule === "G10")?.state, "ready");
  const snag = s.supervisor_issues.find(i => i.id === "s2")!;
  snag.rectified_by = dave.user_id;
  assert.equal(compute(s, dave).find(a => a.rule === "G10")?.state, "blocked");
  snag.escalated = true;
  assert.equal(compute(s, sam).find(a => a.rule === "G10")?.state, "ready");
  assert.equal(compute(s, dave).find(a => a.rule === "G10")?.viewerMode, "see");
});

test("a subcontractor sees only their own gang's actions and never any money", () => {
  const s = make("busy");
  const list = compute(s, who(s, "Marek"));
  assert.ok(list.length > 0);
  for (const a of list) {
    assert.ok(!a.financial, "no financial action");
    assert.ok(a.parties?.teamIds.includes("t1"), `own gang only: ${a.id}`);
    assert.ok(!/£|margin|budget|profit/i.test(JSON.stringify([a.title, a.why, a.requires])), `no money words in ${a.id}`);
  }
  s.package_assignments.push({ contract_id: "c1", work_package_id: "p3", user_id: "u-gary" });
  s.members.push({ user_id: "u-gary", display_name: "Gary Mason", role: "subcontract_installer", financial_access: false });
  s.operatives.find(o => o.id === "o4")!.user_id = "u-gary";
  assert.deepEqual(compute(s, s.members.find(m => m.user_id === "u-gary")!).filter(a => a.state === "ready"), [], "another gang's fixes are not visible");
});

test("financial information is limited to the owner and permitted office staff, and is information only", () => {
  const s = make("start");
  const margin = (n: string) => compute(s, who(s, n)).filter(a => a.rule === "R14");
  assert.equal(margin("Alex").length, 1);
  assert.equal(margin("Sam").length, 1, "Sam has financial_access");
  assert.equal(margin("Jo").length, 0, "Jo has no financial access");
  assert.equal(margin("Dave").length, 0);
  assert.equal(margin("Marek").length, 0);
  assert.equal(margin("Alex")[0].state, "info", "owner acceptance cannot be recorded today, so there is no button to press");
  assert.equal(nextAction([...margin("Alex")]), null, "information never becomes the main button");
});

// ---- review point 4: classification --------------------------------------------------------------

test("expired insurance is a prominent alert that does not claim the database blocks planning", () => {
  const s = make("start");
  const sam = who(s, "Sam"), alex = who(s, "Alex");
  const a = find(compute(s, sam), "insurance:co2");
  assert.ok(a);
  assert.equal(a.kind, "alert");
  assert.equal(a.enforcedByBackend, false);
  assert.equal(a.blocks, null);
  assert.match(a.why, /does not stop work being planned/i);
  assert.ok(!/blocked|cannot be planned|prevent/i.test(a.why));
  assert.equal(find(compute(s, alex), "insurance:co2")?.state, "waiting", "the owner is told");
  assert.ok(buildQueue(compute(s, alex)).alerts.some(x => x.id === "insurance:co2"), "and it is surfaced as an alert");
});

test("an alert on site is escalated ahead of everyday reminders for the office", () => {
  const s = make("start");
  s.actual_allocations.push({ id: "a", contract_id: "c1", planned_allocation_id: null, team_id: "t2", work_area_id: "l-l2-corr", work_date: "2026-10-15", started_at: "2026-10-15T07:30:00Z", ended_at: null, voided_at: null });
  const sam = compute(s, who(s, "Sam"));
  const insurance = find(sam, "insurance:co2")!;
  assert.equal(insurance.priority, 1);
  assert.ok(sam.indexOf(insurance) < sam.findIndex(a => a.kind === "reminder"), "ahead of every reminder");
  assert.equal(find(compute(s, who(s, "Dave")), "insurance:co2")?.state, "waiting", "the supervisor sees it once they are on site");
});

test("a critical snag is an alert and never stops work by itself", () => {
  const s = make("start");
  s.supervisor_issues.push({ id: "s1", contract_id: "c1", work_area_id: "l-f32-bath", check_label: "Cracked tiles", description: "Cracks at the drain.", severity: "critical",
    snag_status: "open", assigned_team_id: null, target_date: null, raised_by: "u-dave", rectified_by: null, escalated: true, responsibility_state: "not_assessed", responsibility_team_id: null });
  const sam = compute(s, who(s, "Sam"));
  const a = find(sam, "snag-critical:s1")!;
  assert.equal(a.kind, "alert");
  assert.equal(a.blocks, null);
  assert.match(a.why, /does not stop any work by itself/);
  assert.ok(!sam.some(x => x.process === "stop-work"), "no hold is created or implied");
});

test("a critical repair assigned to a gang is a reminder for the gang, not a gate that halts work", () => {
  const s = make("busy");
  Object.assign(s.supervisor_issues.find(i => i.id === "s3")!, { snag_status: "assigned", assigned_team_id: "t1", target_date: "2026-10-18" });
  const fix = find(compute(s, who(s, "Sam")), "snag-fix:s3")!;
  assert.equal(fix.kind, "reminder");
  assert.equal(fix.enforcedByBackend, false);
});

test("only controls the database enforces are gates", () => {
  const s = make("busy");
  const classes = new Map<string, Set<string>>();
  for (const m of s.members) for (const a of compute(s, m)) classes.set(a.rule, (classes.get(a.rule) ?? new Set()).add(a.kind));
  const gates = [...classes].filter(([, k]) => k.has("gate")).map(([r]) => r).sort();
  assert.deepEqual(gates, ["G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G10"].filter(r => gates.includes(r)));
  for (const r of ["A01", "A02"]) assert.deepEqual([...(classes.get(r) ?? [])], ["alert"]);
  for (const r of ["R15", "R16", "S03", "R13"]) if (classes.has(r)) assert.deepEqual([...classes.get(r)!], ["reminder"], r);
});

// ---- review point 5: working hours, not fixed clock times ----------------------------------------

test("reminder times come from working hours and can be configured", () => {
  const std = resolveTimings(DEFAULT_CONFIG, "07:30 to 16:30");
  assert.deepEqual([std.morningChecksOfficeSeesAt, std.handoverReminderAt, std.handoverOfficeSeesAt], ["10:00", "15:00", "17:30"]);
  const early = resolveTimings(DEFAULT_CONFIG, "6am - 2pm");
  assert.deepEqual([early.start, early.end, early.source], ["06:00", "14:00", "contract"]);
  assert.deepEqual([early.morningChecksOfficeSeesAt, early.handoverReminderAt, early.handoverOfficeSeesAt], ["08:30", "12:30", "15:00"]);
  assert.equal(resolveTimings(DEFAULT_CONFIG, "").source, "default");
  const custom = resolveTimings({ ...DEFAULT_CONFIG, handoverReminderBeforeEndMinutes: 30, defaultWorkingDay: { start: "08:00", end: "17:00" } }, "");
  assert.equal(custom.handoverReminderAt, "16:30");
});

test("working hours are read from free text and bad text falls back safely", () => {
  assert.deepEqual(parseWorkingHours("07:30 to 16:30"), { start: "07:30", end: "16:30" });
  assert.deepEqual(parseWorkingHours("Mon-Fri 7.30am until 4.30pm"), { start: "07:30", end: "16:30" });
  assert.deepEqual(parseWorkingHours("0700-1530"), { start: "07:00", end: "15:30" });
  for (const bad of ["", "weekdays", "16:30 to 07:30", "25:00 to 26:00", null, undefined]) assert.equal(parseWorkingHours(bad as string), null);
});

test("configuration from the environment ignores bad values instead of failing", () => {
  const c = configFromEnv({ NEXT_ACTIONS_WORKDAY_START: "08:00", NEXT_ACTIONS_WORKDAY_END: "17:00", NEXT_ACTIONS_HANDOVER_REMINDER_BEFORE_END_MIN: "45", NEXT_ACTIONS_INSURANCE_WARNING_DAYS: "oops" });
  assert.deepEqual(c.defaultWorkingDay, { start: "08:00", end: "17:00" });
  assert.equal(c.handoverReminderBeforeEndMinutes, 45);
  assert.equal(c.insuranceWarningDays, DEFAULT_CONFIG.insuranceWarningDays);
  assert.deepEqual(configFromEnv({ NEXT_ACTIONS_WORKDAY_START: "18:00", NEXT_ACTIONS_WORKDAY_END: "07:00" }).defaultWorkingDay, DEFAULT_CONFIG.defaultWorkingDay);
  assert.deepEqual(configFromEnv({}), DEFAULT_CONFIG);
});

test("handover and morning-check visibility follow each job's working hours and the configuration", () => {
  const s = make("busy");
  const dave = who(s, "Dave"), sam = who(s, "Sam");
  const r06 = (u: typeof dave, config = DEFAULT_CONFIG) => compute(s, u, config).find(a => a.rule === "R06" && a.job.id === "c1");
  assert.ok(!r06(dave) || r06(dave)!.state !== "ready", "11:25 is too early to nag");
  s.now = "15:10";
  assert.equal(r06(dave)?.state, "ready");
  assert.equal(r06(sam), undefined, "the office is not told yet");
  s.now = "17:40";
  assert.equal(r06(sam)?.state, "waiting");
  s.now = "14:30";
  assert.notEqual(r06(dave)?.state, "ready");
  assert.equal(r06(dave, { ...DEFAULT_CONFIG, handoverReminderBeforeEndMinutes: 180 })?.state, "ready", "configuration moves the reminder");
  s.contracts.find(c => c.id === "c1")!.working_hours = "06:00 to 14:00";
  assert.equal(r06(dave)?.state, "ready", "the job's own working hours move it too");
});

test("no clock time is hard-coded in the rules or the engine", () => {
  for (const file of ["lib/operations/next-actions/rules.ts", "lib/operations/next-actions/engine.ts"]) {
    assert.deepEqual(source(file).match(/["'`]\d{1,2}:\d{2}["'`]/g) ?? [], [], file);
  }
});

// ---- review point 6: no dead ends -----------------------------------------------------------------

test("nothing is offered for records the backend does not have", () => {
  const all = engine.rules.map(r => r.id).join(" ");
  assert.ok(!/variation|daywork|claim|retention|tender/i.test(all), all);
  const s = make("busy");
  for (const m of s.members) for (const a of compute(s, m)) {
    assert.ok(!/variation|daywork|payment claim|retention/i.test(`${a.title} ${a.route.screen} ${a.source.table}`), a.id);
    assert.notEqual(a.source.table, "tender_enquiries");
  }
});

// ---- review point 8: the whole queue stays visible -------------------------------------------------

test("the top task gets the main button and every other task stays visible underneath", () => {
  const s = make("busy");
  for (const m of s.members) {
    const actions = compute(s, m);
    for (const group of [false, true]) {
      const q = buildQueue(actions, { groupExceptions: group });
      const placed = queueIds(q);
      assert.equal(placed.length, actions.length, `${m.display_name}: nothing hidden`);
      assert.deepEqual([...placed].sort(), actions.map(a => a.id).sort(), `${m.display_name}: nothing duplicated or dropped`);
      assert.equal(q.next?.id, actions.find(a => a.state === "ready")?.id);
      assert.equal(q.then.length, Math.max(0, actions.filter(a => a.state === "ready").length - (q.next ? 1 : 0)), "the rest of the ready queue is never truncated");
    }
  }
  const sam = buildQueue(compute(s, who(s, "Sam")));
  assert.ok(sam.then.length > 3, "a long queue is shown in full");
});

test("risks and exceptions are grouped for the owner without hiding anything", () => {
  const s = make("busy");
  const alex = compute(s, who(s, "Alex"));
  const q = buildQueue(alex, { groupExceptions: true });
  const counts = queueCounts(q);
  assert.ok(q.exceptions.length > 0);
  assert.ok(q.exceptions.every(a => a.state !== "ready" && a.state !== "info"));
  assert.ok(q.exceptions.every(a => a.kind !== "reminder" || a.overdue));
  assert.ok(q.exceptions.some(a => a.rule === "A02"), "expired insurance is among the risks");
  assert.ok(q.info.every(a => a.informationOnly), "budget items stay informational");
  assert.ok(q.info.some(a => a.rule === "R14"), "a low margin is counted as information, not as a risk");
  assert.ok(!q.exceptions.some(a => a.rule === "R14"), "informational alerts are not mixed into the risks count");
  assert.equal(counts.actions, (q.next ? 1 : 0) + q.then.length);
  assert.equal(counts.informational, q.info.length);
  assert.equal(counts.exceptions, q.exceptions.length);
  assert.match(todayCountCopy(counts.actions, counts.informational), /informational alert/);
  assert.ok(!/up to date/i.test(todayCountCopy(counts.actions, counts.informational)));
});

// ---- review point 7: one source of truth -------------------------------------------------------------

test("order is deterministic, safety first, and parallel processes sit side by side", () => {
  const s = make("busy");
  s.work_holds.push({ id: "h9", contract_id: "c1", work_area_id: "l-f31-bath", hold_type: "safety", status: "active", reason: "Unsafe access.", required_action: "", raised_by: "u-dave",
    corrected_by: null, assigned_team_id: null, assigned_operative_id: null, target_date: null, critical_snags_open: false });
  const dave = who(s, "Dave");
  const a = compute(s, dave), b = compute(s, dave);
  assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
  assert.equal(nextAction(a)?.rule, "G01");
  assert.equal(nextAction(a)?.priority, 0);
  const ready = a.filter(x => x.state === "ready");
  assert.ok(ready.some(x => x.process === "snag") && ready.some(x => x.process === "daily-site") && ready.some(x => x.process === "inspection"));
  assert.equal(new Set(a.map(x => x.id)).size, a.length);
  const processes = new Set<string>(compute(s, who(s, "Sam")).map(x => x.process));
  for (const p of ["stop-work", "snag", "inspection", "compliance", "job-setup"]) assert.ok(processes.has(p), p);
});

test("the shared engine picks the same everyday next step as the supervisor dashboard did", () => {
  const legacy = (input: { checksDone: boolean; staleOpen: number; unconfirmed: number }) => legacyNextAction({
    siteHref: "/s", issuesHref: "/s/snags", checksDone: input.checksDone, staleOpen: input.staleOpen, openIssues: 0,
    day: { summary: { unconfirmed: input.unconfirmed, plannedTeams: input.unconfirmed, confirmedTeams: 0, notOnSite: 0, presentNow: 0, openPeriods: 0 } } as unknown as ReturnType<typeof buildSiteDay>,
  }).key;
  const s = make("start");
  s.location_inspection_requirements = [];
  s.supervisor_office_items = [];
  s.planned_allocations = s.planned_allocations.filter(p => p.id === "pa1");
  const dave = who(s, "Dave");
  assert.equal(legacy({ checksDone: false, staleOpen: 0, unconfirmed: 1 }), "checks");
  assert.equal(nextAction(compute(s, dave))?.rule, "R01");
  s.supervisor_inspections.push({ id: "m", contract_id: "c1", created_at: "2026-10-15T07:50:00Z" });
  assert.equal(legacy({ checksDone: true, staleOpen: 0, unconfirmed: 1 }), "confirm");
  assert.equal(nextAction(compute(s, dave))?.rule, "R03");
  s.actual_allocations.push({ id: "old", contract_id: "c1", planned_allocation_id: null, team_id: "t1", work_area_id: "l-f32-bath", work_date: "2026-10-14", started_at: "2026-10-14T07:30:00Z", ended_at: null, voided_at: null });
  assert.equal(legacy({ checksDone: true, staleOpen: 1, unconfirmed: 1 }), "earlier");
  assert.equal(nextAction(compute(s, dave))?.rule, "R02");
});

test("the supervisor's Today uses the shared engine and keeps no second ordering of its own", () => {
  const today = source("components/site/next-actions-today.tsx");
  assert.match(today, /from "@\/lib\/operations\/next-actions"/);
  assert.match(today, /buildQueue\(/);
  assert.ok(!/site-day/.test(today), "does not import the old dashboard ordering");
  assert.ok(!/START MORNING CHECKS|FINISH EARLIER WORK/.test(today), "no hand-written next-step labels");
  const page = source("app/admin/supervisor/sites/[id]/page.tsx");
  assert.match(page, /NextActionsToday/);
  assert.match(page, /flagEnabled\("nextActions"/);
});

test("the prototype uses the same engine, not a copy", () => {
  const html = source("docs/redesign/prototype/index.html");
  assert.match(html, /engine\.js/);
  assert.ok(!/rules\.js/.test(html));
});

// ---- feature flags ------------------------------------------------------------------------------------

test("feature flags are off unless set, and can be staged by role", () => {
  assert.equal(flagEnabled("nextActions", "supervisor", {}), false);
  assert.equal(flagEnabled("roleShell", "owner", { FEATURE_ROLE_SHELL: "" }), false);
  assert.equal(flagEnabled("nextActions", "supervisor", { FEATURE_NEXT_ACTIONS: "1" }), true);
  assert.equal(flagEnabled("nextActions", "owner", { FEATURE_NEXT_ACTIONS: "ON" }), true);
  assert.equal(flagEnabled("roleShell", "supervisor", { FEATURE_ROLE_SHELL: "supervisor, lead_installer" }), true);
  assert.equal(flagEnabled("roleShell", "owner", { FEATURE_ROLE_SHELL: "supervisor,lead_installer" }), false);
  assert.equal(flagEnabled("roleShell", "owner", { FEATURE_ROLE_SHELL: "supervisr,owner" }), false, "a typo turns it off rather than on");
  for (const VERCEL_ENV of ["development", "preview", "production"]) {
    for (const role of ["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"] as const) {
      for (const flag of ["nextActions", "roleShell"] as const) {
        assert.equal(flagEnabled(flag, role, { VERCEL_ENV }), false, `${VERCEL_ENV}: ${flag} defaults off for ${role}`);
      }
    }
  }
  assert.equal(flagEnabled("nextActions", "supervisor", { VERCEL_ENV: "preview", FEATURE_NEXT_ACTIONS: "supervisor" }), true, "preview can opt in explicitly");
  assert.equal(flagEnabled("nextActions", "supervisor", { VERCEL_ENV: "preview", FEATURE_NEXT_ACTIONS: "" }), false, "explicit empty still off");
  assert.equal(workflowPreviewExposed({ VERCEL_ENV: "preview" }), true);
  assert.equal(workflowPreviewExposed({ VERCEL_ENV: "production", VERCEL: "1" }), false, "production never serves the prototype");
  assert.equal(workflowPreviewExposed({ VERCEL: "1", VERCEL_ENV: "development" }), false);
  assert.equal(workflowPreviewExposed({ NODE_ENV: "development" }), true);
  assert.equal(workflowPreviewExposed({ NODE_ENV: "production" }), false);
  const config = source("next.config.ts") + source("middleware.ts");
  assert.match(config, /workflowPreviewExposed/);
  assert.match(config, /\/preview\/workflow/);
});

// ---- navigation: review points 2 and 3 --------------------------------------------------------------

import { destinationsFor, MAX_DESTINATIONS, siteBaseOf, currentDestination, everythingElse } from "../lib/operations/role-nav";
import { existsSync } from "node:fs";

const SITE = "/admin/supervisor/sites/0a1b2c3d-1111-4222-8333-444455556666";
const routeExists = (href: string) => {
  const clean = href.split("?")[0].replace(/^\//, "");
  return ["page.tsx", "route.ts"].some(f => existsSync(path.join(root, "app", clean.replace(/^admin$/, "admin"), f)))
    || existsSync(path.join(root, "app", clean.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "[id]"), "page.tsx"));
};

test("each role has at most four destinations: owner 3, office 4, supervisor 4, subcontractor 3", () => {
  const counts = { owner: destinationsFor("owner", "/admin").length, office: destinationsFor("contracts_manager", "/admin").length,
    supervisor: destinationsFor("supervisor", SITE).length, lead: destinationsFor("lead_installer", "/admin").length, sub: destinationsFor("subcontract_installer", "/admin").length };
  assert.deepEqual(counts, { owner: 3, office: 4, supervisor: 4, lead: 3, sub: 3 });
  for (const role of ["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"] as const) assert.ok(destinationsFor(role, SITE).length <= MAX_DESTINATIONS);
});

test("risks are not an owner destination and money stays separate", () => {
  const owner = destinationsFor("owner", "/admin").map(d => d.label);
  assert.deepEqual(owner, ["Today", "Jobs", "Money"]);
  assert.ok(!owner.includes("Risks"));
});

test("subcontractors get Today, Fixes and Paperwork, and no way to message the supervisor", () => {
  assert.deepEqual(destinationsFor("subcontract_installer", "/admin").map(d => d.label), ["Today", "Fixes", "Paperwork"]);
  const everything = JSON.stringify([...engine.rules.map(r => r.id), ...everythingElse("lead_installer", false), ...destinationsFor("lead_installer", "/admin")]);
  assert.ok(!/tell the supervisor/i.test(everything));
  for (const f of ["components/admin/role-tabs.tsx", "lib/operations/next-actions/labels.ts", "components/site/next-actions-today.tsx"]) assert.ok(!/tell the supervisor/i.test(source(f)), f);
});

test("every navigation link opens a page that already exists", () => {
  for (const [role, path0] of [["owner", "/admin"], ["contracts_manager", "/admin"], ["supervisor", SITE], ["lead_installer", "/admin"]] as const)
    for (const d of destinationsFor(role, path0)) assert.ok(routeExists(d.href), `${role}: ${d.href}`);
});

test("the supervisor's tabs follow the site they are in, and the current tab is the closest match", () => {
  assert.equal(siteBaseOf(`${SITE}/workforce`), SITE);
  assert.equal(siteBaseOf("/admin/contracts"), null);
  const items = destinationsFor("supervisor", `${SITE}/snags`);
  assert.equal(currentDestination(items, `${SITE}/snags`), "issues");
  assert.equal(currentDestination(items, SITE), "today");
  assert.deepEqual(destinationsFor("supervisor", "/admin/supervisor").map(d => d.key), ["today"]);
});

test("nothing is lost: the original office menu stays reachable under Everything else", () => {
  const links = everythingElse("owner", true).map(l => l.href);
  for (const href of ["/admin/contracts", "/admin/workforce", "/admin/snags", "/admin/holds", "/admin/alerts", "/admin/quality", "/admin/tenders", "/admin/team", "/admin/estimator"]) assert.ok(links.includes(href), href);
});

test("no dead-end buttons: the supervisor's Today offers no variation, daywork, claim or margin controls", () => {
  const today = source("components/site/next-actions-today.tsx");
  assert.ok(!/variation|daywork|payment claim|margin/i.test(today));
  const money = source("app/admin/money/page.tsx");
  assert.ok(!/<button|<Link[^>]*(variation|daywork|claim)/i.test(money.replace(/Estimator/g, "")));
  const report = source("app/admin/supervisor/sites/[id]/report/page.tsx");
  assert.ok(!/STOP WORK/.test(report), "no prominent Stop Work button");
  const dashboard = source("app/admin/supervisor/sites/[id]/page.tsx");
  assert.ok(!/variation|daywork|\/commercial/i.test(dashboard), "the original dashboard has no variation or daywork tiles");
  assert.ok(!existsSync(path.join(root, "app/admin/supervisor/sites/[id]/commercial/page.tsx")), "no placeholder page for unbuilt features");
});

test("the supervisor's navigation is Today plus one Report an issue, with drawings that open", () => {
  assert.deepEqual(everythingElse("supervisor", false), [], "no second menu for a supervisor");
  const nav = source("components/site/site-nav.tsx");
  assert.ok(!/<details|More</.test(nav), "site screens have no More menu");
  assert.match(nav, /← Today/);
  assert.match(nav, /Report an issue/);
  for (const file of ["components/site/next-actions-today.tsx", "app/admin/supervisor/sites/[id]/page.tsx"]) {
    assert.match(source(file), /href=\{`\/admin\/documents\/\$\{\w+\.id\}`\}/, `${file}: each drawing opens through the authorised download route`);
  }
  assert.ok(existsSync(path.join(root, "app/admin/documents/[id]/route.ts")));
});

test("Report an issue replaces Stop Work and still reaches the existing hold and snag forms", () => {
  const report = source("app/admin/supervisor/sites/[id]/report/page.tsx");
  assert.match(report, /\/admin\/snags\/new\?contract=/);
  assert.match(report, /\/admin\/holds\/new\?contract=\$\{id\}&type=quality/);
  assert.match(report, /\/admin\/holds\/new\?contract=\$\{id\}&type=safety/);
  assert.match(report, /flagEnabled\("nextActions"/);
  const nav = source("components/site/site-nav.tsx");
  assert.match(nav, /reportIssue \?/);
  const holdPage = source("app/admin/holds/new/page.tsx");
  assert.match(holdPage, /initialType=\{q\.type==="safety"\?"safety":"quality"\}/);
});

test("every Supervisor Today action opens an existing form", () => {
  const base = "/admin/supervisor/sites/c1";
  for (const scenario of ["start", "busy"] as const) {
    const s = make(scenario);
    for (const name of ["Dave", "Ellie"]) {
      const ready = compute(s, who(s, name)).filter(a => a.state === "ready");
      for (const a of ready) {
        const href = actionHref(a, base);
        assert.ok(hrefIsExistingForm(href, base), `${name} ${scenario} ${a.rule} ${a.id} -> ${href}`);
        if (a.rule === "G06" || a.rule === "G07") assert.match(href, /[?&]stage=/, `${a.rule} includes the stage so the inspection form opens on the right activity`);
        if (a.rule === "R01") assert.equal(href, `${base}/checks`);
        if (a.rule === "R02") assert.match(href, /workforce#earlier-work/);
        if (a.rule === "R03") assert.equal(href.split("#")[0], `${base}/workforce`);
        if (a.rule === "G10" || a.rule === "R13") assert.match(href, /^\/admin\/snags\//);
        if (a.rule === "G01" || a.rule === "G02") assert.match(href, /^\/admin\/holds\//);
        if (a.rule === "R16") assert.match(href, /\/tasks\//);
      }
    }
  }
  const holdFix = actionHref({ route: { screen: "fix", id: "h3", kind: "hold" } }, base);
  const snagFix = actionHref({ route: { screen: "fix", id: "s1", kind: "snag" } }, base);
  assert.equal(holdFix, "/admin/holds/h3");
  assert.equal(snagFix, "/admin/snags/s1");
});

test("a supervisor cannot see another contract's actions", () => {
  const s = make("busy");
  const dave = compute(s, who(s, "Dave"));
  const ellie = compute(s, who(s, "Ellie"));
  assert.ok(dave.some(a => a.job.id === "c1") && ellie.some(a => a.job.id === "c3"));
  assert.ok(dave.every(a => !a.job.id || a.job.id === "c1"), "Dave is allocated to Riverside only");
  assert.ok(ellie.every(a => !a.job.id || a.job.id === "c3"), "Ellie is allocated to St Anne's only");
  assert.ok(!dave.some(a => a.job.id === "c3") && !ellie.some(a => a.job.id === "c1"));
});

test("feature flags work separately, together and off, and a typo stays off", () => {
  const off = {};
  const nextOnly = { FEATURE_NEXT_ACTIONS: "supervisor" };
  const shellOnly = { FEATURE_ROLE_SHELL: "supervisor" };
  const both = { FEATURE_NEXT_ACTIONS: "supervisor", FEATURE_ROLE_SHELL: "supervisor" };
  for (const role of ["owner", "contracts_manager", "supervisor", "lead_installer"] as const) {
    assert.equal(flagEnabled("nextActions", role, off), false, `${role} next off`);
    assert.equal(flagEnabled("roleShell", role, off), false, `${role} shell off`);
  }
  assert.equal(flagEnabled("nextActions", "supervisor", nextOnly), true);
  assert.equal(flagEnabled("roleShell", "supervisor", nextOnly), false);
  assert.equal(flagEnabled("nextActions", "supervisor", shellOnly), false);
  assert.equal(flagEnabled("roleShell", "supervisor", shellOnly), true);
  assert.equal(flagEnabled("nextActions", "supervisor", both), true);
  assert.equal(flagEnabled("roleShell", "supervisor", both), true);
  assert.equal(flagEnabled("nextActions", "owner", both), false, "owner is not in the staged list");
  assert.equal(flagEnabled("roleShell", "owner", both), false);
  assert.equal(flagEnabled("nextActions", "supervisor", { FEATURE_NEXT_ACTIONS: "SUPERVISR" }), false);
  const layout = source("app/admin/layout.tsx");
  const page = source("app/admin/supervisor/sites/[id]/page.tsx");
  assert.match(layout, /flagEnabled\("roleShell"/);
  assert.match(page, /flagEnabled\("nextActions"/);
  assert.match(page, /STOP WORK/);
  assert.match(layout, /Office menu/);
});

test("idle copy never says work is up to date while a restriction is still active", () => {
  const restricted = idleCopy({ activeRestrictions: true, waitingOnOthers: true });
  const waiting = idleCopy({ activeRestrictions: false, waitingOnOthers: true });
  const clear = idleCopy({ activeRestrictions: false, waitingOnOthers: false });
  assert.equal(restricted.title, "Work is still restricted");
  assert.match(restricted.text, /does not clear a restriction/);
  for (const copy of [restricted, waiting, clear]) {
    assert.ok(!/up to date/i.test(`${copy.title} ${copy.text}`), copy.title);
  }
  const today = source("components/site/next-actions-today.tsx");
  assert.match(today, /idleCopy\(/);
  assert.match(today, /Work that is stopped/);
  assert.ok(!/You are up to date/.test(today));
  const prototype = source("docs/redesign/prototype/screens-site.js") + source("docs/redesign/prototype/screens-office.js");
  assert.ok(!/You are up to date/.test(prototype));
  assert.ok(!/P\.chip\("saved", "Up to date"/.test(prototype));
});

test("labels never promise more than the backend does", () => {
  const gate = { kind: "gate", blocks: "Work at this location stays stopped." } as const;
  assert.equal(engine.classChip(gate).text, "Required step");
  assert.equal(engine.classChip({ kind: "alert" }).text, "Needs attention");
  assert.match(engine.classNote({ kind: "alert", blocks: null }), /does not block anything/);
  assert.match(engine.classNote(gate), /cannot be dismissed/);
  assert.ok(!/must be done before work continues/i.test(source("lib/operations/next-actions/labels.ts")));
});

// ---- loader mapping ------------------------------------------------------------------------------------

import { currentRows, toInspection, toRequirement, toSnag } from "../lib/operations/next-actions/snapshot-map";

test("loader mapping uses the existing inspection rule and keeps only current append-only revisions", () => {
  const stage = new Map([["t1", "installation" as const]]);
  const base = { id: "i", contract_id: "c", work_area_id: "a", template_id: "t1", created_at: "2026-10-15T08:00:00Z" };
  assert.equal(toInspection({ ...base, issues_count: 0, answers: [{ item: "x", status: "pass", note: "" }] }, stage)?.blocking_failure, false);
  assert.equal(toInspection({ ...base, issues_count: 1, answers: [] }, stage)?.blocking_failure, true);
  assert.equal(toInspection({ ...base, issues_count: 0, answers: [{ item: "x", status: "na", note: "", hold_point: true }] }, stage)?.blocking_failure, true, "an unpassed hold point blocks");
  assert.equal(toInspection({ ...base, template_id: "gone", issues_count: 0, answers: [] }, stage), null);
  assert.deepEqual(currentRows([{ id: "1", supersedes_id: null }, { id: "2", supersedes_id: "1" }]).map(r => r.id), ["2"]);
  assert.equal(toRequirement({ id: "r", contract_id: "c", work_area_id: "a", stage: "installation", applicability: "required" }).applicability, "required");
  assert.equal(toSnag({ id: "s", contract_id: "c", snag_status: null }), null, "legacy rows are not part of the lifecycle");
});
