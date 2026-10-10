import type { Commercial, Contract } from "./types";

export function budgetSummary(commercial: Commercial) {
  const value = Number(commercial.contract_value);
  const cost = Number(commercial.labour_budget) + Number(commercial.materials_budget) + Number(commercial.preliminaries_budget);
  const reserve = Number(commercial.contingency);
  const riskAdjustedProfit = value - cost - reserve;
  return { value, originalCost: cost, reserve, riskAdjustedProfit, margin: value > 0 ? riskAdjustedProfit / value * 100 : null };
}
export function contractWarnings(c: Contract, areaCount: number, completedDocumentCount: number) {
  const warnings: string[] = ["Installation not released — acceptance gates are not yet available."];
  if (!c.start_date || !c.end_date) warnings.push("Programme dates incomplete.");
  if (!c.tile_specification || !c.installation_system || !c.movement_joints) warnings.push("Technical specification incomplete.");
  if (areaCount === 0) warnings.push("No work areas recorded.");
  if (completedDocumentCount === 0) warnings.push("No uploaded drawings or specification documents.");
  return warnings;
}
