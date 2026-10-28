import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyLookups, type AboutLookups } from "./conversations";
import { checkDatabase } from "./data";
import type { JobThread, SupervisorDailyRecords } from "./daily";

/**
 * Titles for the records the job's conversations are about. Office messages, results and
 * handovers are already in the daily records; snags and stops are read by their IDs, with
 * the signed-in person's own access. Reads only.
 */
export async function aboutLookupsFor(supabase: SupabaseClient, daily: SupervisorDailyRecords, threads: JobThread[],
  extra?: { about_type: string; about_id: string } | null): Promise<AboutLookups> {
  const lookups = emptyLookups();
  for (const item of daily.items) lookups.items.set(item.id, { title: item.title, kind: item.kind });
  for (const result of daily.submissions) lookups.results.set(result.id, { item_id: result.item_id });
  for (const handover of daily.handovers) lookups.handovers.set(handover.id, { work_date: handover.work_date, actor_name: handover.actor_name });
  const about = [...threads.map(thread => ({ about_type: thread.about_type as string, about_id: thread.about_id })), ...(extra ? [extra] : [])];
  const ids = (type: string) => [...new Set(about.filter(entry => entry.about_type === type && entry.about_id).map(entry => entry.about_id!))];
  const [snags, holds, dayworks] = await Promise.all([
    ids("snag").length ? supabase.from("supervisor_issues").select("id,check_label").in("id", ids("snag")) : Promise.resolve({ data: [], error: null }),
    ids("hold").length ? supabase.from("work_holds").select("id,hold_type,category").in("id", ids("hold")) : Promise.resolve({ data: [], error: null }),
    ids("daywork").length ? supabase.from("dayworks").select("id,number,description").in("id", ids("daywork")) : Promise.resolve({ data: [], error: null }),
  ]);
  checkDatabase(snags.error);
  checkDatabase(holds.error);
  checkDatabase(dayworks.error);
  for (const row of (dayworks.data ?? []) as { id: string; number: number; description: string }[]) lookups.dayworks.set(row.id, { number: row.number, description: row.description });
  for (const row of (snags.data ?? []) as { id: string; check_label: string }[]) lookups.snags.set(row.id, row.check_label);
  for (const row of (holds.data ?? []) as { id: string; hold_type: string; category: string }[])
    lookups.holds.set(row.id, `${row.hold_type === "safety" ? "Safety stop" : "Quality hold"}, ${row.category}`);
  return lookups;
}

/** True when the record a new conversation would be about is one the person can read on this job. */
export function canAsk(lookups: AboutLookups, about: { about_type: string; about_id: string }) {
  switch (about.about_type) {
    case "snag": return lookups.snags.has(about.about_id);
    case "hold": return lookups.holds.has(about.about_id);
    case "office_item": return lookups.items.has(about.about_id);
    case "qa_result": return lookups.results.has(about.about_id);
    case "handover": return lookups.handovers.has(about.about_id);
    case "daywork": return lookups.dayworks.has(about.about_id);
    default: return false;
  }
}
