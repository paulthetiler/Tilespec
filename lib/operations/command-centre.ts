/*
 * The office command centre: pure calculations over records the loader has already read with the
 * signed-in person's own session. Nothing here reads, writes or decides permissions; money values
 * reach these functions only for someone with money access.
 */
import { addDays, dayDiff } from "./next-actions/lookups";

export const STAGES = ["tender", "won", "mobilising", "live", "on_hold", "practical_completion", "defects", "final_account", "closed", "lost"] as const;
export type Stage = typeof STAGES[number];
export const stageLabels: Record<Stage, string> = {
  tender: "Tender", won: "Won, not started", mobilising: "Mobilising", live: "Live", on_hold: "On hold", practical_completion: "Practical completion",
  defects: "Defects period", final_account: "Final account", closed: "Closed", lost: "Lost",
};
/** Jobs the office is running now: shown in Live jobs, Yesterday on site and the morning summary. */
export const ACTIVE_STAGES: readonly Stage[] = ["mobilising", "live", "on_hold", "practical_completion", "defects"];

/** The confirmed stage, or until the office confirms one, the stage the programme dates indicate (as private.job_stage). */
export function jobStage(stored: string | null | undefined, start: string | null, end: string | null, today: string): { stage: Stage; confirmed: boolean } {
  if (stored && (STAGES as readonly string[]).includes(stored)) return { stage: stored as Stage, confirmed: true };
  const stage: Stage = end && end < today ? "practical_completion" : start && start <= today ? "live" : "won";
  return { stage, confirmed: false };
}

export type PackageProgress = { id: string; name: string; unit: string; quantity: number; done: number };
/** Work done against each package's quantity, capped at 100% per package, weighted by package share. */
export function progressPercent(packages: PackageProgress[]): number | null {
  const measured = packages.filter(p => p.quantity > 0);
  if (!measured.length) return null;
  const share = measured.reduce((sum, p) => sum + Math.min(1, p.done / p.quantity), 0) / measured.length;
  return Math.round(share * 100);
}
/** How far through the programme the job is, by calendar days. */
export function programmePercent(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end || end < start) return null;
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(dayDiff(today, start) / Math.max(1, dayDiff(end, start)) * 100);
}
export type ProgrammeStatus = "not_started" | "on_track" | "behind" | "overrun" | "complete" | "unknown";
export function programmeStatus(input: { start: string | null; end: string | null; today: string; progress: number | null; stage: Stage }): ProgrammeStatus {
  if (["practical_completion", "defects", "final_account", "closed"].includes(input.stage)) return "complete";
  if (!input.start || !input.end) return "unknown";
  if (input.today < input.start) return "not_started";
  if (input.today > input.end) return "overrun";
  const elapsed = programmePercent(input.start, input.end, input.today) ?? 0;
  if (input.progress === null) return "unknown";
  return input.progress + 10 < elapsed ? "behind" : "on_track";
}
export const programmeLabels: Record<ProgrammeStatus, string> = {
  not_started: "Not started", on_track: "On programme", behind: "Behind programme", overrun: "Past finish date", complete: "Complete", unknown: "Progress not measured",
};

export type DebtLine = { contract_id: string; application_id: string; number: number; display_status: string; final_on: string | null; outstanding: number; days_overdue: number };
export type Ageing = { current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_over_90: number; total: number; overdue: number };
/** The same buckets as the statement's ageing (days past the final date for payment). */
export function ageing(lines: DebtLine[]): Ageing {
  const result: Ageing = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0, overdue: 0 };
  for (const line of lines) {
    const d = line.days_overdue, amount = Number(line.outstanding) || 0;
    if (d <= 0) result.current += amount; else if (d <= 30) result.days_1_30 += amount; else if (d <= 60) result.days_31_60 += amount;
    else if (d <= 90) result.days_61_90 += amount; else result.days_over_90 += amount;
    result.total += amount;
    if (d > 0) result.overdue += amount;
  }
  for (const key of Object.keys(result) as (keyof Ageing)[]) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

