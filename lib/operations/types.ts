export const roles = ["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"] as const;
export type Role = typeof roles[number];
export type Member = { organisation_id: string; user_id: string; display_name: string; role: Role; financial_access: boolean; active: boolean };
export type Contract = {
  id: string; organisation_id: string; reference: string; name: string; client: string;
  principal_contractor: string; address: string; site_contact: string; scope: string;
  exclusions: string; tile_specification: string; substrate_details: string;
  installation_system: string; movement_joints: string; access_restrictions: string;
  working_hours: string; insurance_requirements: string; defects_liability: string;
  start_date: string | null; end_date: string | null; state: "draft"; version: number;
  created_at: string; updated_at: string;
};
export type Commercial = {
  contract_id: string; organisation_id: string; contract_value: number; labour_budget: number;
  materials_budget: number; preliminaries_budget: number; contingency: number;
  target_margin: number; payment_terms: string; retention_percent: number; version: number;
};
export type WorkArea = { id: string; contract_id: string; name: string; location: string; substrate_notes: string; system_notes: string; specification_revision: string };
// A work area within the Supervisor V2 hierarchy. path_ids runs from the top
// level down to and including this location.
export type Location = WorkArea & {
  parent_id: string | null; path_ids: string[]; location_type: string; code: string;
  sort_order: number; version: number; archived_at: string | null;
};
// Keep in step with private.installation_stages() and the actual_allocations
// deviations check in supabase/migrations/20261014093000_site_allocations.sql.
export const installationStages = ["preparation", "waterproofing", "installation", "grouting", "sealant", "protection", "remedial"] as const;
export type InstallationStage = typeof installationStages[number];
export const installationStageLabels: Record<InstallationStage, string> = {
  preparation: "Substrate preparation", waterproofing: "Waterproofing", installation: "Tile installation",
  grouting: "Grouting", sealant: "Sealant and movement joints", protection: "Protection", remedial: "Remedial work",
};
export const allocationDeviations = ["unplanned", "outside_planned_dates", "location_changed", "team_changed", "package_changed", "stage_changed", "operatives_changed"] as const;
export type AllocationDeviation = typeof allocationDeviations[number];
// A subcontractor or labour agency. Gangs and operatives link to it by ID.
export type Company = {
  id: string; organisation_id: string; name: string; company_number: string; contact_name: string; contact_phone: string;
  contact_email: string; address: string; notes: string; active: boolean; version: number;
};
// Keep in step with the company_insurances check in
// supabase/migrations/20261014100000_subcontractor_companies.sql.
export const insuranceTypes = ["public_liability", "employers_liability", "professional_indemnity", "contract_works", "other"] as const;
export type InsuranceType = typeof insuranceTypes[number];
export const insuranceTypeLabels: Record<InsuranceType, string> = {
  public_liability: "Public liability", employers_liability: "Employer's liability", professional_indemnity: "Professional indemnity",
  contract_works: "Contract works", other: "Other insurance",
};
export type CompanyInsurance = {
  id: string; company_id: string; insurance_type: InsuranceType; insurer: string; policy_number: string; cover_amount: number | null;
  starts_on: string | null; expires_on: string; notes: string; recorded_at: string;
};
export type CompanyAccreditation = { id: string; company_id: string; scheme: string; reference: string; expires_on: string | null; notes: string; recorded_at: string };
export type Operative = {
  id: string; organisation_id: string; display_name: string; engagement: "direct_employee" | "subcontractor" | "agency";
  company_id: string | null; user_id: string | null; status: "provisional" | "active" | "inactive"; version: number;
};
export type Team = {
  id: string; organisation_id: string; name: string; company_id: string | null; active: boolean; version: number;
  kind: "subcontract_gang" | "individual_subcontractor" | "direct_team" | "mixed" | "temporary";
};
export type TeamMembership = {
  id: string; team_id: string; operative_id: string; is_lead: boolean; valid_from: string; valid_until: string | null; voided_at: string | null;
  end_reason?: string | null; void_reason?: string | null;
};
export type PlannedOperative = { planned_allocation_id: string; operative_id: string };
export type PlannedAllocation = {
  id: string; contract_id: string; work_area_id: string; work_package_id: string | null; team_id: string; stage: InstallationStage;
  planned_start: string; planned_end: string; instructions: string; supersedes_id: string | null; superseded_by: string | null;
  cancelled_at: string | null; created_by: string | null; created_at: string;
};
export type ActualAllocation = {
  id: string; contract_id: string; planned_allocation_id: string | null; previous_allocation_id: string | null;
  work_area_id: string; work_package_id: string | null; team_id: string | null; stage: InstallationStage; work_date: string;
  started_at: string; ended_at: string | null; deviations: AllocationDeviation[]; deviation_reason: string | null;
  confirmed_by: string; recorded_at: string; ended_by: string | null; voided_at: string | null; voided_by: string | null; void_reason: string | null;
  lead_operative_id: string | null;
};
// One person on one period of work: present from joined_at until left_at, or
// until the period ends.
export type Attendance = {
  id: string; actual_allocation_id: string; operative_id: string; joined_at: string; left_at: string | null; note: string | null;
  added_by: string; recorded_at: string; left_recorded_by: string | null; departure_note: string | null;
};
// A planned team (operative_id null) or one planned person not on site that day.
export type Absence = {
  id: string; planned_allocation_id: string; work_date: string; operative_id: string | null; reason: string;
  recorded_by: string; recorded_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null;
};
export const allocationDeviationLabels: Record<AllocationDeviation, string> = {
  unplanned: "Not on the plan", outside_planned_dates: "Outside the planned dates", location_changed: "Different location",
  team_changed: "Different team", package_changed: "Different work package", stage_changed: "Different stage", operatives_changed: "Different people",
};
// One row of public.location_work_history: a candidate with evidence, not a finding of fault.
export type WorkHistoryEntry = {
  actual_allocation_id: string; work_area_id: string; location_relation: "exact" | "containing" | "within";
  team_id: string | null; team_name: string | null; contractor_name: string | null; team_lead: string | null;
  stage: InstallationStage; work_date: string; started_at: string; ended_at: string | null; planned_allocation_id: string | null;
  deviations: AllocationDeviation[]; deviation_reason: string | null; confirmed_by: string; operative_ids: string[]; operative_names: string[];
};
export type WorkPackage = { id: string; contract_id: string; work_area_id: string; name: string; quantity: number; unit: string };
export type DocumentRevision = {
  id: string; contract_id: string; work_area_id: string | null; document_reference: string;
  revision: number; title: string; classification: "operational" | "commercial";
  object_path: string; sha256: string; mime_type: string; bytes: number; created_by: string;
  created_at: string; uploaded_at: string | null;
};
export type AuditEvent = { id: number; actor_id: string; action: string; entity_type: string; entity_id: string; created_at: string; commercial: boolean; details: Record<string, unknown> };
export type ActionState = { error?: string; success?: string };
export const roleLabels: Record<Role, string> = {
  owner: "Owner / Director", contracts_manager: "Contracts manager", supervisor: "QA / Site supervisor",
  lead_installer: "Lead installer", subcontract_installer: "Subcontract installer",
};
export const teamKindLabels: Record<Team["kind"], string> = {
  subcontract_gang: "Subcontract gang", individual_subcontractor: "Individual subcontractor", direct_team: "Direct team (employed)",
  mixed: "Mixed team", temporary: "Temporary team",
};
export const engagementLabels: Record<Operative["engagement"], string> = {
  direct_employee: "Directly employed", subcontractor: "Subcontractor", agency: "Agency",
};
