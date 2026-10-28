import { addDays, dayDiff, isoDate, STAGE_LABEL, type Lookups } from "./lookups";
import type { NextActionConfig } from "./config";
import { budgetOf, pounds } from "./budget";
import type { ActualAllocationRow, InsuranceRow, NextAction, NextActionSnapshot, PlannedAllocationRow, WorkingTimes } from "./types";

/*
 * The one rule catalogue. Every screen, for every role, is built from these rules.
 *
 * Ground rules, checked by tests/next-actions.test.ts:
 *  1. Actions are DERIVED from saved records. Nothing here stores or ticks off a task.
 *     An action disappears only when the underlying record changes.
 *  2. Three classes, kept deliberately apart:
 *       gate      a step of a control the existing database enforces
 *       alert     a prominent escalation the database does NOT enforce
 *       reminder  a nudge or a required daily record
 *     Only gates may say that something is held up, and each says exactly what.
 *  3. The engine never approves an inspection, releases a hold, authorises work or
 *     bypasses a permission. It only says who should do what next.
 *  4. A critical defect does not stop work. A stop is a separate, deliberate hold.
 */
export interface RuleContext {
  s: NextActionSnapshot;
  L: Lookups;
  cfg: NextActionConfig;
  timingsFor: (contractId: string) => WorkingTimes;
}
export interface Rule { id: string; fn: (c: RuleContext) => NextAction[] }

export const rules: Rule[] = [];
const rule = (id: string, fn: Rule["fn"]) => rules.push({ id, fn });

const holdLabel = (type: string) => (type === "safety" ? "safety stop" : "quality hold");
const HOLD_BLOCKS = "Work at this location stays stopped until the fix is checked and the office restarts it.";
const supervisorLabel = (L: Lookups, contractId: string) => ({ role: "supervisor" as const, who: L.supervisorOf(contractId)?.display_name ?? null, label: "Site supervisor" });
const OFFICE = { role: "office" as const, who: null, label: "Office" };

// G01/G02: a stop has been raised and nobody has been told to fix it.
rule("G01_G02_hold_needs_fixer", ({ s, L }) => s.work_holds.filter(h => h.status === "active" && !h.assigned_team_id && !h.assigned_operative_id).map(h => ({
  id: `hold-assign:${h.id}`, rule: h.hold_type === "safety" ? "G01" : "G02", process: "stop-work", kind: "gate",
  priority: h.hold_type === "safety" ? 0 : 1, order: 1, job: L.job(h.contract_id), location: L.path(h.work_area_id),
  responsible: { role: "supervisor", who: L.supervisorOf(h.contract_id)?.display_name ?? null, label: "Site supervisor or office" },
  title: `Say who will fix the ${holdLabel(h.hold_type)}`, why: `${h.reason} Affected work stays stopped until it is fixed and the office restarts it.`,
  due: null, requires: ["Which gang fixes it", "What they must do", "A target date"], doneWhen: "A fixer and a target date are saved on the stop",
  next: "The gang sends photos of the fix", audience: { supervisor: "act", office: "act", owner: h.hold_type === "safety" ? "see" : null },
  blocks: HOLD_BLOCKS, enforcedByBackend: true, source: { table: "work_holds", id: h.id }, route: { screen: "hold", id: h.id },
})));

// G03: a gang has been told to fix it and has not yet said they have.
rule("G03_hold_awaiting_fix", ({ s, L }) => s.work_holds.filter(h => h.status === "active" && (h.assigned_team_id || h.assigned_operative_id)).map(h => ({
  id: `hold-fix:${h.id}`, rule: "G03", process: "stop-work", kind: "gate", priority: h.hold_type === "safety" ? 0 : 1, order: 1,
  job: L.job(h.contract_id), location: L.path(h.work_area_id),
  responsible: { role: "subcontractor", who: L.teamLead(h.assigned_team_id), label: L.teams.get(h.assigned_team_id ?? "")?.name ?? "Assigned gang" },
  title: "Fix it and send photos", why: h.reason, instruction: h.required_action || null,
  due: h.target_date, requires: ["Photos of the finished fix", "When the work was finished"], doneWhen: "A correction with photos is saved",
  next: "Ask the office to check it", audience: { subcontractor: "act", supervisor: "see", office: "see" },
  blocks: HOLD_BLOCKS, enforcedByBackend: true, parties: { teamIds: [h.assigned_team_id] },
  source: { table: "work_holds", id: h.id }, route: { screen: "fix", id: h.id, kind: "hold" },
})));

// G04: the fix has been submitted; someone must ask for the independent check.
rule("G04_hold_ask_release", ({ s, L }) => s.work_holds.filter(h => h.status === "correction_submitted").map(h => ({
  id: `hold-ask:${h.id}`, rule: "G04", process: "stop-work", kind: "gate", priority: 1, order: 2, job: L.job(h.contract_id), location: L.path(h.work_area_id),
  responsible: { role: "subcontractor", who: L.teamLead(h.assigned_team_id), label: L.teams.get(h.assigned_team_id ?? "")?.name ?? "Assigned gang" },
  title: "Ask the office to check the fix", why: "The fix is saved. A different person now has to check it before work can restart.",
  due: null, requires: ["A short note"], doneWhen: "A release review is requested", next: "Office checks and decides",
  audience: { subcontractor: "act", supervisor: "see", office: "see" }, blocks: HOLD_BLOCKS, enforcedByBackend: true, parties: { teamIds: [h.assigned_team_id] },
  source: { table: "work_holds", id: h.id }, route: { screen: "fix", id: h.id, kind: "hold" },
})));

// G05: the independent decision. The engine only SHOWS it. It never takes it.
rule("G05_hold_release_decision", ({ s, L }) => s.work_holds.filter(h => h.status === "awaiting_release").map(h => {
  const blockers: string[] = [];
  const criticalOpen = h.critical_snags_open || s.supervisor_issues.some(i => i.contract_id === h.contract_id && i.severity === "critical"
    && !["closed", "cancelled"].includes(i.snag_status) && !!i.work_area_id && !!h.work_area_id && L.under(i.work_area_id, h.work_area_id));
  if (criticalOpen) blockers.push("A critical defect is still open on this work, so it cannot be restarted yet.");
  return {
    id: `hold-release:${h.id}`, rule: "G05", process: "stop-work", kind: "gate", priority: h.hold_type === "safety" ? 0 : 1, order: 2,
    job: L.job(h.contract_id), location: L.path(h.work_area_id),
    responsible: { role: "office", who: null, label: "Office or owner. Not the person who raised it" },
    independence: { forbidden: [
      { userId: h.raised_by, reason: `${L.person(h.raised_by)} raised this stop, so someone else has to check it.` },
      ...(h.corrected_by ? [{ userId: h.corrected_by, reason: `${L.person(h.corrected_by)} submitted the fix, so someone else has to check it.` }] : []),
    ] },
    title: `Check the fix and decide: ${holdLabel(h.hold_type)}`,
    why: `${h.reason} The gang says it is fixed. Review their photos and the inspection results, then restart the work or send it back.`,
    due: null, requires: ["Photos of the fix", "Inspection results for this work", ...(h.hold_type === "safety" ? ["Principal contractor's name and reference"] : []), "A reason for your decision"],
    doneWhen: "A release or a send-back decision is saved", next: "Work restarts for this location only, or the gang is sent back",
    blockers, audience: { office: "act", owner: "act", supervisor: "see", subcontractor: "see" }, blocks: HOLD_BLOCKS, enforcedByBackend: true,
    parties: { teamIds: [h.assigned_team_id] }, source: { table: "work_holds", id: h.id }, route: { screen: "decision", id: h.id },
  };
}));

