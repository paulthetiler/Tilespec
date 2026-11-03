import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import type { JobCostEntry, LabourCostLine, LabourRate, MaterialMatch, MaterialRecord } from "./job-costs";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
// Job costs arrive with their own reviewed migration (C3); before it is applied they are simply absent.
const missing = (error: { code?: string } | null) => !!error && ["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "");
const numbers = <T,>(rows: unknown, keys: string[]) => ((rows ?? []) as Record<string, unknown>[])
  .map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [key, row[key] === null ? null : Number(row[key])])) })) as T[];

/** Materials used on a job: quantities only. Readable by the supervisors and office on the job. Null until the migration is applied. */
export async function materialsFor(supabase: SupabaseClient, contractId: string, sinceDate?: string): Promise<MaterialRecord[] | null> {
  let query = supabase.from("site_material_records")
    .select("id,contract_id,batch_id,position,work_date,item,quantity,unit,work_area_id,location_path,note,recorded_by,recorded_by_name,recorded_at,voided_at,void_reason")
    .eq("contract_id", contractId);
  if (sinceDate) query = query.gte("work_date", sinceDate);
  const result: Result = await query.order("work_date", { ascending: false }).order("recorded_at", { ascending: false }).order("position").limit(500);
  if (missing(result.error)) return null;
  checkDatabase(result.error);
  return numbers<MaterialRecord>(result.data, ["quantity", "position"]);
}

export type JobMoney = { labour: LabourCostLine[]; rates: LabourRate[]; costs: JobCostEntry[]; matches: MaterialMatch[] };
/**
 * Labour costs, rates, purchases and invoices, and material matches for one job. Call only for
 * someone with money access; the database refuses or returns nothing to anyone else. Null until
 * the migration is applied.
 */
export async function jobMoneyFor(supabase: SupabaseClient, contractId: string): Promise<JobMoney | null> {
  const [labour, rates, costs, matches] = await Promise.all([
    supabase.rpc("contract_labour_costs", { p_contract: contractId }) as unknown as Promise<Result>,
    // Rates for this job and for every job; the database decides which this person may read.
    supabase.from("labour_cost_rates").select("*").or(`contract_id.eq.${contractId},contract_id.is.null`).order("effective_from", { ascending: false }) as unknown as Promise<Result>,
    supabase.from("job_cost_entries").select("*").eq("contract_id", contractId).order("cost_date", { ascending: false }).order("recorded_at", { ascending: false }) as unknown as Promise<Result>,
    supabase.from("material_cost_matches").select("id,material_record_id,cost_entry_id,matched_by_name,matched_at,voided_at").eq("contract_id", contractId) as unknown as Promise<Result>,
  ]);
  if ([labour, rates, costs, matches].some(result => missing(result.error))) return null;
  for (const result of [labour, rates, costs, matches]) checkDatabase(result.error);
  return {
    labour: numbers<LabourCostLine>(labour.data, ["hours", "rate", "cost"]),
    rates: numbers<LabourRate>(rates.data, ["rate"]),
    costs: numbers<JobCostEntry>(costs.data, ["net_amount"]),
    matches: (matches.data ?? []) as MaterialMatch[],
  };
}
