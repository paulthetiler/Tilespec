const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function savedAllocationIds(value: unknown, count: number): string[] | null {
  return Array.isArray(value) && value.length === count && value.every(uuid) && new Set(value).size === count ? value : null;
}
export type WorkforceGroup = { operative_ids: string[]; work_area_id?: string; stage?: string; lead_operative_id?: string; team_id?: string | null; work_package_id?: string | null; started_at?: string };
export type SavedAllocation = { id: string; contract_id: string; planned_allocation_id: string | null; previous_allocation_id: string | null; confirmed_by: string; work_date: string; work_area_id: string; stage: string; lead_operative_id: string | null; recorded_at: string; team_id: string | null; work_package_id: string | null; started_at: string };
export type SavedAttendance = { actual_allocation_id: string; operative_id: string; added_by: string; recorded_at: string };

// Results may arrive in a different order on an idempotent replay. Match each
// saved work period to its people and location, rather than trusting array order.
export function confirmsWorkforceGroups(ids: string[], allocations: SavedAllocation[], attendance: SavedAttendance[], expected: {
  contract: string; actor: string; day: string; groups: WorkforceGroup[]; plan?: string | null; previous?: string | null;
}) {
  if (!savedAllocationIds(ids, expected.groups.length) || allocations.length !== ids.length || new Set(allocations.map(row => row.id)).size !== ids.length) return false;
  const unmatched = [...expected.groups];
  for (const allocation of allocations) {
    if (!ids.includes(allocation.id) || allocation.contract_id !== expected.contract || allocation.confirmed_by !== expected.actor || allocation.work_date !== expected.day
      || (expected.plan !== undefined && allocation.planned_allocation_id !== expected.plan) || (expected.previous !== undefined && allocation.previous_allocation_id !== expected.previous)) return false;
    const allPeople = attendance.filter(row => row.actual_allocation_id === allocation.id);
    const recordedAt = Date.parse(allocation.recorded_at);
    if (!Number.isFinite(recordedAt) || new Set(allPeople.map(row => row.operative_id)).size !== allPeople.length
      || allPeople.some(row => !Number.isFinite(Date.parse(row.recorded_at)) || Date.parse(row.recorded_at) < recordedAt)) return false;
    // Original attendance and the work period share PostgreSQL's transaction
    // time. Later arrivals remain valid additions when replaying an older save.
    const people = allPeople.filter(row => Date.parse(row.recorded_at) === recordedAt);
    const match = unmatched.findIndex(group => people.length === group.operative_ids.length
      && people.every(row => group.operative_ids.includes(row.operative_id) && row.added_by === expected.actor)
      && (!group.work_area_id || allocation.work_area_id === group.work_area_id) && (!group.stage || allocation.stage === group.stage)
      && (!group.lead_operative_id || allocation.lead_operative_id === group.lead_operative_id)
      && (group.team_id === undefined || allocation.team_id === group.team_id) && (group.work_package_id === undefined || allocation.work_package_id === group.work_package_id)
      && (!group.started_at || Date.parse(allocation.started_at) === Date.parse(group.started_at)));
    if (match < 0) return false;
    unmatched.splice(match, 1);
  }
  return unmatched.length === 0;
}

export function confirmsWorkforceAbsence(saved: { id: string; contract_id: string; planned_allocation_id: string; work_date: string; recorded_by: string; reason: string; operative_id: string | null; voided_at: string | null } | null, result: unknown, expected: {
  contract: string; plan: string; day: string; actor: string; reason: string;
}) {
  return uuid(result) && saved?.id === result && saved.contract_id === expected.contract && saved.planned_allocation_id === expected.plan && saved.work_date === expected.day
    && saved.recorded_by === expected.actor && saved.reason === expected.reason && saved.operative_id === null && saved.voided_at === null;
}
