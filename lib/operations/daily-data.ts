import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase, checkRpc } from "./data";
import type { OfficeAcknowledgement, OfficeItem, OfficeReview, OfficeWithdrawal, QaSubmission, SiteHandover, SupervisorDailyRecords } from "./daily";

// The hold alert stream records a specific hold event and cannot be authored as
// an office instruction. These related daily records use the same contract
// permissions, and are separate from hold alerts so their history stays exact.
export async function supervisorDailyFor(supabase: SupabaseClient, contractId: string): Promise<SupervisorDailyRecords | null> {
  async function allRows(table: string) {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const result = await supabase.from(table).select("*").eq("contract_id", contractId).order("id").range(start, start + 499);
      if (result.error) return { data: null, error: result.error };
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
    }
  }
  const [items, acknowledgements, submissions, handovers, withdrawals, reviews] = await Promise.all([
    allRows("supervisor_office_items"),
    allRows("supervisor_office_acknowledgements"),
    allRows("supervisor_qa_submissions"),
    supabase.from("site_handovers").select("*").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(30),
    allRows("supervisor_office_item_withdrawals"),
    allRows("office_reviews"),
  ]);
  const results = [items, acknowledgements, submissions, handovers];
  // Only a missing reviewed migration permits an unavailable-state message.
  if (results.some(result => missing(result.error))) {
    results.filter(result => result.error && !missing(result.error)).forEach(result => checkDatabase(result.error));
    return null;
  }
  results.forEach(result => checkDatabase(result.error));
  // Reviews and withdrawals arrive with their own reviewed migration. Until it is
  // applied the daily records work exactly as before, with these features hidden.
  const followUp = !missing(withdrawals.error) && !missing(reviews.error);
  if (followUp) [withdrawals, reviews].forEach(result => checkDatabase(result.error));
  return { items: ((items.data ?? []) as OfficeItem[]).sort((a,b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)),
    acknowledgements: (acknowledgements.data ?? []) as OfficeAcknowledgement[],
    submissions: (submissions.data ?? []) as QaSubmission[], handovers: (handovers.data ?? []) as SiteHandover[],
    followUp, withdrawals: followUp ? (withdrawals.data ?? []) as OfficeWithdrawal[] : [], reviews: followUp ? (reviews.data ?? []) as OfficeReview[] : [] };
}
const missing = (error: { code?: string } | null) => !!error && ["PGRST205", "42P01"].includes(error.code ?? "");
export async function siteSupervisorsFor(supabase: SupabaseClient, contractId: string) {
  const result = await supabase.rpc("site_supervisor_recipients", { p_contract: contractId });
  checkRpc(result.error);
  return (result.data ?? []) as { user_id: string; display_name: string }[];
}