// G06/G07/G08: mandatory inspections for planned work.
const requirementsFor = (s: NextActionSnapshot, L: Lookups, plan: PlannedAllocationRow) =>
  s.location_inspection_requirements.filter(r => r.contract_id === plan.contract_id && r.stage === plan.stage && L.under(plan.work_area_id, r.work_area_id)
    && (!plan.work_package_id || !r.work_package_id || r.work_package_id === plan.work_package_id));
// PostgreSQL records microseconds; Date.parse alone loses anything after the
// third fractional digit and can accept an observation just before approval.
const timestampOrder = (a: string, b: string) => {
  const milliseconds = Date.parse(a) - Date.parse(b);
  if (milliseconds !== 0) return milliseconds;
  const remainder = (value: string) => (value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] ?? "").slice(3).padEnd(6, "0");
  return remainder(a).localeCompare(remainder(b));
};
const latestInspection = (s: NextActionSnapshot, plan: PlannedAllocationRow, requirement: NextActionSnapshot["location_inspection_requirements"][number]) =>
  s.location_inspections.filter(i => i.contract_id === plan.contract_id && i.stage === plan.stage
    // The backend requires an observation of this exact location against the
    // current requirement's template, package and approval date. A pass in one
    // room cannot clear a whole floor, or an earlier specification revision.
    && i.work_area_id === plan.work_area_id && (!requirement.template_id || i.template_id === requirement.template_id)
    && (!requirement.created_at || timestampOrder(i.created_at, requirement.created_at) >= 0)
    && ((i.work_package_id ?? null) === (requirement.work_package_id ?? null)
      || (!requirement.work_package_id && !!plan.work_package_id && i.work_package_id === plan.work_package_id)))
    .sort((a, b) => timestampOrder(b.created_at, a.created_at) || b.id.localeCompare(a.id))[0];
const INSPECTION_BLOCKS = "This work is not shown as released until a passing inspection is saved.";

rule("G06_G07_G08_inspections", ({ s, L, cfg }) => {
  const out: NextAction[] = [];
  const horizon = addDays(s.today, cfg.planHorizonDays);
  for (const plan of s.planned_allocations) {
    if (plan.planned_start > horizon || plan.planned_end < s.today) continue;
    const reqs = requirementsFor(s, L, plan);
    const job = L.job(plan.contract_id), where = L.path(plan.work_area_id), stage = STAGE_LABEL[plan.stage];
    const required = reqs.filter(r => r.applicability === "required");
    const missingMandatory = s.location_inspection_templates.some(t => t.contract_id === plan.contract_id && t.stage === plan.stage
      && t.mandatory && L.under(plan.work_area_id, t.work_area_id)
      && !required.some(r => r.template_id === t.id && (!r.work_package_id || (!!plan.work_package_id && r.work_package_id === plan.work_package_id))));
    const outdated = required.some(r => r.template_current === false);
    const incomplete = required.some(r => !r.template_id || !r.created_at || !Number.isFinite(Date.parse(r.created_at)));
    if (!reqs.length || (!plan.work_package_id && !reqs.some(r => !r.work_package_id)) || missingMandatory || outdated || incomplete) {
      out.push({
        id: `applicability:${plan.id}`, rule: "G08", process: "inspection", kind: "gate", priority: 2, order: 13, job, location: where,
        responsible: OFFICE, title: `Confirm which inspections apply to ${stage}`,
        why: `Work is planned here from ${plan.planned_start}. ${outdated ? "The inspection requirement refers to a replaced checklist. " : ""}Until the office confirms the current inspections for this location and activity, this work is not released. Unknown never counts as allowed.`,
        due: plan.planned_start, requires: ["The specification or manufacturer document", "Whether a mandatory inspection is needed"],
        doneWhen: "An inspection decision is saved for this location and activity", next: "Supervisors see exactly which checks to do",
        audience: { office: "act", supervisor: "see" }, blocks: INSPECTION_BLOCKS, enforcedByBackend: true,
        source: { table: "location_inspection_requirements", id: reqs[0]?.id ?? null }, route: { screen: "job", id: plan.contract_id, locationId: plan.work_area_id, stage: plan.stage },
      });
      continue;
    }
    if (!required.length) continue;
    const assessed = required.map(requirement => ({ requirement, inspection: latestInspection(s, plan, requirement) }));
    const failed = assessed.find(a => a.inspection?.blocking_failure);
    const pending = assessed.find(a => !a.inspection);
    if (failed?.inspection) {
      out.push({
        id: `inspection-failed:${plan.id}`, rule: "G06", process: "inspection", kind: "gate", priority: 1, order: 4, job, location: where,
        responsible: supervisorLabel(L, plan.contract_id), title: `Required inspection failed: ${where}`,
        why: "A required check did not pass. This work stays held until it is corrected and checked again.",
        due: null, requires: ["Correction done", "A new inspection"], doneWhen: "A later inspection for the same location and activity passes", next: "Office is told once it passes",
        audience: { supervisor: "act", office: "see" }, blocks: INSPECTION_BLOCKS, enforcedByBackend: true,
        source: { table: "location_inspections", id: failed.inspection.id }, route: { screen: "inspect", id: plan.work_area_id, stage: plan.stage },
      });
    } else if (pending && plan.planned_start <= s.today && plan.planned_end >= s.today) {
      out.push({
        id: `inspection-due:${plan.id}`, rule: "G07", process: "inspection", kind: "gate", priority: 2, order: 13, job, location: where,
        responsible: supervisorLabel(L, plan.contract_id), title: `Inspect ${where} before ${stage} goes ahead`,
        why: "This work needs a mandatory inspection and none has been saved yet. Nothing here passes the inspection for you.",
        due: s.today, requires: ["Pass, fail or not applicable for each check", "A photo where the check asks for one"],
        doneWhen: "A passing inspection is saved for this location and activity", next: "Saved result is available; other restrictions still apply",
        audience: { supervisor: "act", office: "see" }, blocks: INSPECTION_BLOCKS, enforcedByBackend: true,
        source: { table: "location_inspection_requirements", id: pending.requirement.id }, route: { screen: "inspect", id: plan.work_area_id, stage: plan.stage },
      });
    }
  }
  return out;
});

