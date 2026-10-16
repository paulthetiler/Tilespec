/*
 * Types for the shared Next Action rules engine.
 *
 * The snapshot mirrors rows that already exist in the database (table and column
 * names are the real ones). The engine only reads a snapshot. It never writes,
 * approves, releases or authorises anything.
 */

export type MemberRole = "owner" | "contracts_manager" | "supervisor" | "lead_installer" | "subcontract_installer";
export type RoleKey = "owner" | "office" | "supervisor" | "subcontractor";

export type InstallationStageKey = "preparation" | "waterproofing" | "installation" | "grouting" | "sealant" | "protection" | "remedial";

export interface MemberRow { user_id: string; display_name: string; role: MemberRole; financial_access: boolean }
export interface ContractRow {
  id: string; reference: string; name: string; start_date: string; end_date: string;
  working_hours: string; tile_specification: string;
}
export interface CommercialRow {
  contract_id: string; contract_value: number; labour_budget: number; materials_budget: number;
  preliminaries_budget: number; contingency: number; target_margin: number;
}
export interface ContractAssignmentRow { contract_id: string; user_id: string }
export interface PackageAssignmentRow { contract_id: string; work_package_id: string; user_id: string }
export interface WorkAreaRow { id: string; contract_id: string; name: string; path_ids: string[]; parent_id: string | null }
export interface CompanyRow { id: string; name: string }
export interface InsuranceRow { id: string; company_id: string; insurance_type: string; expires_on: string }
export interface TeamRow { id: string; name: string; company_id: string | null }
export interface OperativeRow { id: string; display_name: string; company_id: string | null; user_id: string | null; status: string }
export interface TeamMembershipRow { team_id: string; operative_id: string; is_lead: boolean }
export interface PlannedAllocationRow {
  id: string; contract_id: string; work_area_id: string; work_package_id: string | null; team_id: string;
  stage: InstallationStageKey; planned_start: string; planned_end: string;
}
export interface ActualAllocationRow {
  id: string; contract_id: string; planned_allocation_id: string | null; work_area_id: string | null; team_id: string | null;
  work_date: string; started_at: string; ended_at: string | null; voided_at: string | null;
}
export interface AbsenceRow { planned_allocation_id: string; work_date: string }
export interface MorningCheckRow { id: string; contract_id: string; created_at: string }
export interface HandoverRow { id: string; contract_id: string; actor_id?: string; work_date: string; created_at: string }
export interface InspectionTemplateRow { id: string; contract_id: string; work_area_id: string; stage: InstallationStageKey; mandatory?: boolean }
/** Only `required` records a mandatory inspection. No record at all means "not yet decided", which never counts as allowed. */
export interface InspectionRequirementRow {
  id: string; contract_id: string; work_area_id: string; stage: InstallationStageKey; applicability: "required" | "not_required";
  template_id?: string | null; work_package_id?: string | null; created_at?: string; template_current?: boolean;
}
/** `blocking_failure` is derived by the loader with the existing `inspectionHasBlockingFailure`. The engine does not re-implement it. */
export interface InspectionRow {
  id: string; contract_id: string; work_area_id: string; stage: InstallationStageKey; blocking_failure: boolean; created_at: string;
  template_id?: string; work_package_id?: string | null;
}
export type SnagStatus = "draft" | "open" | "assigned" | "rectification_submitted" | "reinspection" | "closed" | "cancelled";
export interface SnagRow {
  id: string; contract_id: string; work_area_id: string | null; check_label: string; description: string;
  severity: "minor" | "major" | "critical" | null; snag_status: SnagStatus; assigned_team_id: string | null; target_date: string | null;
  raised_by: string | null; rectified_by: string | null; escalated: boolean;
  responsibility_state: string | null; responsibility_team_id: string | null;
}
export type HoldStatus = "active" | "correction_submitted" | "awaiting_release" | "released" | "superseded" | "entered_in_error";
export interface HoldRow {
  id: string; contract_id: string; work_area_id: string | null; hold_type: "quality" | "safety"; status: HoldStatus;
  reason: string; required_action: string; raised_by: string; corrected_by: string | null;
  assigned_team_id: string | null; assigned_operative_id: string | null; target_date: string | null; critical_snags_open: boolean;
  stage?: string | null; activity?: string; work_package_id?: string | null; work_package_name?: string | null; location_path?: string[];
}
export interface OfficeItemRow {
  id: string; contract_id: string; kind: "instruction" | "qa_request"; title: string; body: string; recipient_id: string | null;
  acknowledgement_required: boolean; work_area_id: string | null; stage: string | null; created_by: string; created_at: string; due_on: string | null;
}
export interface AcknowledgementRow { item_id: string; user_id: string }
export interface QaSubmissionRow { item_id: string }

