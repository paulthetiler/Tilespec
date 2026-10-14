import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Absence, ActualAllocation, Attendance, AuditEvent, Commercial, Company, CompanyAccreditation, CompanyInsurance, Contract, DocumentRevision, Location, Member, Operative, PlannedAllocation, PlannedOperative, Team, TeamMembership, WorkArea, WorkPackage } from "./types";
import type { DayRecords } from "./site-day";
import { londonTimeToIso } from "./planning";
import { rpcErrorMessage } from "./errors";

export function checkDatabase(error: { code?: string } | null) {
  if (error) {
    if (error.code === "40001") throw new Error("This record changed while you were editing. Refresh before trying again.");
    if (error.code === "23505") throw new Error("This reference or revision already exists. Choose a different reference or refresh the record.");
    if (error.code === "42501") throw new Error("You do not have permission for this operation.");
    throw new Error("The record could not be read or saved. Check the backend connection and try again.");
  }
}
// For Supervisor V2 functions, whose errors are written for the user.
export function checkRpc(error: { code?: string; message?: string } | null) {
  if (error) throw new Error(rpcErrorMessage(error));
}
export async function contractsFor(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
  checkDatabase(error);
  return (data || []) as Contract[];
}
export async function contractDetails(supabase: SupabaseClient, id: string, financial: boolean) {
  const c = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  checkDatabase(c.error);
  if (!c.data) return null;
  const [areas, packages, documents, audit, commercial] = await Promise.all([
    supabase.from("work_areas").select("*").eq("contract_id", id).order("created_at"),
    supabase.from("work_packages").select("*").eq("contract_id", id).order("created_at"),
    supabase.from("document_revisions").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_events").select("*").eq("contract_id", id).order("created_at", { ascending: false }).limit(50),
    financial ? supabase.from("contract_commercials").select("*").eq("contract_id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  [areas, packages, documents, audit, commercial].forEach(r => checkDatabase(r.error));
  return { contract: c.data as Contract, areas: areas.data as WorkArea[], packages: packages.data as WorkPackage[], documents: documents.data as DocumentRevision[], audit: audit.data as AuditEvent[], commercial: commercial.data as Commercial | null };
}
export async function teamFor(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("organisation_members").select("*").order("display_name");
  checkDatabase(error);
  return data as Member[];
}

const locationColumns = "id,contract_id,name,location,substrate_notes,system_notes,specification_revision,parent_id,path_ids,location_type,code,sort_order,version,archived_at";
export async function locationsFor(supabase: SupabaseClient, contractId: string) {
  const { data, error } = await supabase.from("work_areas").select(locationColumns).eq("contract_id", contractId);
  checkDatabase(error);
  return (data || []) as Location[];
}
export async function workforceFor(supabase: SupabaseClient) {
  const [companies, teams, operatives, memberships] = await Promise.all([
    supabase.from("subcontractor_companies").select("id,organisation_id,name,company_number,contact_name,contact_phone,contact_email,address,notes,active,version").order("name"),
    supabase.from("teams").select("id,organisation_id,name,kind,company_id,active,version").order("name"),
    supabase.from("operatives").select("id,organisation_id,display_name,engagement,company_id,user_id,status,version").order("display_name"),
    supabase.from("team_memberships").select("id,team_id,operative_id,is_lead,valid_from,valid_until,voided_at,end_reason,void_reason").order("valid_from"),
  ]);
  [companies, teams, operatives, memberships].forEach(result => checkDatabase(result.error));
  return { companies: companies.data as Company[], teams: teams.data as Team[], operatives: operatives.data as Operative[], memberships: memberships.data as TeamMembership[] };
}
// Current (not voided) insurance and accreditation entries for every company.
export async function companyRecordsFor(supabase: SupabaseClient) {
  const [insurances, accreditations] = await Promise.all([
    supabase.from("company_insurances").select("id,company_id,insurance_type,insurer,policy_number,cover_amount,starts_on,expires_on,notes,recorded_at")
      .is("voided_at", null).order("expires_on", { ascending: false }),
    supabase.from("company_accreditations").select("id,company_id,scheme,reference,expires_on,notes,recorded_at").is("voided_at", null).order("scheme"),
  ]);
  [insurances, accreditations].forEach(result => checkDatabase(result.error));
  return { insurances: insurances.data as CompanyInsurance[], accreditations: accreditations.data as CompanyAccreditation[] };
}
// Every plan touching the period, including revised and cancelled ones so the
// history of changes stays visible.
const planColumns = "id,contract_id,work_area_id,work_package_id,team_id,stage,planned_start,planned_end,instructions,supersedes_id,superseded_by,cancelled_at,cancel_reason,created_by,created_at";
export async function plansFor(supabase: SupabaseClient, contractId: string, from: string, to: string) {
  const { data, error } = await supabase.from("planned_allocations").select(planColumns)
    .eq("contract_id", contractId).lte("planned_start", to).gte("planned_end", from).order("planned_start");
  checkDatabase(error);
  const plans = (data || []) as (PlannedAllocation & { cancel_reason: string | null })[];
  if (plans.length === 0) return { plans, plannedOperatives: [] as PlannedOperative[] };
  const operatives = await supabase.from("planned_allocation_operatives").select("planned_allocation_id,operative_id").in("planned_allocation_id", plans.map(plan => plan.id));
  checkDatabase(operatives.error);
  return { plans, plannedOperatives: (operatives.data || []) as PlannedOperative[] };
}

// The supervisor's day: plans, what was confirmed, attendance and absences.
const actualColumns = "id,contract_id,planned_allocation_id,previous_allocation_id,work_area_id,work_package_id,team_id,stage,work_date,started_at,ended_at,deviations,deviation_reason,confirmed_by,recorded_at,ended_by,voided_at,voided_by,void_reason,lead_operative_id";
const attendanceColumns = "id,actual_allocation_id,operative_id,joined_at,left_at,note,added_by,recorded_at,left_recorded_by,departure_note";
const absenceColumns = "id,planned_allocation_id,work_date,operative_id,reason,recorded_by,recorded_at,voided_at,voided_by,void_reason";
async function attendanceFor(supabase: SupabaseClient, actuals: ActualAllocation[]) {
  if (actuals.length === 0) return [] as Attendance[];
  const { data, error } = await supabase.from("actual_allocation_operatives").select(attendanceColumns).in("actual_allocation_id", actuals.map(item => item.id));
  checkDatabase(error);
  return (data || []) as Attendance[];
}
async function plannedOperativesFor(supabase: SupabaseClient, plans: PlannedAllocation[]) {
  if (plans.length === 0) return [] as PlannedOperative[];
  const { data, error } = await supabase.from("planned_allocation_operatives").select("planned_allocation_id,operative_id").in("planned_allocation_id", plans.map(plan => plan.id));
  checkDatabase(error);
  return (data || []) as PlannedOperative[];
}
export async function actorNamesFor(supabase: SupabaseClient, contractId: string) {
  const { data, error } = await supabase.rpc("allocation_actor_names", { p_contract: contractId });
  checkDatabase(error);
  return new Map(((data || []) as { user_id: string; display_name: string }[]).map(row => [row.user_id, row.display_name]));
}
export type StaleWork = { id: string; work_date: string; started_at: string; work_area_id: string };
export async function siteDayFor(supabase: SupabaseClient, contractId: string, day: string) {
  const now = new Date().toISOString();
  const [locations, workforce, plans, actuals, absences, stale, names] = await Promise.all([
    locationsFor(supabase, contractId), workforceFor(supabase),
    supabase.from("planned_allocations").select(planColumns).eq("contract_id", contractId).lte("planned_start", day).gte("planned_end", day),
    supabase.from("actual_allocations").select(actualColumns).eq("contract_id", contractId).eq("work_date", day).order("started_at"),
    supabase.from("allocation_absences").select(absenceColumns).eq("contract_id", contractId).eq("work_date", day),
    // Work from an earlier day that was never finished blocks today's records for those people.
    supabase.from("actual_allocations").select("id,work_date,started_at,work_area_id").eq("contract_id", contractId).lt("work_date", day)
      .is("ended_at", null).is("voided_at", null).order("work_date"),
    actorNamesFor(supabase, contractId),
  ]);
  [plans, actuals, absences, stale].forEach(result => checkDatabase(result.error));
  const [attendance, plannedOperatives] = await Promise.all([
    attendanceFor(supabase, (actuals.data || []) as ActualAllocation[]), plannedOperativesFor(supabase, (plans.data || []) as PlannedAllocation[]),
  ]);
  const records: DayRecords = {
    day, now, locations, plans: (plans.data || []) as PlannedAllocation[], plannedOperatives, actuals: (actuals.data || []) as ActualAllocation[],
    attendance, absences: (absences.data || []) as Absence[], teams: workforce.teams, operatives: workforce.operatives,
    memberships: workforce.memberships, companies: workforce.companies,
  };
  return { records, stale: (stale.data || []) as StaleWork[], names };
}
// Saved checks and open issues decide the dashboard's next action.
export async function siteStatusFor(supabase: SupabaseClient, contractId: string, day: string) {
  const [checks, issues] = await Promise.all([
    supabase.from("supervisor_inspections").select("id,created_at,issues_count").eq("contract_id", contractId)
      .gte("created_at", londonTimeToIso(day, "00:00")).order("created_at", { ascending: false }).limit(1),
    supabase.from("supervisor_issues").select("id,state").eq("contract_id", contractId).neq("state", "closed"),
  ]);
  [checks, issues].forEach(result => checkDatabase(result.error));
  return { lastCheck: (checks.data?.[0] ?? null) as { id: string; created_at: string; issues_count: number } | null, openIssues: (issues.data || []).length };
}
// Every period of work recorded on the contract between two days, with the
// plans they belong to, for the history view.
export async function workforceHistoryFor(supabase: SupabaseClient, contractId: string, from: string, to: string) {
  const [locations, workforce, actuals, absences, names] = await Promise.all([
    locationsFor(supabase, contractId), workforceFor(supabase),
    supabase.from("actual_allocations").select(actualColumns).eq("contract_id", contractId).gte("work_date", from).lte("work_date", to)
      .order("started_at", { ascending: false }).limit(500),
    supabase.from("allocation_absences").select(absenceColumns).eq("contract_id", contractId).gte("work_date", from).lte("work_date", to),
    actorNamesFor(supabase, contractId),
  ]);
  [actuals, absences].forEach(result => checkDatabase(result.error));
  const allocations = (actuals.data || []) as ActualAllocation[];
  const planIds = [...new Set([...allocations.map(item => item.planned_allocation_id), ...((absences.data || []) as Absence[]).map(item => item.planned_allocation_id)].filter(Boolean))] as string[];
  const [attendance, plans] = await Promise.all([
    attendanceFor(supabase, allocations),
    planIds.length ? supabase.from("planned_allocations").select(planColumns).in("id", planIds) : Promise.resolve({ data: [], error: null }),
  ]);
  checkDatabase(plans.error);
  return { locations, workforce, allocations, attendance, absences: (absences.data || []) as Absence[], plans: (plans.data || []) as PlannedAllocation[], names };
}
