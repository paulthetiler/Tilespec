import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase, companyRecordsFor, siteDayFor, siteStatusFor } from "../data";
import { supervisorDailyFor, siteSupervisorsFor } from "../daily-data";
import { threadsFrom } from "../daily";
import { aboutLookupsFor } from "../conversation-data";
import { jobThreadRows } from "../conversations";
import { dayworksFor } from "../daywork-data";
import { londonClock, londonDate } from "../planning";
import { applicableChecks, type InspectionTemplate, type LocationInspection } from "../inspections";
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
  // True when the supervisor has opened this site's Today: their daily routine applies.
  // False for a summary (the site picker), so no site is treated as attended.
  options: { attended: boolean },
): Promise<{ snapshot: NextActionSnapshot; viewer: Viewer }> {
  const today = londonDate();
  const now = londonClock(new Date().toISOString());
  const horizon = addDays(today, horizonDays);
  // These are append-only histories. A PostgREST response cap must not silently
  // hide a current requirement, an active stop or the inspection that satisfies it.
  async function siteRows(table: string, columns: string) {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      let query = supabase.from(table).select(columns).eq("contract_id", contractId).order("id");
      if (table === "planned_allocations") query = query.lte("planned_start", horizon).gte("planned_end", today).is("cancelled_at", null).is("superseded_by", null);
      if (table === "supervisor_issues") query = query.in("snag_status", ["open", "assigned", "rectification_submitted", "reinspection"]);
      if (table === "work_holds") query = query.in("status", ["active", "correction_submitted", "awaiting_release"]);
      if (table === "document_revisions") query = query.not("uploaded_at", "is", null);
      const result = await query.range(start, start + 499);
      checkDatabase(result.error);
      const page = (result.data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < 500) return { data: rows, error: null };
    }
  }
  const [day, status, cover, contract, daily, supervisors, planRows, snagRows, holdRows, templateRows, requirementRows, inspectionRows, documents, dayworks] = await Promise.all([
    siteDayFor(supabase, contractId, today), siteStatusFor(supabase, contractId, today), companyRecordsFor(supabase),
    supabase.from("contracts").select("id,reference,name,start_date,end_date,working_hours,tile_specification").eq("id", contractId).single(),
    supervisorDailyFor(supabase, contractId),
    // The recipient directory is deliberately office-only. A supervisor already
    // has their own authenticated identity and must not call that privileged RPC.
    member.role === "supervisor" ? Promise.resolve([{ user_id: member.user_id, display_name: member.display_name }]) : siteSupervisorsFor(supabase, contractId),
    siteRows("planned_allocations", "id,contract_id,work_area_id,work_package_id,team_id,stage,planned_start,planned_end,supersedes_id,superseded_by,cancelled_at"),
    siteRows("supervisor_issues", "*"),
    siteRows("work_holds", "id,contract_id,work_area_id,work_package_id,stage,activity,location_path,hold_type,status,reason,required_action,raised_by,corrected_by,assigned_team_id,assigned_operative_id,target_date"),
    siteRows("location_inspection_templates", "id,contract_id,work_area_id,stage,supersedes_id,checklist,wet_area"),
    siteRows("location_inspection_requirements", "id,contract_id,work_area_id,work_package_id,stage,applicability,template_id,created_at,supersedes_id"),
    siteRows("location_inspections", "id,contract_id,work_area_id,work_package_id,template_id,issues_count,answers,created_at"),
    siteRows("document_revisions", "id,contract_id"),
    // Dayworks arrive with their own reviewed migration; until then there are none. Statuses only.
    dayworksFor(supabase, contractId),
  ]);
  [contract, planRows, snagRows, holdRows, templateRows, requirementRows, inspectionRows, documents].forEach(result => checkDatabase(result.error));

  const records = day.records;
  const templates = currentRows((templateRows.data ?? []) as (InspectionTemplate & { contract_id: string; stage: InstallationStageKey })[]);
  const currentTemplateIds = new Set(templates.map(t => t.id));
  const stageByTemplate = new Map(((templateRows.data ?? []) as { id: string; stage: InstallationStageKey }[]).map(t => [t.id, t.stage] as const));
  const requirements = currentRows((requirementRows.data ?? []) as unknown as (InspectionRequirementRow & { supersedes_id: string | null })[])
    .map(row => ({ ...toRequirement(row), template_current: row.applicability !== "required" || (!!row.template_id && currentTemplateIds.has(row.template_id)) }));
  const inspections = ((inspectionRows.data ?? []) as (LocationInspection & { contract_id: string; template_id: string })[])
    .map(row => toInspection(row, stageByTemplate)).filter((row): row is NonNullable<typeof row> => !!row);

  const items = daily?.items ?? [];
  const nameOf = (id: string | null) => (id ? day.names.get(id) ?? supervisors.find(p => p.user_id === id)?.display_name ?? "Someone" : "Someone");
  const people = new Map<string, string>([...day.names.entries(), ...supervisors.map(p => [p.user_id, p.display_name] as const)]);
  people.set(member.user_id, member.display_name);
  for (const row of [...(holdRows.data ?? []), ...(snagRows.data ?? [])] as Record<string, unknown>[])
    for (const key of ["raised_by", "corrected_by", "rectified_by", "inspector_id"]) if (typeof row[key] === "string" && !people.has(row[key] as string)) people.set(row[key] as string, nameOf(row[key] as string));
  for (const item of items) if (!people.has(item.created_by)) people.set(item.created_by, item.created_by_name);

  // Questions and replies, once job messages are installed. The supervisor only ever reads their own.
  const threads = daily?.conversations ? threadsFrom(daily.messages, daily.messageReads) : [];
  const threadRows = daily?.conversations ? jobThreadRows(threads, await aboutLookupsFor(supabase, daily, threads)) : null;

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
    team_memberships: records.memberships.filter(m => !m.voided_at && m.valid_from <= today && (!m.valid_until || m.valid_until >= today)).map(m => ({ team_id: m.team_id, operative_id: m.operative_id, is_lead: m.is_lead })),
    planned_allocations: (planRows.data ?? []) as unknown as NextActionSnapshot["planned_allocations"],
    actual_allocations: [
      ...records.actuals.map(a => ({ id: a.id, contract_id: contractId, planned_allocation_id: a.planned_allocation_id, work_area_id: a.work_area_id, team_id: a.team_id, work_date: a.work_date, started_at: a.started_at, ended_at: a.ended_at, voided_at: a.voided_at })),
      ...day.stale.map(a => ({ id: a.id, contract_id: contractId, planned_allocation_id: null, work_area_id: a.work_area_id, team_id: null, work_date: a.work_date, started_at: a.started_at, ended_at: null, voided_at: null })),
    ],
    allocation_absences: records.absences.filter(a => !a.voided_at).map(a => ({ planned_allocation_id: a.planned_allocation_id, work_date: a.work_date })),
    // siteStatusFor already limits this to a check saved today (London). Stamping today's date avoids a UTC/London midnight mismatch.
    supervisor_inspections: status.lastCheck ? [{ id: status.lastCheck.id, contract_id: contractId, created_at: `${today}T${londonClock(status.lastCheck.created_at)}:00Z` }] : [],
    location_inspection_templates: templates.map(t => ({ id: t.id, contract_id: t.contract_id, work_area_id: t.work_area_id, stage: t.stage,
      mandatory: applicableChecks(t).some(check => check.mandatory || check.hold_point) })),
    location_inspection_requirements: requirements,
    location_inspections: inspections,
    supervisor_issues: ((snagRows.data ?? []) as Record<string, unknown>[]).map(toSnag).filter((s): s is SnagRow => !!s),
    work_holds: ((holdRows.data ?? []) as Record<string, unknown>[]).map(toHold),
    supervisor_office_items: items.map(i => ({ id: i.id, contract_id: i.contract_id, kind: i.kind, title: i.title, body: i.body, recipient_id: i.recipient_id,
      acknowledgement_required: i.acknowledgement_required, work_area_id: i.work_area_id, stage: i.stage, created_by: i.created_by, created_at: i.created_at, due_on: i.due_on,
      replaces_id: i.replaces_id ?? null, urgent: i.urgent === true })),
    supervisor_office_acknowledgements: (daily?.acknowledgements ?? []).map(a => ({ item_id: a.item_id, user_id: a.actor_id })),
    supervisor_qa_submissions: (daily?.submissions ?? []).map(q => ({ item_id: q.item_id })),
    site_handovers: (daily?.handovers ?? []).map(h => ({ id: h.id, contract_id: h.contract_id, actor_id: h.actor_id, work_date: h.work_date, created_at: h.created_at })),
    document_revisions: (documents.data ?? []) as { id: string; contract_id: string }[],
    attended_sites: options.attended && member.role === "supervisor" ? [contractId] : [],
    // Once office reviews exist, the supervisor sees which of their results are still waiting for the office.
    ...(daily?.followUp ? {
      qa_results: daily.submissions.flatMap(q => {
        const item = items.find(row => row.id === q.item_id);
        return item ? [{ item_id: q.item_id, submission_id: q.id, contract_id: item.contract_id, title: item.title, location_path: item.location_path, inspection_id: q.inspection_id,
          has_issues: q.has_issues, submitted_at: q.submitted_at, submitted_by_name: people.get(q.submitted_by) ?? null, followed_up: false }] : [];
      }),
      office_reviews: daily.reviews.map(r => ({ qa_submission_id: r.qa_submission_id, handover_id: r.handover_id })),
      office_item_withdrawals: daily.withdrawals.map(w => ({ item_id: w.item_id })),
    } : {}),
    ...(threadRows ? { job_threads: threadRows } : {}),
    ...(dayworks ? { dayworks: dayworks.dayworks.map(d => ({ id: d.id, contract_id: d.contract_id, number: d.number, description: d.description, created_by: d.created_by,
      site_status: d.site_status, office_status: d.office_status, signoff_status: d.signoff_status, commercial_status: d.commercial_status, client_status: d.client_status,
      submitted_by: [...new Set(dayworks.events.filter(e => e.daywork_id === d.id && ["record", "update_lines", "send"].includes(e.action)).map(e => e.actor_id))] })) } : {}),
  };
  return { snapshot, viewer: { user_id: member.user_id, role: member.role, financial_access: member.financial_access } };
}
