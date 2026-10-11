// Existing draft estimator calculations, extracted without changing pricing.
// This is not an approved tender, actual cost ledger or cash-flow forecast.
export type EstimateArea = { id: number; description: string; sqm: number; sell: number; sub: number; output: number; daysExtra: number; materials: number; mode: "metre" | "day"; gangDay: number };
export type MaterialSettings = {
  adhesiveBagPrice: number; adhesiveCoverage: number;
  backButterKgPerSqm: number; adhesiveBagKg: number;
  groutPackPrice: number; groutPackKg: number; groutDensity: number; groutWaste: number;
};
export type CostArea = EstimateArea & { lengthMm?: number; widthMm?: number; depthMm?: number; jointMm?: number; backButter?: boolean };
export type SupervisorSettings = { mode: "visiting" | "full-time" | "manual"; days?: number; dayRate: number; expenses: number };
export function groutKgPerSqm(length: number, width: number, depth: number, joint: number, density: number) {
  if ([length,width,depth,joint,density].some(n => !Number.isFinite(n) || n <= 0)) return 0;
  return ((length + width) / (length * width)) * depth * joint * density;
}
export function supervisorDays(projectDays: number) {
  if (projectDays <= 0) return 0;
  if (projectDays <= 2) return 0.5;
  if (projectDays <= 5) return 1;
  if (projectDays <= 10) return 2;
  if (projectDays <= 15) return 3;
  if (projectDays <= 20) return 4;
  return Math.ceil(projectDays / 5);
}
export function calculateEstimate(areas: CostArea[], other: number, contingency: number, target: number, settings?: MaterialSettings, supervisor?: SupervisorSettings) {
  const lines = areas.map(a => {
    const days = a.sqm > 0 ? Math.ceil(a.sqm / Math.max(1, a.output)) + a.daysExtra : 0;
    const revenue = a.sqm * a.sell;
    const labour = a.mode === "metre" ? a.sqm * a.sub : days * a.gangDay;
    const material = a.sqm * a.materials;
    const adhesiveKg = settings ? (a.sqm / Math.max(0.01, settings.adhesiveCoverage)) * settings.adhesiveBagKg + (a.backButter ? a.sqm * settings.backButterKgPerSqm : 0) : 0;
    const adhesiveBags = settings ? Math.ceil(adhesiveKg / Math.max(0.01, settings.adhesiveBagKg)) : 0;
    const groutKg = settings ? a.sqm * groutKgPerSqm(a.lengthMm ?? 0, a.widthMm ?? 0, a.depthMm ?? 0, a.jointMm ?? 0, settings.groutDensity) * (1 + settings.groutWaste / 100) : 0;
    const groutPacks = settings ? Math.ceil(groutKg / Math.max(0.01, settings.groutPackKg)) : 0;
    const itemMaterials = material + adhesiveBags * (settings?.adhesiveBagPrice ?? 0) + groutPacks * (settings?.groutPackPrice ?? 0);
    return { ...a, days, revenue, labour, material: itemMaterials, adhesiveBags, groutPacks, groutKg };
  });
  const revenue = lines.reduce((v, a) => v + a.revenue, 0);
  const labour = lines.reduce((v, a) => v + a.labour, 0);
  const materials = lines.reduce((v, a) => v + a.material, 0);
  const projectDays = lines.reduce((sum, a) => sum + a.days, 0);
  const supervisorAttendance = supervisor ? supervisor.mode === "full-time" ? projectDays : supervisor.mode === "manual" ? Math.max(0, supervisor.days ?? 0) : supervisorDays(projectDays) : 0;
  const supervisorCost = supervisor ? supervisorAttendance * supervisor.dayRate + supervisor.expenses : 0;
  const reserve = revenue * contingency / 100;
  const costs = labour + materials + other + supervisorCost + reserve;
  const profit = revenue - costs;
  const margin = revenue > 0 ? 100 * profit / revenue : 0;
  const breakEven = contingency < 100 ? (labour + materials + other + supervisorCost) / (1 - contingency / 100) : Infinity;
  const required = target + contingency < 100 ? (labour + materials + other + supervisorCost) / (1 - (target + contingency) / 100) : Infinity;
  return { lines, revenue, labour, materials, reserve, costs, profit, margin, breakEven, required, projectDays, supervisorAttendance, supervisorCost };
}
