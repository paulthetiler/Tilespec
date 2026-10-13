import type { PlannedAllocation, TeamMembership } from "./types";

// Calendar dates are plain YYYY-MM-DD strings in UK local time throughout, so
// a plan made for "Monday" never drifts across midnight UTC.
export function londonDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
// Monday of the week containing the date.
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}
export function dayLabel(date: string, style: "short" | "long" = "short"): string {
  return new Intl.DateTimeFormat("en-GB", style === "short"
    ? { weekday: "short", day: "numeric", timeZone: "UTC" }
    : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export type PlanStatus = "active" | "revised" | "cancelled";
export function planStatus(plan: Pick<PlannedAllocation, "superseded_by" | "cancelled_at">): PlanStatus {
  return plan.cancelled_at ? "cancelled" : plan.superseded_by ? "revised" : "active";
}
export function planCoversDay(plan: Pick<PlannedAllocation, "planned_start" | "planned_end">, day: string): boolean {
  return plan.planned_start <= day && day <= plan.planned_end;
}
export function planOverlaps(plan: Pick<PlannedAllocation, "planned_start" | "planned_end">, from: string, to: string): boolean {
  return plan.planned_start <= to && plan.planned_end >= from;
}

// Membership in force on a day: not voided, started, and not yet ended.
export function membershipOnDay(membership: Pick<TeamMembership, "valid_from" | "valid_until" | "voided_at">, day: string): boolean {
  return !membership.voided_at && membership.valid_from <= day && (membership.valid_until === null || membership.valid_until >= day);
}
