import test from "node:test";
import assert from "node:assert/strict";
import { ageing, cashWeeks, jobStage, onboardingSteps, programmeStatus, progressPercent, staffingGaps, workingDays } from "../lib/operations/command-centre";
import { meaningfulText } from "../lib/operations/text";
import { renderNotification, renderSummary } from "../lib/notifications/render";
import { hrefFor } from "../lib/operations/search";
import { messageInput } from "../lib/operations/daily-input";
import { buildQueue, compute, queueCounts, todayCountCopy, withoutFigures } from "../lib/operations/next-actions";
import { ownerAudience } from "../lib/operations/next-actions/engine";
import type { NextAction, NextActionSnapshot } from "../lib/operations/next-actions/types";

const TODAY = "2026-11-11";

test("'none', 'n/a' and 'all good' in an end-of-day report are not problems; real notes are", () => {
  for (const nothing of ["none", "None.", "none, good day", "N/A", "n/a", "nil", "No", "all good", "  ", "", null, undefined, "-", "Nothing to report"]) assert.equal(meaningfulText(nothing), false, String(nothing));
  for (const real of ["Scaffold in the way on level 3", "Need 20 bags of adhesive", "No access to flat 12", "none of the grout has arrived"]) assert.equal(meaningfulText(real), true, real);
});

test("a job's stage is the confirmed one, or until confirmed, what its dates indicate", () => {
  assert.deepEqual(jobStage("on_hold", "2026-10-01", "2026-12-01", TODAY), { stage: "on_hold", confirmed: true });
  assert.deepEqual(jobStage(null, "2026-10-01", "2026-12-01", TODAY), { stage: "live", confirmed: false });
  assert.deepEqual(jobStage(null, "2026-12-01", "2027-01-01", TODAY), { stage: "won", confirmed: false });
  assert.deepEqual(jobStage(null, "2026-09-01", "2026-11-01", TODAY), { stage: "practical_completion", confirmed: false });
  assert.deepEqual(jobStage("not-a-stage", null, null, TODAY), { stage: "won", confirmed: false });
});

test("progress is work done against package quantities, capped per package; behind means well behind the calendar", () => {
  assert.equal(progressPercent([]), null);
  assert.equal(progressPercent([{ id: "a", name: "Floor", unit: "m2", quantity: 100, done: 50 }, { id: "b", name: "Walls", unit: "m2", quantity: 200, done: 400 }]), 75);
  assert.equal(programmeStatus({ start: "2026-11-01", end: "2026-11-21", today: TODAY, progress: 10, stage: "live" }), "behind");
  assert.equal(programmeStatus({ start: "2026-11-01", end: "2026-11-21", today: TODAY, progress: 45, stage: "live" }), "on_track");
  assert.equal(programmeStatus({ start: "2026-11-01", end: "2026-11-05", today: TODAY, progress: 90, stage: "live" }), "overrun");
  assert.equal(programmeStatus({ start: "2026-11-01", end: "2026-11-21", today: TODAY, progress: null, stage: "live" }), "unknown");
});

test("debt ageing uses the statement's buckets and cash flow puts overdue receipts in the current week", () => {
  const lines = [
    { contract_id: "j", application_id: "a1", number: 1, display_status: "overdue", final_on: "2026-09-01", outstanding: 1000, days_overdue: 71 },
    { contract_id: "j", application_id: "a2", number: 2, display_status: "overdue", final_on: "2026-10-30", outstanding: 500, days_overdue: 12 },
    { contract_id: "j", application_id: "a3", number: 3, display_status: "submitted", final_on: "2026-11-20", outstanding: 2000, days_overdue: 0 },
  ];
  assert.deepEqual(ageing(lines), { current: 2000, days_1_30: 500, days_31_60: 0, days_61_90: 1000, days_over_90: 0, total: 3500, overdue: 1500 });
  const weeks = cashWeeks([
    { direction: "in", expected_on: "2026-11-11", amount: 1500, certainty: "overdue", source: "application", reference: "A1", contract_id: "j", record_id: "a1" },
    { direction: "in", expected_on: "2026-11-20", amount: 2000, certainty: "applied", source: "application", reference: "A3", contract_id: "j", record_id: "a3" },
    { direction: "out", expected_on: "2026-11-13", amount: 800, certainty: "approved", source: "gang_invoice", reference: "GI-1", contract_id: "j", record_id: "g" },
  ], TODAY, 4);
  assert.equal(weeks[0].start, "2026-11-09");
  assert.deepEqual([weeks[0].in, weeks[0].out, weeks[0].overdueIn, weeks[0].running], [1500, 800, 1500, 700]);
  assert.deepEqual([weeks[1].in, weeks[1].running], [2000, 2700]);
});