// A01: a critical defect with nobody assigned to repair it. A critical defect does NOT stop work by itself.
rule("A01_critical_snag_unassigned", ({ s, L }) => s.supervisor_issues.filter(i => i.severity === "critical" && i.snag_status === "open" && !i.assigned_team_id).map(i => ({
  id: `snag-critical:${i.id}`, rule: "A01", process: "snag", kind: "alert", priority: 1, order: 5, job: L.job(i.contract_id), location: L.path(i.work_area_id),
  responsible: OFFICE, title: "Review the critical defect",
  why: `${i.check_label}. ${i.description} This does not stop any work by itself. If work in this location must stop, the supervisor records a hold.`,
  due: i.target_date, requires: ["Who will fix it", "A target date"], doneWhen: "A gang and a target date are saved, then the repair is checked and accepted",
  next: "Assign a gang to fix it", audience: { office: "act", owner: "see", supervisor: "see" },
  blocks: null, enforcedByBackend: false, source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id },
})));

// R13: an ordinary snag nobody has been told to fix. Without this rule it would have no owner. It has
// one owner: the supervisor reports, the office decides who fixes it. (Permissions are unchanged: a
// supervisor can still assign it from the snag page.)
rule("R13_snag_needs_gang", ({ s, L }) => s.supervisor_issues.filter(i => i.snag_status === "open" && !i.assigned_team_id && i.severity !== "critical").map(i => ({
  id: `snag-assign:${i.id}`, rule: "R13", process: "snag", kind: "reminder", priority: 2, order: 8, job: L.job(i.contract_id), location: L.path(i.work_area_id),
  responsible: OFFICE, title: "Say who will fix this snag",
  why: `${i.check_label}. ${i.description}`, due: null, requires: ["Which gang", "What they must do", "A target date"], doneWhen: "A gang, repair instructions and a target date are saved on the snag",
  next: "The gang fixes it and sends a photo", audience: { office: "act", supervisor: "see" }, blocks: null, enforcedByBackend: false,
  source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id },
})));

// G10: repair submitted; an independent person must re-inspect before the snag can close.
rule("G10_snag_reinspect", ({ s, L }) => s.supervisor_issues.filter(i => ["rectification_submitted", "reinspection"].includes(i.snag_status)).map(i => {
  const needsOffice = i.severity === "critical" || i.escalated;
  return {
    id: `snag-reinspect:${i.id}`, rule: "G10", process: "snag", kind: "gate", priority: 1, order: 6, job: L.job(i.contract_id), location: L.path(i.work_area_id),
    responsible: needsOffice ? { role: "office", who: null, label: "Office. Critical repairs need the office" }
      : { role: "supervisor", who: L.supervisorOf(i.contract_id)?.display_name ?? null, label: "Site supervisor. Not the person who did the repair" },
    independence: i.rectified_by ? { forbidden: [{ userId: i.rectified_by, reason: `${L.person(i.rectified_by)} did the repair, so someone else has to check it.` }] } : null,
    title: "Check the repair", why: `${i.check_label}. The gang says it is repaired. Look at it in person and add a photo, then accept or send it back.`,
    due: null, requires: ["A look at the repair", "A photo of the result", "A note"], doneWhen: "The repair is accepted or sent back, and saved",
    next: needsOffice ? "Closed once the office accepts" : "Closed once accepted",
    audience: needsOffice ? { office: "act", supervisor: "see", subcontractor: "see", owner: null } : { supervisor: "act", office: "act", subcontractor: "see" },
    blocks: "The snag cannot be closed until someone other than the repairer has checked the repair.", enforcedByBackend: true,
    parties: { teamIds: [i.assigned_team_id] }, source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id },
  };
}));

// R15: responsibility proposed to a gang; disputes go to the office.
rule("R15_responsibility", ({ s, L }) => s.supervisor_issues.filter(i => i.responsibility_state === "proposed" || i.responsibility_state === "disputed").map(i => {
  const disputed = i.responsibility_state === "disputed";
  return {
    id: `snag-responsibility:${i.id}`, rule: "R15", process: "snag", kind: "reminder", priority: 1, order: 7, job: L.job(i.contract_id), location: L.path(i.work_area_id),
    responsible: disputed ? OFFICE : { role: "subcontractor", who: L.teamLead(i.responsibility_team_id), label: L.teams.get(i.responsibility_team_id ?? "")?.name ?? "Named gang" },
    title: disputed ? "Decide who is responsible" : "Say whether this was your gang's work",
    why: `${i.check_label}. The site records show your gang worked here. Being present is evidence of work, not proof of fault.`,
    due: null, requires: ["Accept or dispute", "A short reason"], doneWhen: disputed ? "The office records its decision" : "The gang accepts or disputes",
    next: disputed ? "Repair can be assigned" : "Office reviews if disputed",
    audience: disputed ? { office: "act", owner: null, supervisor: "see" } : { subcontractor: "act", supervisor: "see", office: "see" },
    blocks: null, enforcedByBackend: false, parties: { teamIds: [i.responsibility_team_id] },
    source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id },
  };
}));

// An office message stops asking for anything once it has been withdrawn or replaced by a changed version.
const withdrawnItem = (s: NextActionSnapshot, id: string) => (s.office_item_withdrawals ?? []).some(w => w.item_id === id);
const currentItem = (s: NextActionSnapshot, id: string) => !withdrawnItem(s, id) && !s.supervisor_office_items.some(m => m.replaces_id === id);

// R16: the office has asked this supervisor to inspect something.
rule("R16_qa_request", ({ s, L }) => s.supervisor_office_items.filter(m => m.kind === "qa_request" && !s.supervisor_qa_submissions.some(q => q.item_id === m.id) && currentItem(s, m.id)).map(m => ({
  id: `qa:${m.id}`, rule: "R16", process: "inspection", kind: "reminder", priority: 2, order: 11.5, job: L.job(m.contract_id), location: L.path(m.work_area_id),
  responsible: { role: "supervisor", who: L.person(m.recipient_id), label: "Site supervisor" }, title: `Inspect ${L.path(m.work_area_id)} for the office`,
  why: `${L.person(m.created_by)} asked for this. ${m.body} Sending your result does not approve payment or lift any stop.`,
  due: m.due_on, requires: ["The inspection result", "Send it to the office"], doneWhen: "Your saved inspection is sent back to the office", next: "Office sees the result",
  audience: { supervisor: "act", office: "see" }, actUsers: [m.recipient_id], blocks: null, enforcedByBackend: false,
  source: { table: "supervisor_office_items", id: m.id }, route: { screen: "inspect", id: m.work_area_id, stage: m.stage ?? undefined, qa: m.id },
})));

