import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../../auth";
import { checkDatabase } from "../data";
import { emptyLookups, jobThreadRows } from "../conversations";
import { threadsFrom, type JobMessage, type JobMessageRead } from "../daily";
import { applicableChecks, type InspectionTemplate, type LocationInspection } from "../inspections";
import { canReadFinancial } from "../permissions";
import { londonClock, londonDate, londonTimeToIso, membershipOnDay } from "../planning";
import { DEFAULT_CONFIG, type NextActionConfig } from "./config";
import { addDays } from "./lookups";
import { currentRows, toHold, toInspection, toRequirement, toSnag } from "./snapshot-map";
import type { InspectionRequirementRow, InstallationStageKey, NextActionSnapshot, SnagRow, Viewer } from "./types";

type Row = Record<string, unknown>;
type ReadOptions = {
  contractIds?: string[];
  scopeColumn?: string;
  order?: string[];
  eq?: Record<string, string | boolean>;
  neq?: Record<string, string>;
  isNull?: string[];
  notNull?: string[];
  gte?: Record<string, string>;
  lte?: Record<string, string>;
  lt?: Record<string, string>;
  oneOf?: Record<string, string[]>;
  /** A table from a later reviewed migration: reading it before that migration is applied returns null, not an error. */
  optional?: boolean;
};
class MissingTable extends Error {}
const READ_ERROR = "The daily records could not be read. Check the backend connection and try again.";

/**
 * One organisation-wide, read-only snapshot for the real office/owner screens.
 * Every request uses the caller's authenticated client and existing RLS. Explicit
 * organisation/contract filters keep the payload narrow; they never grant access.
 * Histories are paginated, with stable ordering, rather than accepting PostgREST's
 * response cap as a complete list of stops, requirements or saved results.
 */