test("the planner finds double bookings, idle gangs and live jobs nobody is planned on", () => {
  const days = workingDays("2026-11-13", 4);
  assert.deepEqual(days, ["2026-11-13", "2026-11-16"], "weekends are not working days");
  const gaps = staffingGaps({ plans: [
    { id: "p1", contract_id: "j1", team_id: "t1", planned_start: "2026-11-13", planned_end: "2026-11-16" },
    { id: "p2", contract_id: "j2", team_id: "t1", planned_start: "2026-11-16", planned_end: "2026-11-16" },
  ], activeJobs: [{ id: "j1", start: null, end: null }, { id: "j3", start: "2026-11-01", end: "2026-12-01" }], teamIds: ["t1", "t2"], days });
  assert.equal(gaps.doubleBooked.length, 1);
  assert.deepEqual(gaps.idle, [{ team_id: "t2", days: ["2026-11-13", "2026-11-16"] }]);
  assert.deepEqual(gaps.unplannedJobs, ["j3"]);
});

test("gang onboarding lists every step and only a fully set up gang is complete", () => {
  const base = { team_id: "t", name: "Gang", active: true, company_id: "c", tax_profile: { cis_status: "net" }, bank: true, agreement: "signed" as const, live_link: true, insurance_ok: true, on_jobs: 1, rates: 2 };
  assert.ok(onboardingSteps(base).every(step => step.done));
  const missing = onboardingSteps({ ...base, tax_profile: { cis_status: "unverified" }, agreement: "issued", live_link: false }).filter(step => !step.done).map(step => step.key);
  assert.deepEqual(missing, ["cis", "agreement", "link"]);
});

test("the morning summary shows money only when the database included it, and escapes what site typed", () => {
  const payload = { date: TODAY, financial: false, recipient: "Jo Office", stops: [{ type: "safety", job: "J-1 · Hotel", where: "Stair", reason: "<b>Unprotected</b> edge", path: "/admin/holds/h" }],
    waiting: [], yesterday: [{ job: "J-1 · Hotel", handover: false, teams: 2, progress: 0, photos: 0, inspections: 0, snags: 0, path: "/admin/contracts/j/activity" }], today: [], upcoming: [] };
  const plain = renderSummary(payload, "https://tilespec.example");
  assert.ok(!/£|Money/.test(plain.html + plain.text), "no money section without money access");
  assert.ok(plain.html.includes("&lt;b&gt;Unprotected&lt;/b&gt;"), "typed text is escaped");
  assert.match(plain.text, /NO REPORT/);
  assert.ok(plain.html.includes("https://tilespec.example/admin/holds/h"));
  const withMoney = renderSummary({ ...payload, financial: true, money: { overdue: [{ job: "J-1", application: 2, outstanding: 1234, days: 12 }], gang_to_approve: 1, gang_due_7_days: 500, quotes_follow_up: 0 } }, "https://tilespec.example");
  assert.match(withMoney.text, /Overdue: J-1, application 2: £1,234, 12 days late/);
  const urgent = renderNotification("urgent", "Safety stop: J-1", { headline: "A safety stop has been raised", job: "J-1", detail: "Edge", path: "/admin/holds/h" }, "https://tilespec.example");
  assert.equal(urgent.subject, "Safety stop: J-1");
  assert.match(urgent.text, /Open the record \(https:\/\/tilespec.example\/admin\/holds\/h\)/);
});

test("every search result opens its record", () => {
  const hit = (kind: string) => ({ kind, id: "11111111-1111-4111-8111-111111111111", label: "x", detail: null, contract_id: "22222222-2222-4222-8222-222222222222" });
  assert.equal(hrefFor(hit("job"), true), "/admin/contracts/11111111-1111-4111-8111-111111111111");
  assert.equal(hrefFor(hit("gang_invoice"), true), "/admin/gang-invoices/11111111-1111-4111-8111-111111111111");
  assert.equal(hrefFor(hit("daywork"), true), "/admin/supervisor/sites/22222222-2222-4222-8222-222222222222/dayworks/11111111-1111-4111-8111-111111111111");
  assert.equal(hrefFor(hit("gang"), false), "/admin/workforce", "without money access a gang opens the workforce page, not its finances");
  assert.equal(hrefFor(hit("message"), true), "/admin/inbox?thread=11111111-1111-4111-8111-111111111111#thread-11111111-1111-4111-8111-111111111111");
});

test("a supervisor's decision request or problem always waits for the office, and urgency is carried", () => {
  const form = new FormData();
  form.set("contract_id", "11111111-1111-4111-8111-111111111111"); form.set("body", "Can we use the alternative grout?"); form.set("category", "decision"); form.set("urgent", "on");
  assert.deepEqual(messageInput(form), { contract_id: "11111111-1111-4111-8111-111111111111", about_type: "job", body: "Can we use the alternative grout?", needs_answer: true, category: "decision", urgent: true });
  form.set("category", "invoice");
  assert.throws(() => messageInput(form), /what kind of message/);
});