// A02: subcontractor insurance. The database does NOT check insurance when work is planned, so this is an alert, not a gate.
// Insurance records are append-only: a renewal is a NEW entry, so only the latest entry of each type counts
// (the same as insuranceSummary in lib/operations/companies.ts).
export const latestCover = (s: NextActionSnapshot, companyId: string): InsuranceRow[] => {
  const latest = new Map<string, InsuranceRow>();
  for (const i of s.company_insurances.filter(x => x.company_id === companyId)) {
    const cur = latest.get(i.insurance_type);
    if (!cur || i.expires_on > cur.expires_on) latest.set(i.insurance_type, i);
  }
  return [...latest.values()];
};
const isOpenWork = (a: ActualAllocationRow) => !a.ended_at && !a.voided_at;

rule("A02_insurance_expired", ({ s, L, cfg }) => {
  const out: NextAction[] = [];
  for (const co of s.companies) {
    const teamIds = s.teams.filter(t => t.company_id === co.id).map(t => t.id);
    const soon = s.planned_allocations.filter(p => teamIds.includes(p.team_id) && p.planned_end >= s.today && p.planned_start <= addDays(s.today, cfg.planHorizonDays));
    const actual = s.actual_allocations.find(a => a.team_id && teamIds.includes(a.team_id) && isOpenWork(a));
    const onSite = !!actual;
    if (!soon.length && !onSite) continue;
    const covers = latestCover(s, co.id);
    const expired = covers.filter(i => i.expires_on < s.today);
    if (covers.length && !expired.length) continue;
    const kind = expired[0] ? expired[0].insurance_type.replaceAll("_", " ") : "insurance";
    const plan = soon[0];
    const status = !covers.length ? "has no insurance recorded" : `${kind} cover is out of date`;
    out.push({
      id: `insurance:${co.id}`, rule: "A02", process: "compliance", kind: "alert", priority: onSite ? 1 : 2, order: 12,
      job: plan ? L.job(plan.contract_id) : L.job(actual!.contract_id), location: plan ? L.path(plan.work_area_id) : L.path(actual!.work_area_id),
      responsible: OFFICE, title: `${co.name}: ${covers.length ? `${kind} has expired` : "no insurance on file"}`,
      why: `${co.name} ${onSite ? "is on site" : `is planned from ${plan?.planned_start}`} and ${status}. TileSpec does not stop work being planned for a company without valid cover. The office has to decide before they start.`,
      due: plan?.planned_start ?? null, requires: ["The new certificate", "Its start and end dates"], doneWhen: "Valid cover is saved for the company, or the plan is changed",
      next: "Owner can see the risk is closed", audience: { office: "act", owner: "see", supervisor: onSite ? "see" : null },
      blocks: null, enforcedByBackend: false, source: { table: "company_insurances", id: co.id }, route: { screen: "labour" },
    });
  }
  return out;
});

// S03: snag repairs assigned to a gang.
rule("S03_snag_repair_assigned", ({ s, L }) => s.supervisor_issues.filter(i => ["open", "assigned"].includes(i.snag_status) && i.assigned_team_id).map(i => ({
  id: `snag-fix:${i.id}`, rule: "S03", process: "snag", kind: "reminder", priority: i.severity === "critical" || (i.target_date && i.target_date < s.today) ? 1 : 2, order: 8,
  job: L.job(i.contract_id), location: L.path(i.work_area_id),
  responsible: { role: "subcontractor", who: L.teamLead(i.assigned_team_id), label: L.teams.get(i.assigned_team_id ?? "")?.name ?? "Assigned gang" },
  title: "Fix this snag and send a photo", why: `${i.check_label}. ${i.description}`, instruction: i.assigned_action || null,
  due: i.target_date, requires: ["Photo of the repair", "The date the work was done"],
  doneWhen: "The repair is submitted with a photo", next: "The supervisor checks it in person",
  audience: { subcontractor: "act", supervisor: "see", office: "see" }, blocks: null, enforcedByBackend: false, parties: { teamIds: [i.assigned_team_id] },
  source: { table: "supervisor_issues", id: i.id }, route: { screen: "fix", id: i.id, kind: "snag" },
})));

// R07: chasing overdue fixes. The reminder goes to the person who can chase.
rule("R07_overdue_fix", ({ s, L, cfg }) => {
  const out: NextAction[] = [];
  const overdue = [
    ...s.supervisor_issues.filter(i => ["open", "assigned"].includes(i.snag_status) && i.assigned_team_id && i.target_date && i.target_date < s.today)
      .map(i => ({ kind: "snag" as const, id: i.id, contractId: i.contract_id, areaId: i.work_area_id, team: i.assigned_team_id!, what: i.check_label, target: i.target_date! })),
    ...s.work_holds.filter(h => h.status === "active" && h.assigned_team_id && h.target_date && h.target_date < s.today)
      .map(h => ({ kind: "hold" as const, id: h.id, contractId: h.contract_id, areaId: h.work_area_id, team: h.assigned_team_id!, what: h.reason, target: h.target_date! })),
  ];
  for (const o of overdue) {
    const late = dayDiff(s.today, o.target);
    const team = L.teams.get(o.team)?.name ?? "the gang";
    out.push({
      id: `chase:${o.kind}:${o.id}`, rule: "R07", process: o.kind === "hold" ? "stop-work" : "snag", kind: "reminder", priority: 2, order: 8,
      job: L.job(o.contractId), location: L.path(o.areaId), responsible: OFFICE,
      title: `Chase ${team}: ${late} day${late === 1 ? "" : "s"} late`, why: `${o.what}. It was due ${o.target}.`,
      due: o.target, overdue: true, requires: ["Speak to the gang lead", "Agree a new date"], doneWhen: "The fix is submitted, or a new target date is saved",
      next: "Supervisor checks the repair", audience: { office: "act", supervisor: "see", owner: late > cfg.overdueEscalatesToOwnerAfterDays ? "see" : null },
      blocks: null, enforcedByBackend: false, source: { table: o.kind === "hold" ? "work_holds" : "supervisor_issues", id: o.id },
      route: { screen: o.kind === "hold" ? "hold" : "snag", id: o.id }, contact: team,
    });
  }
  return out;
});

// R01..R06: the supervisor's day. A supervisor working on a site today keeps the
// daily routine whether or not the office has planned anyone there.
const workToday = (s: NextActionSnapshot, contractId: string) =>
  (s.attended_sites ?? []).includes(contractId)
  || s.planned_allocations.some(p => p.contract_id === contractId && p.planned_start <= s.today && p.planned_end >= s.today)
  || s.actual_allocations.some(a => a.contract_id === contractId && a.work_date === s.today && !a.voided_at);

