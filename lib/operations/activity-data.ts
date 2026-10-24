import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../auth";
import { buildActivity, type ActivityEntry, type ActivitySources } from "./activity";
import { aboutLabel, emptyLookups } from "./conversations";
import type { AboutType } from "./daily";
import { checkDatabase, locationsFor } from "./data";
import { indexLocations, locationPath } from "./locations";
import { canManageContracts } from "./permissions";

export const ACTIVITY_PAGE = 50;
/** Snag history is only readable per snag through `snag_events`, so a page reads at most this many snags. */
const SNAG_LIMIT = 30;
type Row = Record<string, unknown>;
type Source = { rows: Row[]; time: string; full: boolean };

/**
 * Reads one page of a job's saved records, newest first, with the signed-in person's own
 * access. Row-level security still decides what each person sees (a supervisor sees only the
 * messages addressed to them or the whole site, and only their own acknowledgements). Snag
 * history comes from the existing `snag_events` function, which applies its own permission
 * check. A failed read is an error, never an empty timeline.
 *
 * Every source is read newest first, up to a limit. If a source reaches its limit, older
 * records of that source are not on this page, so the page stops at that source's oldest
 * record and "Show earlier" continues from there. Nothing is skipped between pages.
 */
export async function activityFor(supabase: SupabaseClient, member: Member, contractId: string, before?: string | null):
  Promise<{ entries: ActivityEntry[]; nextBefore: string | null }> {
  const read = async (table: string, columns: string, time: string, filter?: (query: any) => any) => {
    let query = supabase.from(table).select(columns).eq("contract_id", contractId);
    if (filter) query = filter(query);
    if (before) query = query.lt(time, before);
    return query.order(time, { ascending: false }).order("id").limit(ACTIVITY_PAGE);
  };
  const source = (time: string, data: unknown): Source => {
    const rows = (data ?? []) as unknown as Row[];
    return { rows, time, full: rows.length === ACTIVITY_PAGE };
  };
  const page = async (table: string, columns: string, time: string, filter?: (query: any) => any): Promise<Source> => {
    const result = await read(table, columns, time, filter);
    checkDatabase(result.error);
    return source(time, result.data);
  };
  // Reviews and withdrawals arrive with a later reviewed migration; before it, they are simply absent.
  const optionalPage = async (table: string, columns: string, time: string): Promise<Source | null> => {
    const result = await read(table, columns, time);
    if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) return null;
    checkDatabase(result.error);
    return source(time, result.data);
  };
  const byIds = async (table: string, columns: string, ids: string[]) => {
    if (!ids.length) return [] as Row[];
    const result = await supabase.from(table).select(columns).in("id", [...new Set(ids)]);
    checkDatabase(result.error);
    return (result.data ?? []) as unknown as Row[];
  };
  const office = canManageContracts(member);
  const snagQuery = supabase.from("supervisor_issues").select("id,check_label,work_area_id,updated_at").eq("contract_id", contractId).not("snag_status", "is", null);
  const [locations, snagList, holdEvents, messages, acknowledgements, results, handovers, morningChecks, inspections, plans, documents, members, withdrawals, reviews, jobMessages] = await Promise.all([
    locationsFor(supabase, contractId),
    // A snag's events are all no later than its last update, so the most recently updated snags hold the newest history.
    (before ? snagQuery.lt("created_at", before) : snagQuery).order("updated_at", { ascending: false }).order("id").limit(SNAG_LIMIT)
      .then(result => { checkDatabase(result.error); return (result.data ?? []) as Row[]; }),
    page("work_hold_events", "id,hold_id,action,note,actor_id,actor_name,created_at", "created_at"),
    // Every column, so instruction changes (replaces_id, urgent) appear once their migration is applied.
    page("supervisor_office_items", "*", "created_at"),
    page("supervisor_office_acknowledgements", "id,item_id,actor_id,acknowledged_at", "acknowledged_at"),
    page("supervisor_qa_submissions", "id,item_id,submitted_by,submitted_at,has_issues", "submitted_at"),
    page("site_handovers", "id,actor_id,actor_name,work_date,created_at,work_completed,outstanding_problems,areas_awaiting_attention,office_notes", "created_at"),
    page("supervisor_inspections", "id,actor_id,created_at,issues_count", "created_at"),
    page("location_inspections", "id,actor_id,actor_name,created_at,issues_count,location_path", "created_at"),
    page("planned_allocations", "id,team_id,work_area_id,planned_start,planned_end,instructions,created_by,created_at,supersedes_id,cancelled_at,cancelled_by", "created_at"),
    page("document_revisions", "id,title,revision,created_by,uploaded_at", "uploaded_at", query => query.eq("classification", "operational").not("uploaded_at", "is", null)),
    // The office already reads the member list; a supervisor only knows their own name.
    office ? supabase.from("organisation_members").select("user_id,display_name").then(result => { checkDatabase(result.error); return (result.data ?? []) as Row[]; })
      : Promise.resolve([{ user_id: member.user_id, display_name: member.display_name }] as Row[]),
    optionalPage("supervisor_office_item_withdrawals", "id,item_id,reason,withdrawn_by,withdrawn_by_name,withdrawn_at", "withdrawn_at"),
    optionalPage("office_reviews", "id,qa_submission_id,handover_id,outcome,note,reviewed_by,reviewed_by_name,reviewed_at", "reviewed_at"),
    // Questions and replies: row-level security shows a supervisor only their own conversations.
    optionalPage("job_messages", "id,thread_id,author_id,author_name,author_side,body,needs_answer,about_type,about_id,created_at", "created_at"),
  ]);
  const snagEvents = (await Promise.all(snagList.map(async snag => {
    const result = await supabase.rpc("snag_events", { p_issue: snag.id });
    checkDatabase(result.error);
    return ((result.data ?? []) as Row[]).filter(event => !before || String(event.created_at) < before).map(event => {
      const snapshot = (event.snapshot ?? {}) as Row;
      return { id: event.id, issue_id: String(snag.id), action: String(event.action), note: String(event.note ?? ""), actor_id: String(event.actor_id),
        actor_name: (event.actor_name as string | null) ?? null, created_at: String(event.created_at),
        assigned_action: (snapshot.assigned_action as string | null) ?? null, target_date: (snapshot.target_date as string | null) ?? null,
        assigned_party: (snapshot.assigned_party as string | null) ?? null };
    });
  }))).flat() as ActivitySources["snagEvents"];
  const index = indexLocations(locations);
  const where = (id: unknown) => (typeof id === "string" ? locationPath(index, id) : "");
  const listed = new Set(messages.rows.map(row => String(row.id)));
  const listedResults = new Set(results.rows.map(row => String(row.id)));
  const listedHandovers = new Set(handovers.rows.map(row => String(row.id)));
  const reviewRows = reviews?.rows ?? [];
  // A reply's conversation can have started on an earlier page; read its first message only for what it is about.
  const messageRows = jobMessages?.rows ?? [];
  const listedJobMessages = new Set(messageRows.map(row => String(row.id)));
  const earlierRoots = await byIds("job_messages", "id,about_type,about_id", messageRows.map(row => String(row.thread_id)).filter(id => !listedJobMessages.has(id)));
  const roots = new Map([...messageRows, ...earlierRoots].filter(row => row.about_type)
    .map(row => [String(row.id), { about_type: row.about_type as AboutType, about_id: (row.about_id as string | null) ?? null }]));
  const aboutIds = (type: AboutType) => [...roots.values()].filter(root => root.about_type === type && root.about_id).map(root => root.about_id!);
  const [holds, teams, olderResults, olderHandovers, aboutSnags, aboutHolds] = await Promise.all([
    byIds("work_holds", "id,hold_type,work_area_id,location_path", holdEvents.rows.map(row => String(row.hold_id))),
    byIds("teams", "id,name", plans.rows.map(row => String(row.team_id))),
    // A review or conversation can name a result or handover from an earlier page; read it only for its title.
    byIds("supervisor_qa_submissions", "id,item_id,submitted_by,submitted_at,has_issues",
      [...reviewRows.map(row => row.qa_submission_id), ...aboutIds("qa_result")].filter((id): id is string => typeof id === "string" && !listedResults.has(id))),
    byIds("site_handovers", "id,actor_id,actor_name,work_date,created_at,work_completed,outstanding_problems,areas_awaiting_attention,office_notes",
      [...reviewRows.map(row => row.handover_id), ...aboutIds("handover")].filter((id): id is string => typeof id === "string" && !listedHandovers.has(id))),
    byIds("supervisor_issues", "id,check_label", aboutIds("snag")),
    byIds("work_holds", "id,hold_type,category", aboutIds("hold")),
  ]);
  // Acknowledgements, results, withdrawals, changes and conversations can refer to an earlier message than this page shows.
  const olderMessages = await byIds("supervisor_office_items", "*", [...acknowledgements.rows, ...results.rows, ...olderResults, ...(withdrawals?.rows ?? [])]
    .map(row => String(row.item_id)).concat(messages.rows.map(row => row.replaces_id).filter((id): id is string => typeof id === "string"), aboutIds("office_item"))
    .filter(id => !listed.has(id)));
  const lookups = emptyLookups();
  for (const row of [...messages.rows, ...olderMessages]) lookups.items.set(String(row.id), { title: String(row.title), kind: String(row.kind) });
  for (const row of [...results.rows, ...olderResults]) lookups.results.set(String(row.id), { item_id: String(row.item_id) });
  for (const row of [...handovers.rows, ...olderHandovers]) lookups.handovers.set(String(row.id), { work_date: String(row.work_date), actor_name: String(row.actor_name) });
  for (const row of [...snagList, ...aboutSnags]) lookups.snags.set(String(row.id), String(row.check_label));
  for (const row of aboutHolds) lookups.holds.set(String(row.id), `${row.hold_type === "safety" ? "Safety stop" : "Quality hold"}, ${row.category}`);
  const teamName = new Map(teams.map(row => [String(row.id), String(row.name)]));
  const sources: ActivitySources = {
    snagEvents,
    snags: snagList.map(row => ({ id: String(row.id), check_label: String(row.check_label ?? ""), location: where(row.work_area_id) })),
    holdEvents: holdEvents.rows as unknown as ActivitySources["holdEvents"],
    holds: holds.map(row => ({ id: String(row.id), hold_type: String(row.hold_type),
      location: (row.location_path as string[] | null)?.join(" › ") || where(row.work_area_id) })),
    messages: [...messages.rows, ...olderMessages] as unknown as ActivitySources["messages"],
    acknowledgements: acknowledgements.rows as unknown as ActivitySources["acknowledgements"],
    results: [...results.rows, ...olderResults] as unknown as ActivitySources["results"],
    handovers: [...handovers.rows, ...olderHandovers] as unknown as ActivitySources["handovers"],
    withdrawals: (withdrawals?.rows ?? []) as unknown as ActivitySources["withdrawals"],
    reviews: reviewRows as unknown as ActivitySources["reviews"],
    jobMessages: messageRows.map(row => {
      const root = roots.get(String(row.thread_id));
      return { id: String(row.id), thread_id: String(row.thread_id), author_id: String(row.author_id), author_name: String(row.author_name), author_side: String(row.author_side),
        body: String(row.body), needs_answer: row.needs_answer === true, created_at: String(row.created_at),
        about: root ? aboutLabel(root.about_type, root.about_id, lookups) : null };
    }),
    morningChecks: morningChecks.rows as unknown as ActivitySources["morningChecks"],
    inspections: inspections.rows.map(row => ({ id: String(row.id), actor_id: String(row.actor_id), actor_name: (row.actor_name as string | null) ?? null,
      created_at: String(row.created_at), issues_count: Number(row.issues_count), location: (row.location_path as string[] | null)?.join(" › ") ?? "" })),
    plans: plans.rows.map(row => ({ id: String(row.id), team: teamName.get(String(row.team_id)) ?? "A gang", location: where(row.work_area_id),
      planned_start: String(row.planned_start), planned_end: String(row.planned_end), instructions: String(row.instructions ?? ""),
      created_by: (row.created_by as string | null) ?? null, created_at: String(row.created_at), supersedes_id: (row.supersedes_id as string | null) ?? null,
      cancelled_at: (row.cancelled_at as string | null) ?? null, cancelled_by: (row.cancelled_by as string | null) ?? null })),
    documents: documents.rows as unknown as ActivitySources["documents"],
  };
  // The page stops at the oldest record of any source that reached its limit.
  const cuts = [holdEvents, messages, acknowledgements, results, handovers, morningChecks, inspections, plans, documents, withdrawals, reviews, jobMessages]
    .filter((source): source is Source => !!source?.full).map(source => String(source.rows.at(-1)![source.time]));
  if (snagList.length === SNAG_LIMIT) cuts.push(String(snagList.at(-1)!.updated_at));
  const cut = cuts.sort().at(-1) ?? null;
  // Older records fetched only for their titles are not themselves new activity on this page.
  const onPage = (entry: ActivityEntry) => (entry.id.startsWith("message:") ? listed.has(entry.id.slice("message:".length))
    : entry.id.startsWith("result:") ? listedResults.has(entry.id.slice("result:".length))
    : entry.id.startsWith("handover:") ? listedHandovers.has(entry.id.slice("handover:".length)) : true);
  const all = buildActivity(sources, { viewerId: member.user_id, names: new Map(members.map(row => [String(row.user_id), String(row.display_name)])),
    siteBase: `/admin/supervisor/sites/${contractId}`, contractId, office })
    .filter(onPage)
    .filter(entry => !cut || entry.at >= cut);
  const entries = all.slice(0, ACTIVITY_PAGE);
  return { entries, nextBefore: all.length > ACTIVITY_PAGE ? entries.at(-1)!.at : cut };
}
