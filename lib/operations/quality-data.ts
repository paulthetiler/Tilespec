import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRpc } from "./data";
import type { HoldNotifications, QualityOverview } from "./quality";
import { qualityRpcFilters } from "./quality";

// Only an absent reviewed migration permits a compatibility message. Other
// failures remain errors; they must never become zero holds or a release claim.
export function qualityMigrationUnavailable(error: { code?: string } | null) {
  return !!error && ["PGRST202", "42883"].includes(error.code ?? "");
}
export async function qualityOverviewFor(supabase: SupabaseClient, filters: Record<string, unknown> = {}, page = 0) {
  const result = await supabase.rpc("hold_register", { p_filters: qualityRpcFilters(filters), p_page: page });
  if (qualityMigrationUnavailable(result.error)) return null;
  checkRpc(result.error);
  return result.data as QualityOverview;
}
export async function holdNotificationsFor(supabase: SupabaseClient, contractId: string | null = null, unreadOnly = false) {
  const result = await supabase.rpc("hold_notifications", { p_contract: contractId, p_unread_only: unreadOnly });
  if (qualityMigrationUnavailable(result.error)) return null;
  checkRpc(result.error);
  return result.data as HoldNotifications;
}
