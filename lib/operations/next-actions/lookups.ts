import type { InstallationStageKey, MemberRow, NextActionSnapshot, PlannedAllocationRow, Viewer, WorkAreaRow } from "./types";

export const STAGE_LABEL: Record<InstallationStageKey, string> = {
  preparation: "substrate preparation", waterproofing: "waterproofing", installation: "tile installation", grouting: "grouting",
  sealant: "sealant and movement joints", protection: "protection", remedial: "remedial work",
};

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
export const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
export const isoDate = (iso: string) => String(iso).slice(0, 10);

const by = <T>(rows: T[], key: (row: T) => string) => new Map(rows.map(row => [key(row), row] as const));

export function makeLookups(s: NextActionSnapshot) {
  const areas = by(s.work_areas, a => a.id), contracts = by(s.contracts, c => c.id), teams = by(s.teams, t => t.id);
  const members = by(s.members, m => m.user_id);
  const memberOf = (id: string | null | undefined): MemberRow | null => (id ? members.get(id) ?? null : null);
  const path = (id: string | null | undefined) => {
    const area = id ? areas.get(id) : undefined;
    if (!area) return id ? "Location not visible" : null;
    return area.path_ids.map(p => areas.get(p)?.name).filter(Boolean).join(" › ");
  };
  return {
    areas, contracts, teams, members, path,
    job: (id: string) => {
      const c = contracts.get(id);
      return c ? { id: c.id, reference: c.reference, name: c.name } : { id, reference: "", name: "Unknown job" };
    },
    person: (id: string | null | undefined) => memberOf(id)?.display_name ?? "Someone",
    supervisorOf: (contractId: string) => s.contract_assignments.filter(a => a.contract_id === contractId)
      .map(a => memberOf(a.user_id)).find(m => m?.role === "supervisor") ?? null,
    teamLead: (teamId: string | null | undefined) => {
      const lead = s.team_memberships.find(m => m.team_id === teamId && m.is_lead);
      return (lead && s.operatives.find(o => o.id === lead.operative_id)?.display_name) || null;
    },
    teamIdsOf: (userId: string) => {
      const ops = s.operatives.filter(o => o.user_id === userId && o.status === "active").map(o => o.id);
      return [...new Set(s.team_memberships.filter(m => ops.includes(m.operative_id)).map(m => m.team_id))];
    },
    covers: (plan: Pick<PlannedAllocationRow, "planned_start" | "planned_end">, day: string) => plan.planned_start <= day && plan.planned_end >= day,
    under: (areaId: string | null | undefined, ancestorId: string | null | undefined) => {
      const area: WorkAreaRow | undefined = areaId ? areas.get(areaId) : undefined;
      return !!area && !!ancestorId && area.path_ids.includes(ancestorId);
    },
  };
}
export type Lookups = ReturnType<typeof makeLookups>;

export const roleKey = (viewer: Pick<Viewer, "role">) =>
  viewer.role === "contracts_manager" ? "office" : viewer.role === "owner" ? "owner" : viewer.role === "supervisor" ? "supervisor" : "subcontractor";

/** Which contracts a person can see. Mirrors private.can_access_contract. The database remains the real authority. */
export function visibleContractIds(s: NextActionSnapshot, viewer: Viewer): string[] {
  if (viewer.role === "owner") return s.contracts.map(c => c.id);
  if (viewer.role === "contracts_manager" || viewer.role === "supervisor")
    return [...new Set(s.contract_assignments.filter(a => a.user_id === viewer.user_id).map(a => a.contract_id))];
  return [...new Set(s.package_assignments.filter(a => a.user_id === viewer.user_id).map(a => a.contract_id))];
}