const raw = (audience: NextAction["audience"], job: string | null = "j"): NextAction => ({ id: "x", rule: "R08", process: "job-setup", kind: "reminder", priority: 3, order: 1,
  job: { id: job, reference: "J", name: "Job" }, location: null, responsible: { role: "office", who: null, label: "Office" }, title: "t", why: "w", due: null, requires: [],
  doneWhen: "d", next: null, audience, blocks: null, enforcedByBackend: false, source: { table: "contracts", id: null }, route: { screen: "job" } } as NextAction);
const snapshot = (managers: { user_id: string; active?: boolean; financial_access?: boolean }[], assigned: string[]) => ({
  members: managers.map(m => ({ user_id: m.user_id, display_name: `Manager ${m.user_id}`, role: "contracts_manager" as const, financial_access: m.financial_access ?? false, active: m.active })),
  contract_assignments: assigned.map(user_id => ({ contract_id: "j", user_id })),
}) as unknown as NextActionSnapshot;

test("the owner gets office work when no active contracts manager is responsible for the job, and sees it waiting when one is", () => {
  const office = raw({ office: "act", owner: null });
  assert.deepEqual(ownerAudience(office, snapshot([], [])), { mode: "act", coveredBy: null });
  assert.deepEqual(ownerAudience(office, snapshot([{ user_id: "m1", active: false }], ["m1"])), { mode: "act", coveredBy: null }, "an inactive manager covers nothing");
  assert.deepEqual(ownerAudience(office, snapshot([{ user_id: "m1" }], [])), { mode: "act", coveredBy: null }, "a manager on other jobs does not cover this one");
  assert.deepEqual(ownerAudience(office, snapshot([{ user_id: "m1" }], ["m1"])), { mode: "see", coveredBy: "Manager m1" });
  assert.deepEqual(ownerAudience({ ...office, financial: true }, snapshot([{ user_id: "m1" }], ["m1"])), { mode: "act", coveredBy: null }, "money work needs a manager with money access");
  assert.deepEqual(ownerAudience(raw({ supervisor: "act" }), snapshot([], [])), { mode: "see", coveredBy: null }, "site work is visible as waiting on others");
  assert.deepEqual(ownerAudience(raw({ supervisor: "act", office: null }), snapshot([], [])), { mode: null, coveredBy: null }, "work hidden from the office until a set time stays hidden");
  assert.deepEqual(ownerAudience(raw({ owner: "act", office: "act" }), snapshot([{ user_id: "m1" }], ["m1"])), { mode: "act", coveredBy: null }, "the owner's own decisions stay the owner's");
});

test("an unsent draft snag from an earlier day reaches the supervisor and the office, and is overdue", () => {
  const s = {
    today: TODAY, now: "09:00", members: [{ user_id: "o", display_name: "Owner", role: "owner", financial_access: true, active: true },
      { user_id: "sup", display_name: "Sam Site", role: "supervisor", financial_access: false, active: true }],
    contracts: [{ id: "j", reference: "J-1", name: "Hotel", start_date: "2026-11-20", end_date: "2027-01-01", working_hours: "", tile_specification: "spec" }],
    commercials: [], contract_assignments: [{ contract_id: "j", user_id: "sup" }], package_assignments: [], work_areas: [], companies: [], company_insurances: [], teams: [], operatives: [],
    team_memberships: [], planned_allocations: [], actual_allocations: [], allocation_absences: [], supervisor_inspections: [], location_inspection_templates: [],
    location_inspection_requirements: [], location_inspections: [], supervisor_issues: [], work_holds: [], supervisor_office_items: [], supervisor_office_acknowledgements: [],
    supervisor_qa_submissions: [], site_handovers: [], document_revisions: [{ id: "d", contract_id: "j" }],
    draft_snags: [{ id: "s1", contract_id: "j", work_area_id: null, check_label: "Cracked tile", inspector_id: "sup", created_at: "2026-11-09T09:00:00Z" },
      { id: "s2", contract_id: "j", work_area_id: null, check_label: "Started today", inspector_id: "sup", created_at: `${TODAY}T08:00:00Z` }],
  } as unknown as NextActionSnapshot;
  const owner = compute(s, { user_id: "o", role: "owner", financial_access: true });
  const draft = owner.filter(a => a.rule === "R29");
  assert.equal(draft.length, 1, "only drafts from an earlier day");
  assert.equal(draft[0].state, "ready", "with no manager, the owner can chase or close it");
  assert.equal(draft[0].overdue, true, "a draft left since the day before yesterday is overdue");
  assert.equal(compute(s, { user_id: "sup", role: "supervisor", financial_access: false }).find(a => a.rule === "R29")?.state, "ready");
  const q = buildQueue(withoutFigures(owner), { groupExceptions: true });
  assert.match(todayCountCopy(queueCounts(q).actions, 0, queueCounts(q).waiting + queueCounts(q).exceptions), /need you/);
});
