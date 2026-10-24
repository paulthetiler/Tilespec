import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowUpCandidate } from "@/components/site/office-follow-up";
import { checkDatabase } from "./data";
import { itemState, type OfficeItem, type OfficeWithdrawal } from "./daily";

/**
 * The snags, stops and instructions raised on a job since a result or handover arrived,
 * offered as the review's optional linked follow-up. Reads only, with the office's own access.
 */
export async function followUpCandidates(supabase: SupabaseClient, contractId: string, since: string,
  items: OfficeItem[], withdrawals: OfficeWithdrawal[]): Promise<FollowUpCandidate[]> {
  const [snags, holds] = await Promise.all([
    supabase.from("supervisor_issues").select("id,check_label,created_at").eq("contract_id", contractId).not("snag_status", "is", null)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabase.from("work_holds").select("id,hold_type,category,raised_at").eq("contract_id", contractId)
      .gte("raised_at", since).order("raised_at", { ascending: false }).limit(20),
  ]);
  checkDatabase(snags.error);
  checkDatabase(holds.error);
  return [
    ...(snags.data ?? []).map(row => ({ outcome: "snag_raised" as const, id: String(row.id), label: String(row.check_label) })),
    ...(holds.data ?? []).map(row => ({ outcome: "stop_raised" as const, id: String(row.id),
      label: `${row.hold_type === "safety" ? "Safety stop" : "Quality hold"}: ${String(row.category)}` })),
    ...items.filter(item => item.kind === "instruction" && Date.parse(item.created_at) >= Date.parse(since) && itemState(item, items, withdrawals).state === "current")
      .slice(0, 20).map(item => ({ outcome: "instruction_sent" as const, id: item.id, label: item.title })),
  ];
}
