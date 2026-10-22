import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../auth";
import { buildActivity, type ActivityEntry, type ActivitySources } from "./activity";
import { checkDatabase, locationsFor } from "./data";
import { indexLocations, locationPath } from "./locations";
import { canManageContracts } from "./permissions";

export const ACTIVITY_PAGE = 50;
type Row = Record<string, unknown>;

/**
 * Reads one page of a job's saved records, newest first, with the signed-in person's own
 * access. Row-level security still decides what each person sees (a supervisor sees only the
 * messages addressed to them or the whole site, and only their own acknowledgements).
 * A failed read is an error, never an empty timeline.
 */
export async function activityFor(supabase: SupabaseClient, member: Member, contractId: string, before?: string | null):
  Promise<{ entries: ActivityEntry[]; nextBefore: string | null }> {
  const page = async (table: string, columns: string, time: string, filter?: (query: any) => any) => {
    let query = supabase.from(table).select(columns).eq("contract_id", contractId);
    if (filter) query = filter(query);
    if (before) query = query.lt(time, before);
    const result = await query.order(time, { ascending: false }).order("id").limit(ACTIVITY_PAGE);
    checkDatabase(result.error);
    return (result.data ?? []) as unknown as Row[];
  };
  const byIds = async (table: string, columns: string, ids: string[]) => {
    if (!ids.length) return [] as Row[];
    const result = await supabase.from(table).select(columns).in("id", [...new Set(ids)]);
    checkDatabase(result.error);
    return (result.data ?? []) as unknown as Row[];
  };
  const office = canManageContracts(member);
  const [locations, snagEvents, holdEvents, messages, acknowledgements, results, handovers, morningChecks, inspections, plans, documents, members] = await Promise.all([
    locationsFor(supabase, contractId),
    page("supervisor_issue_events", "id,issue_id,action,note,actor_id,actor_name,created_at,assigned_action:snapshot->>assigned_action,target_date:snapshot->>target_date,assigned_party:snapshot->>assigned_party", "created_at"),
    page("work_hold_events", "id,hold_id,action,note,actor_id,actor_name,created_at", "created_at"),
    page("supervisor_office_items", "id,kind,title,body,created_by,created_by_name,recipient_name,location_path,due_on,created_at", "created_at"),
    page("supervisor_office_acknowledgements", "id,item_id,actor_id,acknowledged_at", "acknowledged_at"),
    page("supervisor_qa_submissions", "id,item_id,submitted_by,submitted_at,has_issues", "submitted_at"),
    page("site_handovers", "id,actor_id,actor_name,created_at,work_completed,outstanding_problems,areas_awaiting_attention,office_notes", "created_at"),
    page("supervisor_inspections", "id,actor_id,created_at,issues_count", "created_at"),
    page("location_inspections", "id,actor_id,actor_name,created_at,issues_count,location_path", "created_at"),
    page("planned_allocations", "id,team_id,work_area_id,planned_start,planned_end,instructions,created_by,created_at,supersedes_id,cancelled_at,cancelled_by", "created_at"),
    page("document_revisions", "id,title,revision,created_by,uploaded_at", "uploaded_at", query => query.eq("classification", "operational").not("uploaded_at", "is", null)),
    // The office already reads the member list; a supervisor only knows their own name.
    office ? supabase.from("organisation_members").select("user_id,display_name").then(result => { checkDatabase(result.error); return (result.data ?? []) as Row[]; })
      : Promise.resolve([{ user_id: member.user_id, display_name: member.display_name }] as Row[]),
  ]);
  const index = indexLocations(locations);
  const where = (id: unknown) => (typeof id === "string" ? locationPath(index, id) : "");
  const listed = new Set(messages.map(row => String(row.id)));
  const [snags, holds, teams, olderMessages] = await Promise.all([
    byIds("supervisor_issues", "id,check_label,work_area_id", snagEvents.map(row => String(row.issue_id))),
    byIds("work_holds", "id,hold_type,work_area_id,location_path", holdEvents.map(row => String(row.hold_id))),
    byIds("teams", "id,name", plans.map(row => String(row.team_id))),
    // Acknowledgements and results can refer to an earlier message than this page shows.
    byIds("supervisor_office_items", "id,kind,title,body,created_by,created_by_name,recipient_name,location_path,due_on,created_at",
      [...acknowledgements, ...results].map(row => String(row.item_id)).filter(id => !listed.has(id))),
  ]);
  const teamName = new Map(teams.map(row => [String(row.id), String(row.name)]));
  const sources: ActivitySources = {
    snagEvents: snagEvents as unknown as ActivitySources["snagEvents"],
    snags: snags.map(row => ({ id: String(row.id), check_label: String(row.check_label ?? ""), location: where(row.work_area_id) })),
    holdEvents: holdEvents as unknown as ActivitySources["holdEvents"],
    holds: holds.map(row => ({ id: String(row.id), hold_type: String(row.hold_type),
      location: (row.location_path as string[] | null)?.join(" › ") || where(row.work_area_id) })),
    messages: [...messages, ...olderMessages] as unknown as ActivitySources["messages"],
    acknowledgements: acknowledgements as unknown as ActivitySources["acknowledgements"],
    results: results as unknown as ActivitySources["results"],
    handovers: handovers as unknown as ActivitySources["handovers"],
    morningChecks: morningChecks as unknown as ActivitySources["morningChecks"],
    inspections: inspections.map(row => ({ id: String(row.id), actor_id: String(row.actor_id), actor_name: (row.actor_name as string | null) ?? null,
      created_at: String(row.created_at), issues_count: Number(row.issues_count), location: (row.location_path as string[] | null)?.join(" › ") ?? "" })),
    plans: plans.map(row => ({ id: String(row.id), team: teamName.get(String(row.team_id)) ?? "A gang", location: where(row.work_area_id),
      planned_start: String(row.planned_start), planned_end: String(row.planned_end), instructions: String(row.instructions ?? ""),
      created_by: (row.created_by as string | null) ?? null, created_at: String(row.created_at), supersedes_id: (row.supersedes_id as string | null) ?? null,
      cancelled_at: (row.cancelled_at as string | null) ?? null, cancelled_by: (row.cancelled_by as string | null) ?? null })),
    documents: documents as unknown as ActivitySources["documents"],
  };
  // Older messages fetched only for their titles are not themselves new activity on this page.
  const all = buildActivity(sources, { viewerId: member.user_id, names: new Map(members.map(row => [String(row.user_id), String(row.display_name)])),
    siteBase: `/admin/supervisor/sites/${contractId}`, contractId, office })
    .filter(entry => !entry.id.startsWith("message:") || listed.has(entry.id.slice("message:".length)));
  const entries = all.slice(0, ACTIVITY_PAGE);
  const full = [snagEvents, holdEvents, messages, acknowledgements, results, handovers, morningChecks, inspections, plans, documents].some(rows => rows.length === ACTIVITY_PAGE);
  return { entries, nextBefore: all.length > ACTIVITY_PAGE || full ? entries.at(-1)?.at ?? null : null };
}
