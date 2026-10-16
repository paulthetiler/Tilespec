import { budgetSummary } from "../summary";
import type { Commercial } from "../types";
import type { CommercialRow } from "./types";

/** Uses the existing, tested budget calculation so the engine never carries its own financial arithmetic. */
export function budgetOf(row: CommercialRow) {
  const b = budgetSummary(row as unknown as Commercial);
  return { value: b.value, cost: b.originalCost, reserve: b.reserve, profit: b.riskAdjustedProfit, margin: b.margin };
}
export const pounds = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
