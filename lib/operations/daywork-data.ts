import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import type {
  Daywork, DayworkApproval, DayworkClientAuthorisation, DayworkEvent, DayworkLine, DayworkPhoto, DayworkPricing, DayworkPricingLine, DayworkRate,
  DayworkSignoff, RateItem,
} from "./dayworks";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
// Dayworks arrive with their own reviewed migration; before it is applied they are simply absent.
const missing = (error: { code?: string } | null) => !!error && ["42P01", "PGRST205"].includes(error.code ?? "");

export async function dayworksAvailable(supabase: SupabaseClient) {
  const result = await supabase.from("dayworks").select("id").limit(1);
  if (missing(result.error)) return false;
  checkDatabase(result.error);
  return true;
}

export type DayworkRecords = {
  dayworks: Daywork[]; lines: DayworkLine[]; events: DayworkEvent[]; signoffs: DayworkSignoff[];
  clientAuthorisations: DayworkClientAuthorisation[]; photos: DayworkPhoto[];
};
/** A job's dayworks with the signed-in person's own access. Null until the migration is applied. Reads only. */
export async function dayworksFor(supabase: SupabaseClient, contractId: string, dayworkId?: string): Promise<DayworkRecords | null> {
  async function rows(table: string, order: string) {
    const all: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      let query = supabase.from(table).select("*").eq("contract_id", contractId);
      if (dayworkId) query = query.eq(table === "dayworks" ? "id" : "daywork_id", dayworkId);
      const result: Result = await query.order(order).order("id").range(start, start + 499);
      if (result.error) return { data: null, error: result.error };
      const page = (result.data ?? []) as Record<string, unknown>[];
      all.push(...page);
      if (page.length < 500) return { data: all, error: null };
    }
  }
  const [dayworks, lines, events, signoffs, authorisations, photos] = await Promise.all([
    rows("dayworks", "number"), rows("daywork_lines", "position"), rows("daywork_events", "created_at"), rows("daywork_signoffs", "recorded_at"),
    rows("daywork_client_authorisations", "recorded_at"), rows("daywork_photos", "created_at"),
  ]);
  if (missing(dayworks.error)) return null;
  for (const result of [dayworks, lines, events, signoffs, authorisations, photos]) checkDatabase(result.error);
  const numeric = <T,>(list: Record<string, unknown>[], keys: string[]) => list.map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [key, Number(row[key])])) })) as T[];
  return {
    dayworks: dayworks.data as unknown as Daywork[], lines: numeric<DayworkLine>(lines.data!, ["quantity"]), events: events.data as unknown as DayworkEvent[],
    signoffs: signoffs.data as unknown as DayworkSignoff[], clientAuthorisations: authorisations.data as unknown as DayworkClientAuthorisation[],
    photos: photos.data as unknown as DayworkPhoto[],
  };
}

export type DayworkMoney = { rates: DayworkRate[]; pricings: DayworkPricing[]; pricingLines: DayworkPricingLine[]; approvals: DayworkApproval[] };
/**
 * Rates, prices and internal approvals. Call only for someone with money access; row-level
 * security still returns nothing to anyone else, so this never leaks.
 */
export async function dayworkMoneyFor(supabase: SupabaseClient, contractId: string): Promise<DayworkMoney | null> {
  const [rates, pricings, pricingLines, approvals] = await Promise.all([
    supabase.from("contract_daywork_rates").select("*").eq("contract_id", contractId).order("category").order("item").order("created_at"),
    supabase.from("daywork_pricings").select("*").eq("contract_id", contractId).order("priced_at", { ascending: false }),
    supabase.from("daywork_pricing_lines").select("*").eq("contract_id", contractId),
    supabase.from("daywork_commercial_approvals").select("*").eq("contract_id", contractId),
  ]);
  if (missing(rates.error)) return null;
  for (const result of [rates, pricings, pricingLines, approvals]) checkDatabase(result.error);
  const numbers = <T,>(list: unknown[] | null, keys: string[]) => (list ?? []).map(row => ({ ...(row as object),
    ...Object.fromEntries(keys.map(key => [key, Number((row as Record<string, unknown>)[key])])) })) as T[];
  return {
    rates: numbers<DayworkRate>(rates.data, ["rate"]), pricings: numbers<DayworkPricing>(pricings.data, ["total", "lines_version"]),
    pricingLines: numbers<DayworkPricingLine>(pricingLines.data, ["rate", "quantity", "amount"]), approvals: (approvals.data ?? []) as DayworkApproval[],
  };
}

/** The items the job has rates for, without any money: what a supervisor can choose from. */
export async function rateItemsFor(supabase: SupabaseClient, contractId: string): Promise<RateItem[]> {
  const result = await supabase.rpc("daywork_rate_items", { p_contract: contractId });
  if (result.error && ["PGRST202", "42883"].includes(result.error.code)) return [];
  checkDatabase(result.error);
  return (result.data ?? []) as RateItem[];
}