rule("R01_morning_checks", c => c.s.contracts.filter(k => workToday(c.s, k.id) && !c.s.supervisor_inspections.some(m => m.contract_id === k.id && isoDate(m.created_at) === c.s.today)).map(k => ({
  id: `morning:${k.id}:${c.s.today}`, rule: "R01", process: "daily-site", kind: "reminder", priority: 2, order: 9, job: c.L.job(k.id), location: null,
  responsible: supervisorLabel(c.L, k.id), title: "Do the morning checks",
  why: "A two-minute check of people, materials and access before work starts. Problems go straight to the office.", due: c.s.today, requires: ["Yes, no or not applicable for each question"],
  doneWhen: "Morning checks are saved for today", next: "Confirm who is on site",
  audience: { supervisor: "act", office: c.s.now >= c.timingsFor(k.id).morningChecksOfficeSeesAt ? "see" : null },
  blocks: null, enforcedByBackend: false, source: { table: "supervisor_inspections", id: null }, route: { screen: "morning" },
})));

rule("R02_earlier_work_open", ({ s, L }) => {
  const stale = s.actual_allocations.filter(a => isOpenWork(a) && a.work_date < s.today);
  return [...new Set(stale.map(a => a.contract_id))].map(cid => {
    const n = stale.filter(a => a.contract_id === cid).length;
    return {
      id: `stale:${cid}`, rule: "R02", process: "daily-site", kind: "reminder", priority: 2, order: 10, job: L.job(cid), location: null,
      responsible: { role: "supervisor", who: L.supervisorOf(cid)?.display_name ?? null, label: "Site supervisor" }, title: "Finish yesterday's work",
      why: `${n} earlier work ${n === 1 ? "record has" : "records have"} no finish time. Add one before confirming today.`, due: s.today, requires: ["A finish time for each record"],
      doneWhen: "Every earlier work record has a finish time", next: "Confirm who is on site", audience: { supervisor: "act", office: "see" },
      blocks: null, enforcedByBackend: false, source: { table: "actual_allocations", id: stale.find(a => a.contract_id === cid)!.id }, route: { screen: "people", earlier: true },
    } satisfies NextAction;
  });
});

rule("R03_confirm_teams", ({ s, L }) => s.planned_allocations.filter(p => L.covers(p, s.today)
  && !s.actual_allocations.some(a => a.planned_allocation_id === p.id && a.work_date === s.today && !a.voided_at)
  && !s.allocation_absences.some(a => a.planned_allocation_id === p.id && a.work_date === s.today)).map(p => ({
  id: `confirm:${p.id}:${s.today}`, rule: "R03", process: "daily-site", kind: "reminder", priority: 2, order: 11, job: L.job(p.contract_id), location: L.path(p.work_area_id),
  responsible: { role: "supervisor", who: L.supervisorOf(p.contract_id)?.display_name ?? null, label: "Site supervisor" }, title: `Confirm who is here: ${L.teams.get(p.team_id)?.name ?? "the gang"}`,
  why: "The office planned this gang here today. Tap who actually turned up, or say they did not.", due: s.today, requires: ["Who is here", "Or: gang not on site, with a reason"],
  doneWhen: "The gang is confirmed or marked not on site", next: "Check the work as it goes",
  audience: { supervisor: "act", office: "see" }, blocks: null, enforcedByBackend: false, source: { table: "planned_allocations", id: p.id }, route: { screen: "people" },
})));

rule("R04_provisional_person", ({ s }) => s.operatives.filter(o => o.status === "provisional").map(o => ({
  id: `provisional:${o.id}`, rule: "R04", process: "workforce", kind: "reminder", priority: 3, order: 14, job: { id: null, reference: "", name: "Workforce" }, location: null,
  responsible: OFFICE, title: `Confirm ${o.display_name}`, why: "A supervisor added this person on site. The office has not confirmed who they are yet.",
  due: null, requires: ["Full name", "Company", "Engagement"], doneWhen: "The person is confirmed", next: null, audience: { office: "act", supervisor: "see" },
  blocks: null, enforcedByBackend: false, source: { table: "operatives", id: o.id }, route: { screen: "labour" },
})));

const siteSupervisors = (s: NextActionSnapshot, contractId: string) => s.contract_assignments.filter(a => a.contract_id === contractId
  && s.members.some(m => m.user_id === a.user_id && m.role === "supervisor")).map(a => a.user_id);
const everyoneCompleted = (s: NextActionSnapshot, contractId: string, completed: string[]) => {
  const supervisors = siteSupervisors(s, contractId);
  return supervisors.length > 0 && supervisors.every(id => completed.includes(id));
};
const acknowledgers = (s: NextActionSnapshot, itemId: string) => s.supervisor_office_acknowledgements.filter(a => a.item_id === itemId).map(a => a.user_id);
// An urgent instruction sits above everything except safety stops. A changed one says what it replaces.
rule("R05_instruction_unread", ({ s, L }) => s.supervisor_office_items.filter(m => m.kind === "instruction" && m.acknowledgement_required && currentItem(s, m.id)
  && !(m.recipient_id ? acknowledgers(s, m.id).includes(m.recipient_id) : everyoneCompleted(s, m.contract_id, acknowledgers(s, m.id)))).map(m => {
  const replaced = m.replaces_id ? s.supervisor_office_items.find(o => o.id === m.replaces_id) : undefined;
  return {
    id: `ack:${m.id}`, rule: "R05", process: "daily-site", kind: "reminder", priority: m.urgent ? 0 : 2, order: m.urgent ? 3 : 9.5, job: L.job(m.contract_id), location: null,
    responsible: { role: "supervisor", who: L.person(m.recipient_id), label: "Site supervisor" },
    title: `${m.urgent ? "Urgent" : replaced ? "Changed" : "Read"}: ${m.title}`, why: replaced ? `${m.body} This replaces “${replaced.title}”.` : m.body,
    due: null, requires: ["Tap Got it"],
    doneWhen: "You acknowledge it", next: null, audience: { supervisor: "act", office: "see" }, actUsers: m.recipient_id ? [m.recipient_id] : null,
    completedUsers: acknowledgers(s, m.id),
    blocks: null, enforcedByBackend: false, source: { table: "supervisor_office_items", id: m.id }, route: { screen: "messages" },
  } satisfies NextAction;
}));