export async function loadOfficeSnapshot(
  supabase: SupabaseClient,
  member: Member,
  config: NextActionConfig = DEFAULT_CONFIG,
): Promise<{ snapshot: NextActionSnapshot; viewer: Viewer }> {
  if (!member.active || !["owner", "contracts_manager"].includes(member.role)) {
    throw new Error("You do not have permission to read the office daily records.");
  }
  const instant = new Date();
  const today = londonDate(instant);
  const now = londonClock(instant.toISOString());
  const horizon = addDays(today, config.planHorizonDays);
  const financial = canReadFinancial(member);

  async function rows(table: string, columns: string, options: ReadOptions = {}): Promise<Row[]> {
    if (options.contractIds?.length === 0) return [];
    const scopes: (string[] | null)[] = options.contractIds
      ? Array.from({ length: Math.ceil(options.contractIds.length / 100) }, (_, index) => options.contractIds!.slice(index * 100, index * 100 + 100))
      : [null];
    const saved: Row[] = [];
    for (const scope of scopes) {
      for (let start = 0; ; start += 500) {
        let query = supabase.from(table).select(columns).eq("organisation_id", member.organisation_id);
        if (scope) query = query.in(options.scopeColumn ?? "contract_id", scope);
        for (const [key, value] of Object.entries(options.eq ?? {})) query = query.eq(key, value);
        for (const [key, value] of Object.entries(options.neq ?? {})) query = query.neq(key, value);
        for (const key of options.isNull ?? []) query = query.is(key, null);
        for (const key of options.notNull ?? []) query = query.not(key, "is", null);
        for (const [key, value] of Object.entries(options.gte ?? {})) query = query.gte(key, value);
        for (const [key, value] of Object.entries(options.lte ?? {})) query = query.lte(key, value);
        for (const [key, value] of Object.entries(options.lt ?? {})) query = query.lt(key, value);
        for (const [key, values] of Object.entries(options.oneOf ?? {})) query = query.in(key, values);
        for (const key of options.order ?? ["id"]) query = query.order(key);
        let result;
        try { result = await query.range(start, start + 499); }
        catch { throw new Error(READ_ERROR); }
        if (options.optional && result.error && ["42P01", "PGRST205"].includes(result.error.code)) throw new MissingTable();
        checkDatabase(result.error);
        if (!Array.isArray(result.data)) throw new Error(READ_ERROR);
        saved.push(...result.data as unknown as Row[]);
        if (result.data.length < 500) break;
      }
    }
    return saved;
  }
  const optionalRows = (table: string, columns: string, options: ReadOptions) => rows(table, columns, { ...options, optional: true })
    .catch(error => { if (error instanceof MissingTable) return null; throw error; });

  const [contractRows, memberRows] = await Promise.all([
    rows("contracts", "id,reference,name,start_date,end_date,working_hours,tile_specification"),
    rows("organisation_members", "user_id,display_name,role,financial_access,active", { order: ["user_id"] }),
  ]);
  const visibleIds = contractRows.map(row => String(row.id));
  const activeMembers = new Set(memberRows.filter(row => row.active === true).map(row => String(row.user_id)));
  const assignmentRows = await rows("contract_assignments", "contract_id,user_id,valid_from,valid_until", { contractIds: visibleIds, order: ["contract_id", "user_id"] });
  const assignments = assignmentRows.filter(row => activeMembers.has(String(row.user_id))
    && String(row.valid_from) <= today && (!row.valid_until || String(row.valid_until) >= today));
  // The database has already authorised every returned contract. Its contract
  // policy uses current_date, which can differ from the London work day near
  // midnight. Rechecking that grant against a different day could hide a live
  // job and its restrictions. Project that RLS grant into the engine's existing
  // assignment-based viewer scope with their actual returned assignment while
  // keeping other supervisor metadata dated to the London work day.
  const contracts = contractRows;
  const contractIds = contracts.map(row => String(row.id));
  const contractSet = new Set(contractIds);
  const datedAssignments = new Set(assignments);
  const currentAssignments = assignmentRows.filter(row => contractSet.has(String(row.contract_id))
    && (datedAssignments.has(row) || (member.role === "contracts_manager" && row.user_id === member.user_id)))
    .map(row => ({ contract_id: String(row.contract_id), user_id: String(row.user_id) }));
  const scope = { contractIds };
  const updatesSince = addDays(today, -(config.siteUpdateDays - 1));
  const [areas, packages, packageAssignments, companies, insurance, teams, operatives, memberships,
    plans, actualToday, actualEarlier, absences, checks, templates, requirements, inspections, snags, readinessIssues, holds,
    items, acknowledgements, submissions, handovers, documents, handoverNotes, reviews, withdrawals, messages, messageReads, dayworks, dayworkSubmissions] = await Promise.all([
    rows("work_areas", "id,contract_id,name,parent_id,path_ids", scope),
    rows("work_packages", "id,contract_id,name", scope),
    rows("package_assignments", "contract_id,work_package_id,user_id", { ...scope, order: ["work_package_id", "user_id"] }),
    rows("subcontractor_companies", "id,name"),
    rows("company_insurances", "id,company_id,insurance_type,expires_on", { isNull: ["voided_at"] }),
    rows("teams", "id,name,company_id"),
    rows("operatives", "id,display_name,company_id,user_id,status"),
    rows("team_memberships", "id,team_id,operative_id,is_lead,valid_from,valid_until,voided_at", { isNull: ["voided_at"], lte: { valid_from: today } }),
    rows("planned_allocations", "id,contract_id,work_area_id,work_package_id,team_id,stage,planned_start,planned_end", {
      ...scope, lte: { planned_start: horizon }, gte: { planned_end: today }, isNull: ["cancelled_at", "superseded_by"],
    }),
    rows("actual_allocations", "id,contract_id,planned_allocation_id,work_area_id,team_id,work_date,started_at,ended_at,voided_at", { ...scope, eq: { work_date: today }, isNull: ["voided_at"] }),
    rows("actual_allocations", "id,contract_id,planned_allocation_id,work_area_id,team_id,work_date,started_at,ended_at,voided_at", { ...scope, lt: { work_date: today }, isNull: ["voided_at", "ended_at"] }),
    rows("allocation_absences", "id,planned_allocation_id,work_date", { ...scope, eq: { work_date: today }, isNull: ["voided_at"] }),
    rows("supervisor_inspections", "id,contract_id,created_at", { ...scope, gte: { created_at: londonTimeToIso(today, "00:00") }, lt: { created_at: londonTimeToIso(addDays(today, 1), "00:00") } }),
    rows("location_inspection_templates", "id,contract_id,work_area_id,stage,supersedes_id,checklist,wet_area", scope),
    rows("location_inspection_requirements", "id,contract_id,work_area_id,work_package_id,stage,applicability,template_id,created_at,supersedes_id", scope),
    rows("location_inspections", "id,contract_id,work_area_id,work_package_id,template_id,issues_count,answers,created_at", scope),
    rows("supervisor_issues", "id,contract_id,work_area_id,check_label,description,severity,snag_status,assigned_team_id,target_date,inspector_id,rectified_by,escalated,responsibility_state,responsibility_team_id,assigned_action", { ...scope, oneOf: { snag_status: ["open", "assigned", "rectification_submitted", "reinspection"] } }),
    rows("supervisor_issues", "id,contract_id,inspection_id,check_label,description,state,created_at", { ...scope, isNull: ["snag_status"], neq: { state: "closed" } }),
    rows("work_holds", "id,contract_id,work_area_id,work_package_id,stage,activity,location_path,hold_type,category,status,reason,required_action,raised_by,corrected_by,assigned_team_id,assigned_operative_id,target_date", { ...scope, oneOf: { status: ["active", "correction_submitted", "awaiting_release"] } }),
    // Every column, so instruction changes (replaces_id, urgent) appear once their migration is applied.
    rows("supervisor_office_items", "*", scope),
    rows("supervisor_office_acknowledgements", "id,item_id,actor_id", scope),
    rows("supervisor_qa_submissions", "id,item_id,inspection_id,has_issues,submitted_by,submitted_at", scope),
    rows("site_handovers", "id,contract_id,actor_id,work_date,created_at", { ...scope, eq: { work_date: today } }),
    rows("document_revisions", "id,contract_id", { ...scope, eq: { classification: "operational" }, notNull: ["uploaded_at"] }),
    // What site sent back recently, for the office's "From site" list. Reads only.
    rows("site_handovers", "id,contract_id,actor_name,work_date,created_at,outstanding_problems,areas_awaiting_attention,office_notes", { ...scope, gte: { work_date: updatesSince } }),
    optionalRows("office_reviews", "id,contract_id,qa_submission_id,handover_id", scope),
    optionalRows("supervisor_office_item_withdrawals", "id,contract_id,item_id", scope),
    // Questions and replies arrive with their own migration; until then there are none.
    optionalRows("job_messages", "id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,about_type,about_id,created_at,request_key", { ...scope, order: ["created_at", "id"] }),
    optionalRows("job_message_reads", "id,message_id,reader_id,read_at", scope),
    // Dayworks arrive with their own migration. Statuses only: rates and prices are never read here.
    optionalRows("dayworks", "id,contract_id,number,description,created_by,site_status,office_status,signoff_status,commercial_status,client_status", scope),
    optionalRows("daywork_events", "id,daywork_id,actor_id,action", { ...scope, oneOf: { action: ["record", "update_lines", "send"] } }),
  ]);
  // Both arrive with one migration. Until it is applied, results and handovers stay in "From site".
  const followUp = reviews !== null && withdrawals !== null;
  // An inspection result with problems is being tracked once a snag or stop has been raised from it.
  const failedInspections = submissions.filter(row => row.has_issues === true).map(row => String(row.inspection_id));
  const [linkedSnags, linkedHolds] = failedInspections.length ? await Promise.all([
    rows("supervisor_issues", "id,location_inspection_id", { ...scope, oneOf: { location_inspection_id: failedInspections } }),
    rows("work_holds", "id,source_inspection_id", { ...scope, oneOf: { source_inspection_id: failedInspections } }),
  ]) : [[], []];
  const followedUp = new Set([...linkedSnags.map(row => String(row.location_inspection_id)), ...linkedHolds.map(row => String(row.source_inspection_id))]);
  const memberNames = new Map(memberRows.map(row => [String(row.user_id), String(row.display_name)]));
  const conversations = messages !== null && messageReads !== null;
  const threads = conversations ? threadsFrom(messages as unknown as JobMessage[], messageReads as unknown as JobMessageRead[]) : [];
  // Titles for what each conversation is about, from records this snapshot already read. Closed records fall back to a plain description.
  const lookups = emptyLookups();
  for (const item of items) lookups.items.set(String(item.id), { title: String(item.title), kind: String(item.kind) });
  for (const row of submissions) lookups.results.set(String(row.id), { item_id: String(row.item_id) });
  for (const row of handoverNotes) lookups.handovers.set(String(row.id), { work_date: String(row.work_date), actor_name: String(row.actor_name) });
  for (const row of snags) lookups.snags.set(String(row.id), String(row.check_label));
  for (const row of holds) lookups.holds.set(String(row.id), `${row.hold_type === "safety" ? "Safety stop" : "Quality hold"}, ${row.category}`);
  for (const row of dayworks ?? []) lookups.dayworks.set(String(row.id), { number: Number(row.number), description: String(row.description) });
  const currentTemplates = currentRows(templates as unknown as (InspectionTemplate & { contract_id: string; stage: InstallationStageKey })[]);
  const currentTemplateIds = new Set(currentTemplates.map(template => template.id));
  const stageByTemplate = new Map(templates.map(template => [String(template.id), template.stage as InstallationStageKey] as const));
  const packageNames = new Map(packages.map(row => [String(row.id), String(row.name)]));
  const currentOperatives = operatives.filter(row => row.status !== "inactive");
  const currentOperativeIds = new Set(currentOperatives.map(row => String(row.id)));
  const snapshot: NextActionSnapshot = {
    today, now,
    members: memberRows.map(row => ({ user_id: String(row.user_id), display_name: String(row.display_name), role: row.role as Member["role"], financial_access: row.financial_access === true })),
    contracts: contracts as unknown as NextActionSnapshot["contracts"],
    // Money has its own authenticated page and financial read boundary. Today
    // never fetches commercial numbers, even for an authorised owner.
    commercials: [],
    contract_assignments: currentAssignments,
    package_assignments: packageAssignments.filter(row => activeMembers.has(String(row.user_id))).map(row => ({ contract_id: String(row.contract_id), work_package_id: String(row.work_package_id), user_id: String(row.user_id) })),
    work_areas: areas as unknown as NextActionSnapshot["work_areas"],
    companies: companies as unknown as NextActionSnapshot["companies"],
    company_insurances: insurance as unknown as NextActionSnapshot["company_insurances"],
    teams: teams as unknown as NextActionSnapshot["teams"],
    operatives: currentOperatives.map(row => ({ id: String(row.id), display_name: String(row.display_name), company_id: row.company_id as string | null,
      user_id: typeof row.user_id === "string" && activeMembers.has(row.user_id) ? row.user_id : null, status: String(row.status) })),
    team_memberships: memberships.filter(row => currentOperativeIds.has(String(row.operative_id)) && membershipOnDay(row as unknown as Parameters<typeof membershipOnDay>[0], today))
      .map(row => ({ team_id: String(row.team_id), operative_id: String(row.operative_id), is_lead: row.is_lead === true })),
    planned_allocations: plans as unknown as NextActionSnapshot["planned_allocations"],
    actual_allocations: [...actualToday, ...actualEarlier] as unknown as NextActionSnapshot["actual_allocations"],
    allocation_absences: absences.map(row => ({ planned_allocation_id: String(row.planned_allocation_id), work_date: String(row.work_date) })),
    // The engine uses the date part. Preserve the saved London day, including
    // checks saved shortly after midnight BST (the previous UTC calendar day).
    supervisor_inspections: checks.map(row => ({ id: String(row.id), contract_id: String(row.contract_id), created_at: `${today}T${londonClock(String(row.created_at))}:00Z` })),
    location_inspection_templates: currentTemplates.map(template => ({ id: template.id, contract_id: template.contract_id, work_area_id: template.work_area_id, stage: template.stage,
      mandatory: applicableChecks(template).some(check => check.mandatory || check.hold_point) })),
    location_inspection_requirements: currentRows(requirements as unknown as (InspectionRequirementRow & { supersedes_id: string | null })[])
      .map(row => ({ ...toRequirement(row), template_current: row.applicability !== "required" || (!!row.template_id && currentTemplateIds.has(row.template_id)) })),
    location_inspections: (inspections as unknown as (LocationInspection & { contract_id: string; template_id: string })[])
      .map(row => toInspection(row, stageByTemplate)).filter((row): row is NonNullable<typeof row> => !!row),
    supervisor_issues: snags.map(toSnag).filter((row): row is SnagRow => !!row),
    readiness_issues: readinessIssues as unknown as NonNullable<NextActionSnapshot["readiness_issues"]>,
    work_holds: holds.map(row => toHold({ ...row, work_package_name: packageNames.get(String(row.work_package_id)) ?? null })),
    supervisor_office_items: items as unknown as NextActionSnapshot["supervisor_office_items"],
    supervisor_office_acknowledgements: acknowledgements.map(row => ({ item_id: String(row.item_id), user_id: String(row.actor_id) })),
    supervisor_qa_submissions: submissions.map(row => ({ item_id: String(row.item_id) })),
    site_handovers: handovers as unknown as NextActionSnapshot["site_handovers"],
    document_revisions: documents as unknown as NextActionSnapshot["document_revisions"],
    qa_results: submissions.flatMap(row => {
      const item = items.find(candidate => candidate.id === row.item_id);
      return item ? [{ item_id: String(row.item_id), submission_id: String(row.id), contract_id: String(item.contract_id), title: String(item.title), location_path: (item.location_path as string[]) ?? [],
        inspection_id: String(row.inspection_id), has_issues: row.has_issues === true, submitted_at: String(row.submitted_at),
        submitted_by_name: memberNames.get(String(row.submitted_by)) ?? null, followed_up: followedUp.has(String(row.inspection_id)) }] : [];
    }),
    handover_notes: handoverNotes as unknown as NextActionSnapshot["handover_notes"],
    ...(followUp ? {
      office_reviews: reviews!.map(row => ({ qa_submission_id: (row.qa_submission_id as string | null) ?? null, handover_id: (row.handover_id as string | null) ?? null })),
      office_item_withdrawals: withdrawals!.map(row => ({ item_id: String(row.item_id) })),
    } : {}),
    ...(conversations ? { job_threads: jobThreadRows(threads, lookups) } : {}),
    ...(dayworks && dayworkSubmissions ? { dayworks: dayworks.map(row => ({ ...(row as unknown as Omit<NonNullable<NextActionSnapshot["dayworks"]>[number], "submitted_by">),
      number: Number(row.number),
      submitted_by: [...new Set(dayworkSubmissions.filter(event => event.daywork_id === row.id).map(event => String(event.actor_id)))] })) } : {}),
  };
  return { snapshot, viewer: { user_id: member.user_id, role: member.role, financial_access: financial } };
}
