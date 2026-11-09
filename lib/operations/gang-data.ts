import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outstanding verification requests on one job: what the supervisor still has to check. Row-level
 * security limits it to jobs the person supervises. Null when the records are unavailable (for
 * example before the gang invoice migration is applied), so the dashboard never shows a false 0.
 */
export async function pendingGangChecks(supabase: SupabaseClient, contractId: string): Promise<number | null> {
  const result = await supabase.from("gang_verification_requests").select("id", { count: "exact", head: true })
    .eq("contract_id", contractId).is("resolved_at", null);
  return result.error ? null : result.count ?? 0;
}

export type OfficeGangSummary = { needsSupervisor: number; readyToApprove: number; waitingOnGang: number; toPay: number; dueThisWeek: number } | null;
/** The office's handover counts. Money-access users only see what row-level security allows. */
export async function officeGangSummary(supabase: SupabaseClient, today: string): Promise<OfficeGangSummary> {
  const [requests, invoices, money] = await Promise.all([
    supabase.from("gang_verification_requests").select("contract_id,routed_to").is("resolved_at", null),
    supabase.from("gang_invoices").select("id,status").in("status", ["with_office", "query_gang", "returned", "approved"]),
    supabase.from("gang_invoice_commercials").select("invoice_id,payment_due_on,agreed_payment_on,approved_at,paid_on").not("approved_at", "is", null).is("paid_on", null),
  ]);
  if (requests.error || invoices.error) return null;
  const assignments = await supabase.from("contract_assignments").select("contract_id,user_id,valid_from,valid_until,organisation_members!inner(role,active)");
  const supervised = new Set((assignments.data ?? []).filter(a => {
    const m = a.organisation_members as unknown as { role: string; active: boolean } | null;
    return m?.role === "supervisor" && m.active && a.valid_from <= today && (!a.valid_until || a.valid_until >= today);
  }).map(a => a.contract_id));
  const weekAhead = new Date(`${today}T00:00:00Z`); weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
  const due = (money.data ?? []).map(m => m.agreed_payment_on ?? m.payment_due_on);
  return {
    needsSupervisor: (requests.data ?? []).filter(r => r.routed_to === "office" && !supervised.has(r.contract_id)).length,
    readyToApprove: (invoices.data ?? []).filter(i => i.status === "with_office").length,
    waitingOnGang: (invoices.data ?? []).filter(i => i.status === "query_gang" || i.status === "returned").length,
    toPay: (money.data ?? []).length,
    dueThisWeek: due.filter(d => d <= weekAhead.toISOString().slice(0, 10)).length,
  };
}