// R18/R19: what site sent back that the office has not reviewed yet. Only once office reviews
// exist in the database; before that the same records are listed under "From site" instead.
const reviewSince = (s: NextActionSnapshot, cfg: NextActionConfig) => addDays(s.today, -(cfg.siteUpdateDays - 1));
const briefly = (text: string, length = 180) => (text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text);
rule("R18_review_result", ({ s, L, cfg }) => !s.office_reviews ? [] : (s.qa_results ?? []).filter(r => r.has_issues && !!r.submission_id
  && isoDate(r.submitted_at) >= reviewSince(s, cfg) && !s.office_reviews!.some(v => v.qa_submission_id === r.submission_id)).map(r => ({
  id: `review-result:${r.submission_id}`, rule: "R18", process: "inspection", kind: "reminder", priority: 2, order: 11.6,
  job: L.job(r.contract_id), location: r.location_path.join(" › ") || null, responsible: OFFICE,
  title: `Review the inspection result: ${r.title}`,
  why: `${r.submitted_by_name ?? "The supervisor"} found problems.${r.followed_up ? " A snag or stop has already been raised from it." : ""} Decide what happens next and record it.`,
  due: null, requires: ["What you did about it", "A short note if useful"], doneWhen: "The office review is saved", next: "The supervisor sees it was reviewed",
  audience: { office: "act", owner: "act", supervisor: "see" }, blocks: null, enforcedByBackend: false,
  source: { table: "supervisor_qa_submissions", id: r.submission_id ?? null }, route: { screen: "inspect", qa: r.item_id },
})));
rule("R19_review_handover", ({ s, L, cfg }) => !s.office_reviews ? [] : (s.handover_notes ?? []).filter(h => h.work_date >= reviewSince(s, cfg)
  && [h.office_notes, h.outstanding_problems, h.areas_awaiting_attention].some(text => (text ?? "").trim()) && !s.office_reviews!.some(v => v.handover_id === h.id)).map(h => {
  const [label, text] = ([["For the office", h.office_notes], ["Problems", h.outstanding_problems], ["Needs attention", h.areas_awaiting_attention]] as const).find(([, value]) => (value ?? "").trim())!;
  return {
    id: `review-handover:${h.id}`, rule: "R19", process: "daily-site", kind: "reminder", priority: 2, order: 15.5, job: L.job(h.contract_id), location: null,
    responsible: OFFICE, title: `Read ${h.actor_name}’s handover`, why: briefly(`${h.work_date === s.today ? "Today" : h.work_date}. ${label}: ${text.trim()}`),
    due: null, requires: ["What you did about it", "A short note if useful"], doneWhen: "The office review is saved", next: "The supervisor sees it was reviewed",
    audience: { office: "act", owner: "act" }, blocks: null, enforcedByBackend: false,
    source: { table: "site_handovers", id: h.id }, route: { screen: "handover-review", id: h.id },
  } satisfies NextAction;
}));

// R20/R21: a conversation waiting on one side. Only a message marked "I need an answer" waits on
// the office; a reply from the office waits until the supervisor has read it or answered. Both go
// as soon as the saved messages or read receipts change. Only once job messages exist in the database.
const oneLine = (text: string, length = 80) => briefly(text.trim().split(/\n/)[0], length);
rule("R20_reply_to_site", ({ s, L }) => (s.job_threads ?? []).filter(t => t.waiting_on === "office").map(t => ({
  id: `thread-reply:${t.id}`, rule: "R20", process: "daily-site", kind: "reminder", priority: 2, order: 9.6, job: L.job(t.contract_id), location: null,
  responsible: OFFICE, title: `Reply to ${t.latest.author_name}: ${oneLine(t.latest.body)}`,
  why: `${t.about}. ${t.latest.author_name} needs an answer.`,
  due: null, requires: ["Your reply"], doneWhen: "A reply is saved on the conversation", next: `${t.latest.author_name} sees your reply on Today`,
  audience: { office: "act", owner: "act" }, blocks: null, enforcedByBackend: false,
  source: { table: "job_messages", id: t.latest.id }, route: { screen: "thread", id: t.id },
} satisfies NextAction)));
rule("R21_reply_from_office", ({ s, L }) => (s.job_threads ?? []).filter(t => t.waiting_on === "site").map(t => ({
  id: `thread-read:${t.id}`, rule: "R21", process: "daily-site", kind: "reminder", priority: 2, order: 9.6, job: L.job(t.contract_id), location: null,
  responsible: { role: "supervisor", who: L.person(t.site_user_id), label: "Site supervisor" },
  title: `${t.latest.needs_answer ? "Answer" : "Reply from"} ${t.latest.author_name}: ${oneLine(t.latest.body)}`,
  why: `${t.about}.${t.latest.needs_answer ? " The office needs your answer." : ""}`,
  due: null, requires: t.latest.needs_answer ? ["Your reply"] : ["Read it", "Tap Got it, or reply"],
  doneWhen: t.latest.needs_answer ? "You reply on the conversation" : "You tap Got it or reply", next: "The office sees you have seen it",
  audience: { supervisor: "act" }, actUsers: [t.site_user_id], blocks: null, enforcedByBackend: false,
  source: { table: "job_messages", id: t.latest.id }, route: { screen: "thread", id: t.id },
} satisfies NextAction)));

// R22-R28: dayworks (M4). Each action is worked out from the saved statuses only; the engine
// never sees a rate, price or total. Pricing and the internal charge approval are money
// actions, hidden from office users without money access. Nobody approves what they submitted.
const dw = (d: { number: number }) => `DW-${d.number}`;
const short = (text: string) => briefly(text, 70);
const submittedBarred = (s: NextActionSnapshot, d: { submitted_by: string[] }, what: string) => ({ forbidden: d.submitted_by
  .filter(id => s.members.find(m => m.user_id === id)?.role !== "owner")
  .map(userId => ({ userId, reason: `You recorded or sent this daywork, so another office user must ${what}.` })) });
