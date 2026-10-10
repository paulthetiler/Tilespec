// Existing draft estimator calculations, extracted without changing pricing.
// This is not an approved tender, actual cost ledger or cash-flow forecast.
export type EstimateArea = { id: number; description: string; sqm: number; sell: number; sub: number; output: number; daysExtra: number; materials: number; mode: "metre" | "day"; gangDay: number };
export function calculateEstimate(areas: EstimateArea[], other: number, contingency: number, target: number) {
  const lines = areas.map(a => {
    const days = a.sqm > 0 ? Math.ceil(a.sqm / Math.max(1, a.output)) + a.daysExtra : 0;
    const revenue = a.sqm * a.sell;
    const labour = a.mode === "metre" ? a.sqm * a.sub : days * a.gangDay;
    const material = a.sqm * a.materials;
    return { ...a, days, revenue, labour, material };
  });
  const revenue = lines.reduce((v, a) => v + a.revenue, 0);
  const labour = lines.reduce((v, a) => v + a.labour, 0);
  const materials = lines.reduce((v, a) => v + a.material, 0);
  const reserve = revenue * contingency / 100;
  const costs = labour + materials + other + reserve;
  const profit = revenue - costs;
  const margin = revenue > 0 ? 100 * profit / revenue : 0;
  const breakEven = contingency < 100 ? (labour + materials + other) / (1 - contingency / 100) : Infinity;
  const required = target + contingency < 100 ? (labour + materials + other) / (1 - (target + contingency) / 100) : Infinity;
  return { lines, revenue, labour, materials, reserve, costs, profit, margin, breakEven, required };
}
