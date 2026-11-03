import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import { POSITION_NUMBERS, type FinancialPosition } from "./financial-position";

/**
 * The financial position of each job the person may see the money for. Call only for someone with
 * money access; the database returns nothing for anyone else. Null until the migration is applied.
 */
export async function positionsFor(supabase: SupabaseClient, contractIds: string[]): Promise<Map<string, FinancialPosition> | null> {
  if (!contractIds.length) return new Map();
  const result = await supabase.rpc("contract_financial_positions", { p_contracts: contractIds });
  if (result.error && ["PGRST202", "42883"].includes(result.error.code)) return null;
  checkDatabase(result.error);
  const rows = ((result.data ?? []) as Record<string, unknown>[]).map(row => ({ ...row,
    ...Object.fromEntries(POSITION_NUMBERS.map(key => [key, row[key] === null || row[key] === undefined ? null : Number(row[key])])) })) as unknown as FinancialPosition[];
  return new Map(rows.map(row => [row.contract_id, row]));
}
