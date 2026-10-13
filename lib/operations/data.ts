import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, Commercial, Contract, DocumentRevision, Location, Member, Operative, PlannedAllocation, PlannedOperative, Team, TeamMembership, WorkArea, WorkPackage } from "./types";
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
  const [teams, operatives, memberships] = await Promise.all([
    supabase.from("teams").select("id,organisation_id,name,kind,contractor_name,active,version").order("name"),
    supabase.from("operatives").select("id,organisation_id,display_name,engagement,company_name,user_id,status,version").order("display_name"),
    supabase.from("team_memberships").select("id,team_id,operative_id,is_lead,valid_from,valid_until,voided_at,end_reason,void_reason").order("valid_from"),
  ]);
  [teams, operatives, memberships].forEach(result => checkDatabase(result.error));
  return { teams: teams.data as Team[], operatives: operatives.data as Operative[], memberships: memberships.data as TeamMembership[] };
}
// Every plan touching the period, including revised and cancelled ones so the
// history of changes stays visible.
export async function plansFor(supabase: SupabaseClient, contractId: string, from: string, to: string) {
  const { data, error } = await supabase.from("planned_allocations")
    .select("id,contract_id,work_area_id,work_package_id,team_id,stage,planned_start,planned_end,instructions,supersedes_id,superseded_by,cancelled_at,cancel_reason,created_by,created_at")
    .eq("contract_id", contractId).lte("planned_start", to).gte("planned_end", from).order("planned_start");
  checkDatabase(error);
  const plans = (data || []) as (PlannedAllocation & { cancel_reason: string | null })[];
  if (plans.length === 0) return { plans, plannedOperatives: [] as PlannedOperative[] };
  const operatives = await supabase.from("planned_allocation_operatives").select("planned_allocation_id,operative_id").in("planned_allocation_id", plans.map(plan => plan.id));
  checkDatabase(operatives.error);
  return { plans, plannedOperatives: (operatives.data || []) as PlannedOperative[] };
}
