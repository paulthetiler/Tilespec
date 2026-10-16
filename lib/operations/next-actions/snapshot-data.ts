import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase, companyRecordsFor, siteDayFor, siteStatusFor } from "../data";
import { supervisorDailyFor, siteSupervisorsFor } from "../daily-data";
import { londonClock, londonDate } from "../planning";
import type { LocationInspection } from "../inspections";
import { addDays } from "./lookups";
import { currentRows, toHold, toInspection, toRequirement, toSnag } from "./snapshot-map";
import type {
  InspectionRequirementRow, InstallationStageKey, MemberRole, NextActionSnapshot, SnagRow, Viewer,
} from "./types";

/*
 * Reads the records the engine needs for ONE site, using the signed-in person's own
 * database access. Row-level security is still the real authority: this loader only ever
 * sees what the person is already allowed to see, and it only reads.
 */
export async function loadSiteSnapshot(
  supabase: SupabaseClient,
  member: { user_id: string; display_name: string; role: MemberRole; financial_access: boolean },
  contractId: string,
  horizonDays: number,
): Promise<{ snapshot: NextActionSnapshot; viewer: Viewer }> {
  const today = londonDate();
  const now = londonClock(new Date().toISOString());
  const horizon = addDays(today, horizonDays);
  const [day, status, cover, contract, daily, supervisors, planRows, snagRows, holdRows, templateRows, requirementRows, inspectionRows, documents] = await Promise.all([
    siteDayFor(supabase, contractId, today), siteStatusFor(supabase, contractId, today), companyRecordsFor(supabase),
    supabase.from("contracts").select("id,reference,name,start_date,end_date,working_hours,tile_specification").eq("id", contractId).single(),
    supervisorDailyFor(supabase, contractId), siteSupervisorsFor(supabase, contractId),
    supabase.from("planned_allocations").select("id,contract_id,work_area_id,work_package_id,team_id,stage,planned_start,planned_end,supersedes_id,superseded_by,cancelled_at")
      .eq("contract_id", contractId).lte("planned_start", horizon).gte("planned_end", today).is("cancelled_at", null).is("superseded_by", null),
    supabase.from("supervisor_issues").select("*").eq("contract_id", contractId).in("snag_status", ["open", "assigned", "rectification_submitted", "reinspection"]),
    supabase.from("work_holds").select("id,contract_id,work_area_id,hold_type,status,reason,required_action,raised_by,corrected_by,assigned_team_id,assigned_operative_id,target_date")
      .eq("contract_id", contractId).in("status", ["active", "correction_submitted", "awaiting_release"]),
    supabase.from("location_inspection_templates").select("id,contract_id,work_area_id,stage,supersedes_id").eq("contract_id", contractId),
    supabase.from("location_inspection_requirements").select("id,contract_id,work_area_id,stage,applicability,supersedes_id").eq("contract_id", contractId),
    supabase.from("location_inspections").select("id,contract_id,work_area_id,template_id,issues_count,answers,created_at").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(200),
    supabase.from("document_revisions").select("id,contract_id").eq("contract_id", contractId).not("uploaded_at", "is", null),
  ]);
  [contract, planRows, snagRows, holdRows, templateRows, requirementRows, inspectionRows, documents].forEach(result => checkDatabase(result.error));

  const records = day.records;
  const templates = currentRows((templateRows.data ?? []) as { id: string; contract_id: string; work_area_id: string; stage: InstallationStageKey; supersedes_id: string | null }[]);
  const stageByTemplate = new Map(((templateRows.data ?? []) as { id: string; stage: InstallationStageKey }[]).map(t => [t.id, t.stage] as const));
  const requirements = currentRows((requirementRows.data ?? []) as (InspectionRequirementRow & { supersedes_id: string | null })[]).map(toRequirement);
  const inspections = ((inspectionRows.data ?? []) as (LocationInspection & { contract_id: string; template_id: string })[])
    .map(row => toInspection(row, stageByTemplate)).filter((row): row is NonNullable<typeof row> => !!row);

  const items = daily?.items ?? [];
  const nameOf = (id: string | null) => (id ? day.names.get(id) ?? supervisors.find(p => p.user_id === id)?.display_name ?? "Someone" : "Someone");
  const people = new Map<string, string>([...day.names.entries(), ...supervisors.map(p => [p.user_id, p.display_name] as const)]);
  people.set(member.user_id, member.display_name);
  for (const row of [...(holdRows.data ?? []), ...(snagRows.data ?? [])] as Record<string, unknown>[])
    for (const key of ["raised_by", "corrected_by", "rectified_by", "inspector_id"]) if (typeof row[key] === "string" && !people.has(row[key] as string)) people.set(row[key] as string, nameOf(row[key] as string));
  for (const item of items) if (!people.has(item.created_by)) people.set(item.created_by, item.created_by_name);

  const supervisorIds = new Set(supervisors.map(p => p.user_id));
  if (member.role === "supervisor") supervisorIds.add(member.user_id);
  const snapshot: NextActionSnapshot = {
    today, now,
    members: [...people].map(([user_id, display_name]) => ({ user_id, display_name, role: supervisorIds.has(user_id) ? "supervisor" : "contracts_manager", financial_access: false } as const)),
    contracts: [contract.data as NextActionSnapshot["contracts"][number]],
    commercials: [],
    contract_assignments: [...supervisorIds].map(user_id => ({ contract_id: contractId, user_id })),
    package_assignments: [],
    work_areas: records.locations.map(l => ({ id: l.id, contract_id: contractId, name: l.name, path_ids: l.path_ids, parent_id: l.parent_id })),
    companies: records.companies.map(c => ({ id: c.id, name: c.name })),
    company_insurances: cover.insurances.map(i => ({ id: i.id, company_id: i.company_id, insurance_type: i.insurance_type, expires_on: i.expires_on })),
    teams: records.teams.map(t => ({ id: t.id, name: t.name, company_id: t.company_id })),
    operatives: records.operatives.map(o => ({ id: o.id, display_name: o.display_name, company_id: o.company_id, user_id: o.user_id, status: o.status })),
    team_memberships: records.memberships.filter(m => !m.voided_at).map(m => ({ team_id: m.team_id, operative_id: m.operative_id, is_lead: m.is_lead })),
    planned_allocations: (planRows.data ?? []) as NextActionSnapshot["planned_allocations"],
    actual_allocations: [
      ...records.actuals.map(a => ({ id: a.id, contract_id: contractId, planned_allocation_id: a.planned_allocation_id, work_area_id: a.work_area_id, team_id: a.team_id, work_date: a.work_date, started_at: a.started_at, ended_at: a.ended_at, voided_at: a.voided_at })),
      ...day.stale.map(a => ({ id: a.id, contract_id: contractId, planned_allocation_id: null, work_area_id: a.work_area_id, team_id: null, work_date: a.work_date, started_at: a.started_at, ended_at: null, voided_at: null })),
    ],
    allocation_absences: records.absences.filter(a => !a.voided_at).map(a => ({ planned_allocation_id: a.planned_allocation_id, work_date: a.work_date })),
    // siteStatusFor already limits this to a check saved today (London). Stamping today's date avoids a UTC/London midnight mismatch.
    supervisor_inspections: status.lastCheck ? [{ id: status.lastCheck.id, contract_id: contractId, created_at: `${today}T${londonClock(status.lastCheck.created_at)}:00Z` }] : [],
    location_inspection_templates: templates.map(t => ({ id: t.id, contract_id: t.contract_id, work_area_id: t.work_area_id, stage: t.stage })),
    location_inspection_requirements: requirements,
    location_inspections: inspections,
    supervisor_issues: ((snagRows.data ?? []) as Record<string, unknown>[]).map(toSnag).filter((s): s is SnagRow => !!s),
    work_holds: ((holdRows.data ?? []) as Record<string, unknown>[]).map(toHold),
    supervisor_office_items: items.map(i => ({ id: i.id, contract_id: i.contract_id, kind: i.kind, title: i.title, body: i.body, recipient_id: i.recipient_id,
      acknowledgement_required: i.acknowledgement_required, work_area_id: i.work_area_id, stage: i.stage, created_by: i.created_by, created_at: i.created_at, due_on: i.due_on })),
    supervisor_office_acknowledgements: (daily?.acknowledgements ?? []).map(a => ({ item_id: a.item_id, user_id: a.actor_id })),
    supervisor_qa_submissions: (daily?.submissions ?? []).map(q => ({ item_id: q.item_id })),
    site_handovers: (daily?.handovers ?? []).map(h => ({ id: h.id, contract_id: h.contract_id, work_date: h.work_date, created_at: h.created_at })),
    document_revisions: (documents.data ?? []) as { id: string; contract_id: string }[],
  };
  return { snapshot, viewer: { user_id: member.user_id, role: member.role, financial_access: member.financial_access } };
}
