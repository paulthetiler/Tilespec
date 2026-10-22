import type { WorkingTimes } from "./types";

/*
 * Reminder timing is derived from working hours. Nothing here is a fixed clock time.
 *
 * Each job already records its own free-text "working hours" (for example
 * "07:30 to 16:30"). The engine reads that. If a job has none, or the text cannot be
 * understood, it falls back to the company default working day below.
 *
 * Every offset is a plain number so the business can change it without touching a
 * rule. Changing any value changes reminders and visibility only. It never affects
 * a gate.
 */
export interface NextActionConfig {
  defaultWorkingDay: { start: string; end: string };
  /** The office is shown "morning checks not done" this long after the working day starts. */
  morningChecksOfficeSeesAfterStartMinutes: number;
  /** The supervisor is reminded to send the handover this long before the working day ends. */
  handoverReminderBeforeEndMinutes: number;
  /** The office is shown "handover not sent" this long after the working day ends. */
  handoverOfficeSeesAfterEndMinutes: number;
  insuranceWarningDays: number;
  planHorizonDays: number;
  jobSetupLeadDays: number;
  overdueEscalatesToOwnerAfterDays: number;
  /** Inspection results with problems and handovers with notes stay highlighted for the office this many days. */
  siteUpdateDays: number;
}

export const DEFAULT_CONFIG: NextActionConfig = {
  defaultWorkingDay: { start: "07:30", end: "16:30" },
  morningChecksOfficeSeesAfterStartMinutes: 150,
  handoverReminderBeforeEndMinutes: 90,
  handoverOfficeSeesAfterEndMinutes: 60,
  insuranceWarningDays: 30,
  planHorizonDays: 7,
  jobSetupLeadDays: 21,
  overdueEscalatesToOwnerAfterDays: 3,
  siteUpdateDays: 7,
};

const MINUTES_IN_DAY = 24 * 60;
const pad = (n: number) => String(n).padStart(2, "0");
export const toMinutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};
export const toClock = (minutes: number) => {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(minutes)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
};

function clockFrom(hours: string, minutes: string | undefined, meridiem: string | undefined): number | null {
  let h = Number(hours);
  const m = minutes === undefined ? 0 : Number(minutes);
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  }
  if (!Number.isInteger(h) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Reads "07:30 to 16:30", "7.30am - 4.30pm", "0730-1630". Returns null if it is not clearly a start and an end. */
export function parseWorkingHours(text: string | null | undefined): { start: string; end: string } | null {
  if (!text) return null;
  const time = String.raw`(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?`;
  const match = text.match(new RegExp(`${time}\\s*(?:to|until|till|-|–|—)\\s*${time}`, "i"));
  if (!match) return null;
  const start = clockFrom(match[1], match[2], match[3]);
  const end = clockFrom(match[4], match[5], match[6]);
  if (start === null || end === null || end <= start) return null;
  return { start: toClock(start), end: toClock(end) };
}

/** The working day and the three reminder times for one job. Pure and deterministic. */
export function resolveTimings(config: NextActionConfig, workingHoursText?: string | null): WorkingTimes {
  const parsed = parseWorkingHours(workingHoursText);
  const day = parsed ?? config.defaultWorkingDay;
  const start = toMinutes(day.start), end = toMinutes(day.end);
  return {
    start: day.start, end: day.end, source: parsed ? "contract" : "default",
    morningChecksOfficeSeesAt: toClock(start + config.morningChecksOfficeSeesAfterStartMinutes),
    handoverReminderAt: toClock(Math.max(start, end - config.handoverReminderBeforeEndMinutes)),
    handoverOfficeSeesAt: toClock(end + config.handoverOfficeSeesAfterEndMinutes),
  };
}

const validClock = (value: string | undefined) => (value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null);
const wholeNumber = (value: string | undefined, min: number, max: number) => {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Optional overrides from the environment. A bad value is ignored, never thrown, so a typo
 * cannot take the supervisor's page down. Defaults are used instead.
 */
export function configFromEnv(env: Record<string, string | undefined> = {}): NextActionConfig {
  const start = validClock(env.NEXT_ACTIONS_WORKDAY_START), end = validClock(env.NEXT_ACTIONS_WORKDAY_END);
  const day = start && end && toMinutes(end) > toMinutes(start) ? { start, end } : DEFAULT_CONFIG.defaultWorkingDay;
  return {
    defaultWorkingDay: day,
    morningChecksOfficeSeesAfterStartMinutes: wholeNumber(env.NEXT_ACTIONS_MORNING_OFFICE_AFTER_START_MIN, 0, 720) ?? DEFAULT_CONFIG.morningChecksOfficeSeesAfterStartMinutes,
    handoverReminderBeforeEndMinutes: wholeNumber(env.NEXT_ACTIONS_HANDOVER_REMINDER_BEFORE_END_MIN, 0, 720) ?? DEFAULT_CONFIG.handoverReminderBeforeEndMinutes,
    handoverOfficeSeesAfterEndMinutes: wholeNumber(env.NEXT_ACTIONS_HANDOVER_OFFICE_AFTER_END_MIN, 0, 720) ?? DEFAULT_CONFIG.handoverOfficeSeesAfterEndMinutes,
    insuranceWarningDays: wholeNumber(env.NEXT_ACTIONS_INSURANCE_WARNING_DAYS, 1, 365) ?? DEFAULT_CONFIG.insuranceWarningDays,
    planHorizonDays: wholeNumber(env.NEXT_ACTIONS_PLAN_HORIZON_DAYS, 1, 60) ?? DEFAULT_CONFIG.planHorizonDays,
    jobSetupLeadDays: wholeNumber(env.NEXT_ACTIONS_JOB_SETUP_LEAD_DAYS, 1, 180) ?? DEFAULT_CONFIG.jobSetupLeadDays,
    overdueEscalatesToOwnerAfterDays: wholeNumber(env.NEXT_ACTIONS_OVERDUE_ESCALATES_AFTER_DAYS, 0, 60) ?? DEFAULT_CONFIG.overdueEscalatesToOwnerAfterDays,
    siteUpdateDays: wholeNumber(env.NEXT_ACTIONS_SITE_UPDATE_DAYS, 1, 30) ?? DEFAULT_CONFIG.siteUpdateDays,
  };
}