const dayworkBase = (d: NonNullable<NextActionSnapshot["dayworks"]>[number]) => ({
  process: "daily-site" as const, kind: "reminder" as const, location: null, blocks: null, enforcedByBackend: false, due: null,
  source: { table: "dayworks", id: d.id }, route: { screen: "daywork", id: d.id },
});
rule("R22_review_daywork", ({ s, L }) => (s.dayworks ?? []).filter(d => d.office_status === "awaiting_review").map(d => ({
  ...dayworkBase(d), id: `daywork-review:${d.id}`, rule: "R22", priority: 2, order: 11.2, job: L.job(d.contract_id), responsible: OFFICE,
  title: `Review daywork ${dw(d)}: ${short(d.description)}`, why: "Site has sent extra work paid by the hour. Approve it, ask for more detail or reject it.",
  requires: ["Your decision", "A note if you need more detail or reject it"], doneWhen: "The office decision is saved", next: "The supervisor sees the decision",
  audience: { office: "act", owner: "act", supervisor: "see" }, independence: submittedBarred(s, d, "approve it"),
} satisfies NextAction)));
rule("R23_send_daywork", ({ s, L }) => (s.dayworks ?? []).filter(d => d.site_status === "recorded" && d.office_status === null).map(d => ({
  ...dayworkBase(d), id: `daywork-send:${d.id}`, rule: "R23", priority: 3, order: 14.6, job: L.job(d.contract_id), responsible: supervisorLabel(L, d.contract_id),
  title: `Send daywork ${dw(d)} to the office`, why: `${short(d.description)}. It is saved but the office has not seen it yet.`,
  requires: ["The people, plant and materials"], doneWhen: "It is sent to the office", next: "The office reviews it",
  audience: { supervisor: "act" },
} satisfies NextAction)));
rule("R24_daywork_detail", ({ s, L }) => (s.dayworks ?? []).filter(d => d.office_status === "more_detail").map(d => ({
  ...dayworkBase(d), id: `daywork-detail:${d.id}`, rule: "R24", priority: 2, order: 9.7, job: L.job(d.contract_id), responsible: supervisorLabel(L, d.contract_id),
  title: `Office needs more detail on daywork ${dw(d)}`, why: `${short(d.description)}. Add what the office asked for and send it again.`,
  requires: ["The detail the office asked for"], doneWhen: "It is sent to the office again", next: "The office reviews it",
  audience: { supervisor: "act", office: "see" },
} satisfies NextAction)));
rule("R25_daywork_signature", ({ s, L }) => (s.dayworks ?? []).filter(d => d.signoff_status === "none" && d.office_status !== "rejected").map(d => ({
  ...dayworkBase(d), id: `daywork-sign:${d.id}`, rule: "R25", priority: 3, order: 14.7, job: L.job(d.contract_id), responsible: supervisorLabel(L, d.contract_id),
  title: `Get daywork ${dw(d)} signed`, why: "Ask the client's site representative to sign the sheet. It confirms the work, hours and materials only, not payment. If they refuse or are not there, record that.",
  requires: ["Their name and position, or why it was not signed"], doneWhen: "The signature, a refusal or their absence is recorded", next: null,
  audience: { supervisor: "act" },
} satisfies NextAction)));
rule("R26_price_daywork", ({ s, L }) => (s.dayworks ?? []).filter(d => d.site_status === "sent" && d.office_status !== "rejected" && d.commercial_status === "awaiting_pricing").map(d => ({
  ...dayworkBase(d), id: `daywork-price:${d.id}`, rule: "R26", priority: 3, order: 16.1, job: L.job(d.contract_id), responsible: OFFICE,
  title: `Price daywork ${dw(d)}`, why: "Price each line from the job's day rates. It stays awaiting pricing until every line has a rate.",
  requires: ["A day rate for every line"], doneWhen: "Every line is priced", next: "The charge can be approved internally",
  audience: { office: "act", owner: "act" }, financial: true,
} satisfies NextAction)));
rule("R27_approve_daywork_charge", ({ s, L }) => (s.dayworks ?? []).filter(d => d.office_status === "approved" && d.commercial_status === "priced").map(d => ({
  ...dayworkBase(d), id: `daywork-charge:${d.id}`, rule: "R27", priority: 3, order: 16.2, job: L.job(d.contract_id), responsible: OFFICE,
  title: `Approve the charge for daywork ${dw(d)}`, why: "TileSPEC's internal approval of the priced charge. It is not the client's acceptance or agreement to pay.",
  requires: ["Check the priced lines"], doneWhen: "The charge is approved internally", next: null,
  audience: { office: "act", owner: "act" }, financial: true, independence: submittedBarred(s, d, "approve its charge"),
} satisfies NextAction)));
rule("R28_daywork_client", ({ s, L }) => (s.dayworks ?? []).filter(d => d.office_status === "approved" && d.client_status === "not_authorised").map(d => ({
  ...dayworkBase(d), id: `daywork-client:${d.id}`, rule: "R28", priority: 3, order: 16.3, job: L.job(d.contract_id), responsible: OFFICE,
  title: `Record the client's decision on daywork ${dw(d)}`, why: "The client has not authorised this cost yet. Record their authorisation with its instruction reference or document, or that they declined.",
  requires: ["Who decided for the client", "Their instruction reference or document"], doneWhen: "The client's decision is recorded", next: null,
  audience: { office: "act", owner: "act" },
} satisfies NextAction)));

const handoverAuthors = (s: NextActionSnapshot, contractId: string) => s.site_handovers.filter(h => h.contract_id === contractId && h.work_date === s.today)
  .map(h => h.actor_id).filter((id): id is string => !!id);
rule("R06_handover", c => c.s.contracts.filter(k => workToday(c.s, k.id) && !everyoneCompleted(c.s, k.id, handoverAuthors(c.s, k.id))).map(k => {
  const t = c.timingsFor(k.id);
  return {
    id: `handover:${k.id}:${c.s.today}`, rule: "R06", process: "daily-site", kind: "reminder", priority: 3, order: 15, job: c.L.job(k.id), location: null,
    responsible: supervisorLabel(c.L, k.id), title: "Send today's handover",
    why: "Tell the office what is finished, what is stuck and what you need tomorrow. Today's records are filled in for you.", due: c.s.today, requires: ["Check the summary", "Add anything missing"],
    doneWhen: "Today's handover is saved", next: "Office reads it",
    audience: { supervisor: c.s.now >= t.handoverReminderAt ? "act" : null, office: c.s.now >= t.handoverOfficeSeesAt ? "see" : null },
    completedUsers: handoverAuthors(c.s, k.id),
    blocks: null, enforcedByBackend: false, source: { table: "site_handovers", id: null }, route: { screen: "handover" },
  } satisfies NextAction;
}));

// R08: setting a job up. One action per missing step, in a fixed order.
rule("R08_job_setup", ({ s, L, cfg }) => {
  const out: NextAction[] = [];
  for (const c of s.contracts) {
    if ((c.start_date && c.start_date > addDays(s.today, cfg.jobSetupLeadDays)) || (c.end_date && c.end_date < s.today)) continue;
    const job = L.job(c.id);
    const steps: [string, string, string, string[], string, string][] = [];
    const locs = s.work_areas.filter(a => a.contract_id === c.id);
    const planned = s.planned_allocations.some(p => p.contract_id === c.id && p.planned_end >= s.today && p.planned_start <= addDays(s.today, cfg.planHorizonDays));
    const docs = s.document_revisions.filter(d => d.contract_id === c.id);
    if (!c.start_date || !c.end_date) steps.push(["details", "Complete the job dates", "The saved job has no complete programme dates. Add the agreed start and finish dates.", ["Agreed start date", "Agreed finish date"], "Programme dates are saved", "Plan the job against the agreed dates"]);
    if (!locs.length) steps.push(["locations", "Add the locations", "Blocks, floors, flats or rooms you will work in.", ["Names of areas"], "Locations are saved", "Plan who works where"]);
    if (!L.supervisorOf(c.id)) steps.push(["supervisor", "Give the job a supervisor", "Nobody is looking after this job on site yet.", ["Which supervisor"], "A supervisor is allocated", "They see the job on their phone"]);
    if (!docs.length || !c.tile_specification) steps.push(["spec", "Add the specification and drawings", "Supervisors and gangs need them on site.", ["Specification", "Drawings"], "Documents and spec fields are saved", "Gangs can open them"]);
    if (locs.length && (!c.start_date || c.start_date <= addDays(s.today, cfg.planHorizonDays)) && !planned) steps.push(["plan", "Plan who works where", `Nothing is planned for the next ${cfg.planHorizonDays} days.`, ["Gang", "Location", "Stage", "Dates"], "A plan covers the next working days", "The supervisor confirms it on site"]);
    steps.forEach(([key, title, why, requires, doneWhen, next], idx) => out.push({
      id: `setup:${c.id}:${key}`, rule: "R08", process: "job-setup", kind: "reminder", priority: 3, order: 20 + idx, job, location: null, responsible: OFFICE,
      title, why, due: c.start_date, requires, doneWhen, next, audience: { office: "act", owner: null }, blocks: null, enforcedByBackend: false,
      source: { table: "contracts", id: c.id }, route: { screen: "job", id: c.id, step: key },
    }));
  }
  return out;
});