export interface NextActionSnapshot {
  /** Today in Europe/London, YYYY-MM-DD. */
  today: string;
  /** The time now in Europe/London, HH:MM. */
  now: string;
  members: MemberRow[];
  contracts: ContractRow[];
  commercials: CommercialRow[];
  contract_assignments: ContractAssignmentRow[];
  package_assignments: PackageAssignmentRow[];
  work_areas: WorkAreaRow[];
  companies: CompanyRow[];
  company_insurances: InsuranceRow[];
  teams: TeamRow[];
  operatives: OperativeRow[];
  team_memberships: TeamMembershipRow[];
  planned_allocations: PlannedAllocationRow[];
  actual_allocations: ActualAllocationRow[];
  allocation_absences: AbsenceRow[];
  supervisor_inspections: MorningCheckRow[];
  location_inspection_templates: InspectionTemplateRow[];
  location_inspection_requirements: InspectionRequirementRow[];
  location_inspections: InspectionRow[];
  supervisor_issues: SnagRow[];
  work_holds: HoldRow[];
  supervisor_office_items: OfficeItemRow[];
  supervisor_office_acknowledgements: AcknowledgementRow[];
  supervisor_qa_submissions: QaSubmissionRow[];
  site_handovers: HandoverRow[];
  document_revisions: { id: string; contract_id: string }[];
}

export interface Viewer { user_id: string; role: MemberRole; financial_access: boolean }

/**
 * gate     A step of a control the existing backend enforces (hold release, mandatory inspection, independent re-inspection).
 *          Nobody can dismiss it. TileSpec never completes it for anyone.
 * alert    Prominent escalation of something that matters but is NOT blocked by the database (expired insurance, a critical
 *          defect that has no repair assigned). It is a rule people follow, and the wording must say so.
 * reminder A helpful nudge or a required daily record.
 */
export type ActionClass = "gate" | "alert" | "reminder";
export type ActionProcess = "stop-work" | "snag" | "inspection" | "daily-site" | "workforce" | "job-setup" | "compliance" | "money";
export type AudienceMode = "act" | "see";
export type ViewerState = "ready" | "waiting" | "blocked" | "info";

export interface JobRef { id: string | null; reference: string; name: string }
export interface Responsible { role: RoleKey; who: string | null; label: string }
export interface ActionRoute { screen: string; id?: string | null; kind?: string; stage?: string; qa?: string; step?: string; earlier?: boolean }

export interface NextAction {
  id: string;
  rule: string;
  process: ActionProcess;
  kind: ActionClass;
  priority: number;
  order: number;
  job: JobRef;
  location: string | null;
  responsible: Responsible;
  title: string;
  why: string;
  due: string | null;
  requires: string[];
  doneWhen: string;
  next: string | null;
  audience: Partial<Record<RoleKey, AudienceMode | null>>;
  /** For a gate: what exactly it holds up. Null for alerts and reminders. */
  blocks: string | null;
  /** True only when the database itself refuses to proceed. Every gate is true. Alerts are always false. */
  enforcedByBackend: boolean;
  source: { table: string; id: string | null };
  route: ActionRoute;
  parties?: { teamIds: (string | null)[] };
  actUsers?: (string | null)[] | null;
  /** Per-person daily work: another person's saved acknowledgement or handover cannot complete yours. */
  completedUsers?: string[];
  independence?: { forbidden: { userId: string | null; reason: string }[] } | null;
  blockers?: string[];
  financial?: boolean;
  informationOnly?: boolean;
  overdue?: boolean;
  contact?: string;
}

export interface ViewerAction extends NextAction {
  viewerMode: AudienceMode;
  state: ViewerState;
  blockedBy: string | null;
}

export interface WorkingTimes {
  start: string;
  end: string;
  source: "contract" | "default";
  morningChecksOfficeSeesAt: string;
  handoverReminderAt: string;
  handoverOfficeSeesAt: string;
}
