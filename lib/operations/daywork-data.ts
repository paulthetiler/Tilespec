import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import {
  DAYWORK_BASE_COLUMNS, DAYWORK_COLUMNS, DAYWORK_EVENT_COLUMNS, goAheads,
  type Daywork, type DayworkApproval, type DayworkClientAuthorisation, type DayworkEvent, type DayworkLine, type DayworkOfficeStatus, type DayworkPhoto,
  type DayworkPricing, type DayworkPricingLine, type DayworkRate, type DayworkSignoff, type GoAhead, type RateItem,
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

/** Variations need their own update (the kind column). Before it is applied, none can be raised. */
export async function variationsAvailable(supabase: SupabaseClient) {
  const result = await supabase.from("dayworks").select("kind").limit(1);
  if (missing(result.error) || result.error?.code === "42703") return false;
  checkDatabase(result.error);
  return true;
}

export type DayworkRecords = {
  dayworks: Daywork[]; lines: DayworkLine[]; events: DayworkEvent[]; signoffs: DayworkSignoff[];
  clientAuthorisations: DayworkClientAuthorisation[]; photos: DayworkPhoto[];
  /** The site's go-ahead for each daywork. Empty if the database cannot answer yet: the pages then say to ask the office. */
  goAhead: Map<string, GoAhead>;
  /** Office only (`office: true`), and only what the database returns to this person. */
  office: Map<string, DayworkOfficeStatus> | null;
  /** False until the variations update is applied: every record is then a daywork and no variation can be raised. */
  variations: boolean;
};
const absentFunction = (error: { code?: string } | null) => !!error && ["PGRST202", "42883"].includes(error.code ?? "");
/**
 * A job's dayworks with the signed-in person's own access. Null until the migration is applied. Reads only.
 * Pass `office: true` only for the office on the job; the database returns nothing to anyone else anyway.
 */
export async function dayworksFor(supabase: SupabaseClient, contractId: string, dayworkId?: string, options: { office?: boolean } = {}): Promise<DayworkRecords | null> {
  async function rows(table: string, order: string, columns = "*") {
    const all: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      let query = supabase.from(table).select(columns).eq("contract_id", contractId);
      if (dayworkId) query = query.eq(table === "dayworks" ? "id" : "daywork_id", dayworkId);
      const result: Result = await query.order(order).order("id").range(start, start + 499);
      if (result.error) return { data: null, error: result.error };
      const page = (result.data ?? []) as Record<string, unknown>[];
      all.push(...page);
      if (page.length < 500) return { data: all, error: null };
    }
  }
  // Before the variations update is applied there is no kind column: read the rest, and every record is a daywork.
  const dayworkRows = async () => {
    const withKind = await rows("dayworks", "number", DAYWORK_COLUMNS);
    if (withKind.error?.code !== "42703") return { ...withKind, variations: true };
    const legacy = await rows("dayworks", "number", DAYWORK_BASE_COLUMNS);
    return { ...legacy, data: legacy.data?.map(row => ({ ...row, kind: "daywork" })) ?? null, variations: false };
  };
  const [dayworks, lines, events, signoffs, authorisations, photos, siteStatuses, officeStatuses] = await Promise.all([
    dayworkRows(), rows("daywork_lines", "position"), rows("daywork_events", "created_at", DAYWORK_EVENT_COLUMNS),
    rows("daywork_signoffs", "recorded_at"), rows("daywork_client_authorisations", "recorded_at"), rows("daywork_photos", "created_at"),
    supabase.rpc("daywork_site_statuses", { p_contracts: [contractId] }) as unknown as Promise<Result>,
    options.office ? supabase.rpc("daywork_office_statuses", { p_contracts: [contractId] }) as unknown as Promise<Result> : Promise.resolve(null),
  ]);
  if (missing(dayworks.error)) return null;
  for (const result of [dayworks, lines, events, signoffs, authorisations, photos]) checkDatabase(result.error);
  const goAhead = new Map<string, GoAhead>();
  if (!absentFunction(siteStatuses.error)) {
    checkDatabase(siteStatuses.error);
    for (const row of (siteStatuses.data ?? []) as { daywork_id: string; go_ahead: string }[])
      if ((goAheads as readonly string[]).includes(row.go_ahead)) goAhead.set(row.daywork_id, row.go_ahead as GoAhead);
  }
  let office: Map<string, DayworkOfficeStatus> | null = null;
  if (officeStatuses && !absentFunction(officeStatuses.error)) {
    checkDatabase(officeStatuses.error);
    office = new Map(((officeStatuses.data ?? []) as (DayworkOfficeStatus & { daywork_id: string })[])
      .map(({ daywork_id, ...status }) => [daywork_id, status]));
  }
  const numeric = <T,>(list: Record<string, unknown>[], keys: string[]) => list.map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [key, Number(row[key])])) })) as T[];
  return {
    dayworks: dayworks.data as unknown as Daywork[], lines: numeric<DayworkLine>(lines.data!, ["quantity"]), events: events.data as unknown as DayworkEvent[],
    signoffs: signoffs.data as unknown as DayworkSignoff[], clientAuthorisations: authorisations.data as unknown as DayworkClientAuthorisation[],
    photos: photos.data as unknown as DayworkPhoto[], goAhead, office, variations: dayworks.variations,
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
    rates: numbers<DayworkRate>(rates.data, ["rate"]),
    pricings: numbers<DayworkPricing>(pricings.data, ["total", "lines_version"]).map(row => ({ ...row, method: row.method ?? "day_rates", note: row.note ?? null })),
    pricingLines: numbers<DayworkPricingLine>(pricingLines.data, ["rate", "quantity", "amount", "markup_percent", "markup"]), approvals: (approvals.data ?? []) as DayworkApproval[],
  };
}

/** The items the job has rates for, without any money: what a supervisor can choose from. */
export async function rateItemsFor(supabase: SupabaseClient, contractId: string): Promise<RateItem[]> {
  const result = await supabase.rpc("daywork_rate_items", { p_contract: contractId });
  if (result.error && ["PGRST202", "42883"].includes(result.error.code)) return [];
  checkDatabase(result.error);
  return (result.data ?? []) as RateItem[];
}

export type DayworkLabel = { id: string; number: number; description: string; kind: "daywork" | "variation" };
/** References for conversations and Job activity (DW-3 or VO-1). Before the variations update, every record is a daywork. */
export async function dayworkLabelsFor(supabase: SupabaseClient, ids: string[]): Promise<DayworkLabel[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  let result: Result = await supabase.from("dayworks").select("id,kind,number,description").in("id", unique);
  if (result.error?.code === "42703") result = await supabase.from("dayworks").select("id,number,description").in("id", unique);
  checkDatabase(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(row => ({ id: String(row.id), number: Number(row.number), description: String(row.description),
    kind: row.kind === "variation" ? "variation" : "daywork" }));
}

/** Every daywork and variation on a job, for choosing one (no statuses, no money). */
export async function dayworkLabelsForContract(supabase: SupabaseClient, contractId: string): Promise<DayworkLabel[]> {
  let result: Result = await supabase.from("dayworks").select("id,kind,number,description").eq("contract_id", contractId).order("number");
  if (result.error?.code === "42703") result = await supabase.from("dayworks").select("id,number,description").eq("contract_id", contractId).order("number");
  if (missing(result.error)) return [];
  checkDatabase(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(row => ({ id: String(row.id), number: Number(row.number), description: String(row.description),
    kind: row.kind === "variation" ? "variation" : "daywork" }));
}