export type CashLine = { direction: "in" | "out"; expected_on: string; amount: number; certainty: string; source: string; reference: string; contract_id: string; record_id: string };
export type CashWeek = { start: string; end: string; in: number; out: number; net: number; running: number; overdueIn: number };
/** Expected receipts and payments by week, Monday to Sunday, from the current week. Overdue receipts are counted in the current week and shown separately. */
export function cashWeeks(lines: CashLine[], today: string, weeks = 8): CashWeek[] {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const result: CashWeek[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(monday, i * 7), end: addDays(monday, i * 7 + 6), in: 0, out: 0, net: 0, running: 0, overdueIn: 0 }));
  for (const line of lines) {
    const on = line.expected_on < monday ? monday : line.expected_on;
    const week = result.find(w => on >= w.start && on <= w.end);
    if (!week) continue;
    const amount = Number(line.amount) || 0;
    if (line.direction === "in") { week.in += amount; if (line.certainty === "overdue") week.overdueIn += amount; } else week.out += amount;
  }
  let running = 0;
  for (const week of result) {
    week.in = Math.round(week.in * 100) / 100; week.out = Math.round(week.out * 100) / 100;
    week.net = Math.round((week.in - week.out) * 100) / 100; running = Math.round((running + week.net) * 100) / 100; week.running = running;
  }
  return result;
}

export type PlanRow = { id: string; contract_id: string; team_id: string; planned_start: string; planned_end: string };
export type GangDay = { team_id: string; date: string; contracts: string[] };
/** Working days (Monday to Friday) from today for the given number of calendar days. */
export function workingDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i)).filter(day => { const d = new Date(`${day}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; });
}
/** Each gang's planned jobs on each working day: idle days and double bookings are visible at a glance. */
export function gangCalendar(plans: PlanRow[], teamIds: string[], days: string[]): GangDay[] {
  return teamIds.flatMap(team => days.map(date => ({ team_id: team, date,
    contracts: [...new Set(plans.filter(p => p.team_id === team && p.planned_start <= date && p.planned_end >= date).map(p => p.contract_id))] })));
}
export function staffingGaps(input: { plans: PlanRow[]; activeJobs: { id: string; start: string | null; end: string | null }[]; teamIds: string[]; days: string[] }) {
  const calendar = gangCalendar(input.plans, input.teamIds, input.days);
  const doubleBooked = calendar.filter(day => day.contracts.length > 1);
  const idle = input.teamIds.map(team => ({ team_id: team, days: calendar.filter(day => day.team_id === team && day.contracts.length === 0).map(day => day.date) }))
    .filter(row => row.days.length > 0);
  const unplannedJobs = input.activeJobs.filter(job => input.days.some(day => (!job.start || job.start <= day) && (!job.end || job.end >= day))
    && !input.plans.some(p => p.contract_id === job.id)).map(job => job.id);
  return { calendar, doubleBooked, idle, unplannedJobs };
}

export type OnboardingInput = {
  team_id: string; name: string; active: boolean; company_id: string | null;
  tax_profile: { cis_status: string } | null; bank: boolean; agreement: "none" | "issued" | "signed";
  live_link: boolean; insurance_ok: boolean | null; on_jobs: number; rates: number;
};
export type OnboardingStep = { key: string; label: string; done: boolean };
/** Every step a gang needs before it can be paid through the portal, in the order the office does them. */
export function onboardingSteps(g: OnboardingInput): OnboardingStep[] {
  return [
    { key: "company", label: "Company and insurance recorded", done: !!g.company_id && g.insurance_ok === true },
    { key: "tax", label: "Business, tax and CIS details", done: !!g.tax_profile },
    { key: "cis", label: "CIS verified with HMRC", done: !!g.tax_profile && g.tax_profile.cis_status !== "unverified" },
    { key: "bank", label: "Bank details", done: g.bank },
    { key: "agreement", label: "Subcontract agreement signed", done: g.agreement === "signed" },
    { key: "link", label: "Portal link issued", done: g.live_link },
    { key: "work", label: "Added to a job with agreed rates", done: g.on_jobs > 0 && g.rates > 0 },
  ];
}

export type Metric = { key: string; label: string; value: string; detail: string; href: string; tone: "alert" | "warning" | "ok" | "neutral" };
export const money = (value: number | null | undefined) => value === null || value === undefined ? "—"
  : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
