/*
 * One financial position per contract (C5). Money access only. Every figure comes from the
 * database's `contract_financial_positions`; this module only names and explains them.
 */
export type FinancialPosition = {
  contract_id: string; has_budget: boolean; original_value: number; budget_cost: number; contingency: number; target_margin: number | null; retention_percent: number;
  extras_agreed: number; extras_agreed_count: number; extras_pending: number; extras_pending_count: number; extras_unpriced_count: number; revised_value: number;
  labour_cost: number; labour_hours_without_rate: number; labour_still_on_site: number; materials_cost: number; subcontract_cost: number; plant_cost: number; other_cost: number;
  actual_cost: number; forecast_cost: number; forecast_profit: number; forecast_margin: number | null; budget_profit: number; budget_margin: number | null;
  applied_gross: number | null; certified_gross: number | null; certified_net: number | null; retention_held: number | null; received: number; outstanding: number | null;
  subcontract_overlap: number;
};
export const POSITION_NUMBERS = ["original_value", "budget_cost", "contingency", "target_margin", "retention_percent", "extras_agreed", "extras_agreed_count",
  "extras_pending", "extras_pending_count", "extras_unpriced_count", "revised_value", "labour_cost", "labour_hours_without_rate", "labour_still_on_site", "materials_cost",
  "subcontract_cost", "plant_cost", "other_cost", "actual_cost", "forecast_cost", "forecast_profit", "forecast_margin", "budget_profit", "budget_margin", "applied_gross",
  "certified_gross", "certified_net", "retention_held", "received", "outstanding", "subcontract_overlap"] as const;

/** Below the target margin on the forecast. Without a budget or a value there is no margin to judge. */
export const belowTarget = (p: FinancialPosition) => p.forecast_margin !== null && p.target_margin !== null && p.forecast_margin < p.target_margin;

/** What the office should know before relying on the figures, in plain words. */
export function positionWarnings(p: FinancialPosition): string[] {
  const warnings: string[] = [];
  if (!p.has_budget) warnings.push("No original budget is recorded, so there is no margin to compare.");
  if (p.labour_hours_without_rate > 0) warnings.push(`${p.labour_hours_without_rate} hours of labour have no cost rate and are not in the cost yet.`);
  if (p.labour_still_on_site > 0) warnings.push(`${p.labour_still_on_site} ${p.labour_still_on_site === 1 ? "person is" : "people are"} still on site; their time is costed once the day is finished.`);
  if (p.extras_unpriced_count > 0) warnings.push(`${p.extras_unpriced_count} ${p.extras_unpriced_count === 1 ? "daywork or variation is" : "dayworks or variations are"} not priced yet.`);
  if (p.extras_pending_count > 0) warnings.push(`${p.extras_pending_count} priced ${p.extras_pending_count === 1 ? "extra is" : "extras are"} not agreed yet and not in the revised value.`);
  if (p.subcontract_overlap > 0) warnings.push(`${p.subcontract_overlap} subcontract ${p.subcontract_overlap === 1 ? "invoice is" : "invoices are"} from a company whose people are also costed from attendance. Check they are not counted twice.`);
  return warnings;
}
