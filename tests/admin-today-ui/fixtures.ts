// Synthetic records for the disposable component harness only. This module is
// never imported by an application route, database loader or production build.
import type { Member } from "@/lib/auth";
import { buildQueue, compute, queueCounts, queueIds, withoutFigures } from "@/lib/operations/next-actions/engine";
import { DEFAULT_CONFIG } from "@/lib/operations/next-actions/config";
import type { HoldRow, NextActionSnapshot, Viewer } from "@/lib/operations/next-actions/types";

export const scenarioKeys = ["office", "office-finance", "owner"] as const;
export type ScenarioKey = typeof scenarioKeys[number];
const id = (part: number) => `a0000000-0000-4000-8000-${String(part).padStart(12, "0")}`;
export const siteId = id(1);
const ownerId = id(2), officeId = id(3), financeId = id(4), supervisorId = id(5), otherId = id(6);
const areaId = id(10), teamId = id(11), companyId = id(12), planId = id(13);

export function fixtureFor(key: ScenarioKey, ordinary = false) {
  if (!scenarioKeys.includes(key)) throw new Error("Unknown test-only role fixture");
  const member: Member = {
    organisation_id: id(99), user_id: key === "owner" ? ownerId : key === "office-finance" ? financeId : officeId,
    display_name: key === "owner" ? "Paul Owner" : "Olivia Contracts Manager With A Long Display Name",
    role: key === "owner" ? "owner" : "contracts_manager", financial_access: key !== "office", active: true,
  };
  const viewer: Viewer = { user_id: member.user_id, role: member.role, financial_access: member.financial_access };
  const hold = (part: number, status: HoldRow["status"] = "awaiting_release"): HoldRow => ({
    id: id(part), contract_id: siteId, work_area_id: areaId, hold_type: "quality", status,
    reason: `Saved restriction ${part}: waterproofing needs an independent review of the recorded photographic evidence`,
    required_action: "Correct the junction and submit photographs before a different person reviews it",
    raised_by: supervisorId, corrected_by: otherId, assigned_team_id: teamId, assigned_operative_id: null,
    target_date: null, critical_snags_open: false, stage: "waterproofing", activity: "Bathroom floor membrane and perimeter junctions",
    work_package_id: id(14), work_package_name: "Flat thirty-one bathroom floor and walls with an exceptionally long package name",
    location_path: ["North block", "Level three", "Flat thirty-one", "Bathroom"],
  });
  const snapshot: NextActionSnapshot = {
    today: "2026-10-16", now: "18:00",
    members: [
      { user_id: ownerId, display_name: "Paul Owner", role: "owner", financial_access: true },
      { user_id: officeId, display_name: "Olivia Office", role: "contracts_manager", financial_access: false },
      { user_id: financeId, display_name: "Frances Finance", role: "contracts_manager", financial_access: true },
      { user_id: supervisorId, display_name: "Sam Site Supervisor", role: "supervisor", financial_access: false },
      { user_id: otherId, display_name: "Independent Repairer", role: "lead_installer", financial_access: false },
    ],
    contracts: [{ id: siteId, reference: "UI-ONLY-2041", name: "Synthetic riverside refurbishment with a deliberately very long saved job name", start_date: "2026-10-15", end_date: "2026-12-31", working_hours: "07:30 to 16:30", tile_specification: "Approved test specification" }],
    commercials: [{ contract_id: siteId, contract_value: 11111111, labour_budget: 9999999, materials_budget: 111111, preliminaries_budget: 222222, contingency: 333333, target_margin: 77 }],
    contract_assignments: [supervisorId, officeId, financeId].map(user_id => ({ contract_id: siteId, user_id })), package_assignments: [],
    work_areas: [{ id: areaId, contract_id: siteId, name: "BathroomWithAnExceptionallyLongUnbrokenSavedLocationNameToExercisePhoneWrapping", parent_id: null, path_ids: [areaId] }],
    companies: [{ id: companyId, name: "Synthetic subcontractor with a deliberately lengthy company name" }],
    company_insurances: [{ id: id(15), company_id: companyId, insurance_type: "public_liability", expires_on: "2026-10-01" }],
    teams: [{ id: teamId, name: "Bathroom installation gang with a long saved team name", company_id: companyId }],
    operatives: Array.from({ length: 24 }, (_, index) => ({ id: id(200 + index), display_name: `Provisional colleague ${index + 1} with a long surname requiring office confirmation`, company_id: companyId, user_id: null, status: "provisional" })),
    team_memberships: [],
    planned_allocations: [{ id: planId, contract_id: siteId, work_area_id: areaId, work_package_id: null, team_id: teamId, stage: "waterproofing", planned_start: "2026-10-16", planned_end: "2026-10-20" }],
    actual_allocations: [], allocation_absences: [], supervisor_inspections: [],
    location_inspection_templates: [{ id: id(16), contract_id: siteId, work_area_id: areaId, stage: "waterproofing", mandatory: true }],
    location_inspection_requirements: [{ id: id(17), contract_id: siteId, work_area_id: areaId, stage: "waterproofing", applicability: "required", template_id: id(16), work_package_id: null, created_at: "2026-10-15T10:00:00Z", template_current: true }],
    location_inspections: [], supervisor_issues: [],
    work_holds: [
      ...Array.from({ length: 24 }, (_, index) => hold(300 + index)),
      { ...hold(350), raised_by: member.user_id },
      { ...hold(351), critical_snags_open: true },
      { ...hold(352, "active"), hold_type: "safety", assigned_team_id: null, corrected_by: null, reason: "Unsafe access is stopped only at the recorded bathroom membrane junction" },
      { ...hold(353, "active"), target_date: "2026-10-01", reason: "Saved overdue correction is waiting on the assigned gang" },
    ],
    supervisor_office_items: [
      { id: id(18), contract_id: siteId, kind: "instruction", title: "Read the revised delivery instructions", body: "Saved instruction awaiting the named supervisor's acknowledgement", recipient_id: supervisorId, acknowledgement_required: true, work_area_id: null, stage: null, created_by: officeId, created_at: "2026-10-16T08:00:00Z", due_on: null },
      { id: id(19), contract_id: siteId, kind: "qa_request", title: "Check the bathroom membrane", body: "Saved QA request awaiting an actual inspection result", recipient_id: supervisorId, acknowledgement_required: false, work_area_id: areaId, stage: "waterproofing", created_by: officeId, created_at: "2026-10-16T09:00:00Z", due_on: "2026-10-16" },
    ],
    supervisor_office_acknowledgements: [], supervisor_qa_submissions: [], site_handovers: [],
    document_revisions: [{ id: id(20), contract_id: siteId }],
    // What came back from site: one inspection result with problems and one handover with long notes for the office.
    qa_results: [{ item_id: id(21), contract_id: siteId, title: "Check the kitchen splashback before grout", location_path: ["Block B", "Level 3", "Flat 31", "Kitchen"],
      inspection_id: id(22), has_issues: true, submitted_at: "2026-10-16T11:00:00Z", submitted_by_name: "Dave Collins With A Deliberately Long Display Name", followed_up: false }],
    handover_notes: [{ id: id(23), contract_id: siteId, actor_name: "Dave Collins", work_date: "2026-10-16", created_at: "2026-10-16T16:30:00Z",
      outstanding_problems: "Lippage at the socket cut-out needs resetting before grout.", areas_awaiting_attention: "",
      office_notes: "Possible daywork: the main contractor asked us to tile the bin store wall, about six square metres. Not authorised yet; please confirm before Monday so the gang can plan the work." }],
  };
  if (ordinary) {
    snapshot.contracts[0].reference = "J-2041";
    snapshot.contracts[0].name = "Riverside Quay";
    snapshot.work_areas[0].name = "Bathroom";
  }
  return { member, viewer, snapshot, config: DEFAULT_CONFIG };
}

// Expected IDs come from the unchanged shared engine. The browser independently
// checks that rendering neither drops, duplicates nor miscounts any engine task.
export function expectedFor(key: ScenarioKey) {
  const fixture = fixtureFor(key);
  const queue = buildQueue(withoutFigures(compute(fixture.snapshot, fixture.viewer, fixture.config)), { groupExceptions: key === "owner" });
  return {
    heroId: queue.next?.id ?? null, ids: queueIds(queue), counts: queueCounts(queue),
    then: queue.then.map(action => action.id), waiting: queue.waiting.map(action => action.id),
    exceptions: queue.exceptions.map(action => action.id), holds: fixture.snapshot.work_holds,
  };
}
