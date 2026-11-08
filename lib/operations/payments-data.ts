import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import type { PaymentApplication, PaymentLine, PaymentReceipt, PaymentSummary } from "./payments";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
// Payment applications arrive with their own reviewed migration (C4); before it is applied they are absent.
const missing = (error: { code?: string } | null) => !!error && ["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "");
const numbers = <T,>(rows: unknown, keys: string[]) => ((rows ?? []) as Record<string, unknown>[])
  .map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [key, row[key] === null || row[key] === undefined ? null : Number(row[key])])) })) as T[];

export type Payments = { summaries: PaymentSummary[]; applications: PaymentApplication[]; lines: PaymentLine[]; receipts: PaymentReceipt[] };
/** Money access only; the database refuses or returns nothing to anyone else. Null until the migration is applied. */
export async function paymentsFor(supabase: SupabaseClient, contractId: string): Promise<Payments | null> {
  const [summaries, applications, lines, receipts] = await Promise.all([
    supabase.rpc("payment_application_summaries", { p_contract: contractId }) as unknown as Promise<Result>,
    supabase.from("payment_applications").select("*").eq("contract_id", contractId).order("number") as unknown as Promise<Result>,
    supabase.from("payment_application_lines").select("*").eq("contract_id", contractId).order("position") as unknown as Promise<Result>,
    supabase.from("payment_receipts").select("*").eq("contract_id", contractId).order("received_on") as unknown as Promise<Result>,
  ]);
  if ([summaries, applications, lines, receipts].some(result => missing(result.error))) return null;
  for (const result of [summaries, applications, lines, receipts]) checkDatabase(result.error);
  const allLines = numbers<PaymentLine>(lines.data, ["amount"]), apps = (applications.data ?? []) as PaymentApplication[];
  return {
    summaries: numbers<PaymentSummary>(summaries.data, ["gross", "retention_percent", "retention", "net", "net_this_period", "certified_gross",
      "certified_retention", "certified_net", "certified_this_period", "received"]),
    applications: apps,
    // Only each application's current set of lines; earlier corrections stay in the database.
    lines: allLines.filter(line => apps.some(app => app.id === line.application_id && app.lines_version === line.lines_version)),
    receipts: numbers<PaymentReceipt>(receipts.data, ["amount"]),
  };
}