// Existing morning-check findings use their original workflow, not a made-up
// snag severity/repair assignment. They need office attention but stop no work
// by themselves; deliberate holds remain separate saved controls.
rule("R17_morning_finding", ({ s, L }) => (s.readiness_issues ?? []).filter(issue => issue.state !== "closed").map(issue => ({
  id: `readiness:${issue.id}`, rule: "R17", process: "daily-site", kind: "reminder", priority: 2, order: 10,
  job: L.job(issue.contract_id), location: null, responsible: OFFICE,
  title: `Review the morning finding: ${issue.check_label}`, why: `${issue.description} This finding does not release or stop work by itself. Existing restrictions still apply.`,
  due: null, requires: ["Review the saved finding", "Record the follow-up in its existing workflow"],
  doneWhen: "The original finding is closed through its existing workflow", next: null,
  audience: { office: "act", owner: "see", supervisor: "see" }, blocks: null, enforcedByBackend: false,
  source: { table: "supervisor_issues", id: issue.id }, route: { screen: "snag", id: issue.id },
})));

rule("R09_missing_checklist", ({ s, L, cfg }) => s.planned_allocations.filter(p => p.planned_end >= s.today && p.planned_start <= addDays(s.today, cfg.planHorizonDays)
  && !s.location_inspection_templates.some(t => t.contract_id === p.contract_id && t.stage === p.stage && L.under(p.work_area_id, t.work_area_id))).map(p => ({
  id: `checklist:${p.id}`, rule: "R09", process: "inspection", kind: "reminder", priority: 3, order: 21, job: L.job(p.contract_id), location: L.path(p.work_area_id),
  responsible: OFFICE, title: `Publish the ${STAGE_LABEL[p.stage]} checks`, why: `A gang is planned here from ${p.planned_start} but the supervisor has no checklist to inspect against.`,
  due: p.planned_start, requires: ["The approved specification", "The checks to do"], doneWhen: "A current checklist covers this location and activity", next: "Supervisor can inspect",
  audience: { office: "act", supervisor: "see" }, blocks: null, enforcedByBackend: false, source: { table: "location_inspection_templates", id: null }, route: { screen: "job", id: p.contract_id, locationId: p.work_area_id, stage: p.stage },
})));

rule("R10_installer_cannot_see_job", ({ s, L, cfg }) => {
  const out: NextAction[] = [];
  for (const p of s.planned_allocations.filter(x => x.planned_end >= s.today && x.planned_start <= addDays(s.today, cfg.planHorizonDays) && x.work_package_id)) {
    const logins = s.team_memberships.filter(m => m.team_id === p.team_id).map(m => s.operatives.find(o => o.id === m.operative_id)).filter(o => o && o.user_id);
    for (const op of logins) {
      if (!op || s.package_assignments.some(a => a.user_id === op.user_id && a.work_package_id === p.work_package_id)) continue;
      out.push({
        id: `access:${p.id}:${op.user_id}`, rule: "R10", process: "job-setup", kind: "reminder", priority: 3, order: 22, job: L.job(p.contract_id), location: L.path(p.work_area_id),
        responsible: OFFICE, title: `${op.display_name} cannot see this job on their phone yet`,
        why: "The plan names their gang, but they have not been given access to the work package. This is entered twice today (plan and package access).", due: p.planned_start,
        requires: ["Give them access to the package"], doneWhen: "Package access is saved", next: "They see today's job", audience: { office: "act" },
        blocks: null, enforcedByBackend: false, source: { table: "package_assignments", id: null }, route: { screen: "job", id: p.contract_id },
      });
    }
  }
  return out;
});

rule("R11_insurance_expiring", ({ s, cfg }) => {
  const out: NextAction[] = [];
  for (const co of s.companies) {
    const soon = latestCover(s, co.id).filter(i => i.expires_on >= s.today && dayDiff(i.expires_on, s.today) <= cfg.insuranceWarningDays);
    for (const i of soon) out.push({
      id: `insurance-soon:${i.id}`, rule: "R11", process: "compliance", kind: "reminder", priority: 3, order: 23, job: { id: null, reference: "", name: co.name }, location: null,
      responsible: OFFICE, title: `${co.name}: ${i.insurance_type.replaceAll("_", " ")} runs out in ${dayDiff(i.expires_on, s.today)} days`,
      why: "Ask for the renewed certificate before it expires.", due: i.expires_on, requires: ["The renewed certificate"], doneWhen: "New cover is saved", next: null, audience: { office: "act" },
      blocks: null, enforcedByBackend: false, source: { table: "company_insurances", id: i.id }, route: { screen: "labour" },
    });
  }
  return out;
});

// R14: the margin. There is no way to RECORD owner acceptance today, so this is information for the owner,
// never a gate and never a button that would lead nowhere.
rule("R14_margin_below_target", ({ s, L }) => s.commercials.map(c => ({ c, b: budgetOf(c) })).filter(({ c, b }) => b.margin !== null && b.margin < c.target_margin).map(({ c, b }) => ({
  id: `margin:${c.contract_id}`, rule: "R14", process: "money", kind: "reminder", priority: 2, order: 19, job: L.job(c.contract_id), location: null,
  responsible: { role: "owner", who: null, label: "Owner" }, title: `Budget margin is ${b.margin!.toFixed(1)}%, target is ${Number(c.target_margin).toFixed(0)}%`,
  why: `Budgeted profit after reserve is ${pounds(b.profit)} on ${pounds(b.value)}. These are original budgets only: actual costs, variations and claims are not recorded.`,
  due: null, requires: [], doneWhen: "Nothing to record. TileSpec cannot yet record an owner decision on margin", next: null,
  audience: { owner: "act", office: "see" }, blocks: null, enforcedByBackend: false, financial: true, informationOnly: true,
  source: { table: "contract_commercials", id: c.contract_id }, route: { screen: "money" },
})));
