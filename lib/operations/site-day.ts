import { indexLocations, locationPath, type LocationIndex } from "./locations";
import { londonClock, membershipOnDay, planCoversDay, planStatus } from "./planning";
import {
  installationStageLabels, type Absence, type ActualAllocation, type Attendance, type Company, type Location, type Operative,
  type PlannedAllocation, type PlannedOperative, type Team, type TeamMembership,
} from "./types";

// Everything recorded for one site on one day. The supervisor's screens, the
// dashboard and the office's planned-versus-actual view are all built from
// these saved records, never from what a screen remembers.
export type DayRecords = {
  day: string; now: string;
  locations: Location[]; plans: PlannedAllocation[]; plannedOperatives: PlannedOperative[];
  actuals: ActualAllocation[]; attendance: Attendance[]; absences: Absence[];
  teams: Team[]; operatives: Operative[]; memberships: TeamMembership[]; companies: Company[];
};
export type PeriodPerson = Attendance & { name: string; provisional: boolean };
export type Period = {
  allocation: ActualAllocation; location: string; open: boolean; people: PeriodPerson[]; presentNow: string[];
  lead: string | null; team: Team | undefined; company: Company | undefined;
};
export type PersonStatus = "here" | "left" | "absent" | "not_recorded" | "awaiting";
export type PersonOnPlan = { id: string; name: string; status: PersonStatus; detail: string; planned: boolean; provisional: boolean; inactive: boolean };
export type CardStatus = "unconfirmed" | "on_site" | "finished" | "not_on_site";
export type ExceptionKind = "unconfirmed" | "team_absent" | "operative_absent" | "operative_missing" | "additional_operative"
  | "moved" | "split" | "stage_changed" | "unplanned" | "provisional" | "late_arrival" | "left_early";
export type DayException = { kind: ExceptionKind; team: string; text: string; reason: string | null; at: string | null };
export type TeamCard = {
  plan: PlannedAllocation; team: Team | undefined; company: Company | undefined; location: string; plannedLead: string | null;
  expected: string[]; named: boolean; status: CardStatus; periods: Period[]; teamAbsence: Absence | null;
  people: PersonOnPlan[]; exceptions: DayException[];
};
export type SiteDay = {
  day: string; cards: TeamCard[]; unplanned: Period[]; exceptions: DayException[];
  summary: { plannedTeams: number; confirmedTeams: number; unconfirmed: number; notOnSite: number; presentNow: number; activeLocations: number; openPeriods: number };
};

export const exceptionLabels: Record<ExceptionKind, string> = {
  unconfirmed: "Not confirmed", team_absent: "Team not on site", operative_absent: "Absent", operative_missing: "Missing",
  additional_operative: "Additional operative", moved: "Moved", split: "Split", stage_changed: "Stage changed",
  unplanned: "Supervisor-added", provisional: "Provisional", late_arrival: "Late arrival", left_early: "Left early",
};
const time = (iso: string) => Date.parse(iso);

export function periodFor(allocation: ActualAllocation, records: Pick<DayRecords, "attendance" | "operatives" | "teams" | "companies" | "now">, index: LocationIndex): Period {
  const byId = new Map(records.operatives.map(person => [person.id, person]));
  const people = records.attendance.filter(row => row.actual_allocation_id === allocation.id)
    .sort((a, b) => time(a.joined_at) - time(b.joined_at) || (byId.get(a.operative_id)?.display_name ?? "").localeCompare(byId.get(b.operative_id)?.display_name ?? "", "en-GB"))
    .map(row => ({ ...row, name: byId.get(row.operative_id)?.display_name ?? "Unknown operative", provisional: byId.get(row.operative_id)?.status === "provisional" }));
  const open = allocation.ended_at === null && allocation.voided_at === null;
  const team = records.teams.find(item => item.id === allocation.team_id);
  return {
    allocation, location: locationPath(index, allocation.work_area_id) || "Location not visible", open, people,
    presentNow: open ? people.filter(row => row.left_at === null && time(row.joined_at) <= time(records.now)).map(row => row.operative_id) : [],
    lead: allocation.lead_operative_id ? byId.get(allocation.lead_operative_id)?.display_name ?? null : null,
    team, company: records.companies.find(item => item.id === team?.company_id),
  };
}

// Exceptions any period can carry: arrivals after the start, departures before
// the end, and people the office has not yet confirmed.
function periodExceptions(period: Period, team: string): DayException[] {
  const found: DayException[] = [];
  for (const person of period.people) {
    if (time(person.joined_at) > time(period.allocation.started_at)) {
      found.push({ kind: "late_arrival", team, text: `${person.name} joined at ${londonClock(person.joined_at)}`, reason: person.note, at: person.joined_at });
    }
    if (person.left_at) found.push({ kind: "left_early", team, text: `${person.name} left at ${londonClock(person.left_at)}`, reason: person.departure_note, at: person.left_at });
    if (person.provisional) found.push({ kind: "provisional", team, text: `${person.name} was added on site and is not yet confirmed by the office`, reason: null, at: person.joined_at });
  }
  return found;
}

export function buildSiteDay(records: DayRecords): SiteDay {
  const index = indexLocations(records.locations);
  const byId = new Map(records.operatives.map(person => [person.id, person]));
  const name = (id: string) => byId.get(id)?.display_name ?? "Unknown operative";
  const live = records.actuals.filter(item => !item.voided_at && item.work_date === records.day);
  const absences = records.absences.filter(item => !item.voided_at && item.work_date === records.day);
  const plans = records.plans.filter(plan => planStatus(plan) === "active" && planCoversDay(plan, records.day));

  const cards = plans.map((plan): TeamCard => {
    const team = records.teams.find(item => item.id === plan.team_id);
    const teamName = team?.name ?? "Team";
    const company = records.companies.find(item => item.id === team?.company_id);
    const memberships = records.memberships.filter(item => item.team_id === plan.team_id && membershipOnDay(item, records.day));
    const namedIds = records.plannedOperatives.filter(item => item.planned_allocation_id === plan.id).map(item => item.operative_id);
    const expected = namedIds.length ? namedIds : memberships.map(item => item.operative_id).filter(id => byId.get(id)?.status !== "inactive");
    const lead = memberships.find(item => item.is_lead)?.operative_id ?? null;
    const periods = live.filter(item => item.planned_allocation_id === plan.id)
      .sort((a, b) => time(a.started_at) - time(b.started_at)).map(item => periodFor(item, records, index));
    const teamAbsence = absences.find(item => item.planned_allocation_id === plan.id && item.operative_id === null) ?? null;
    const status: CardStatus = periods.length === 0 ? (teamAbsence ? "not_on_site" : "unconfirmed") : periods.some(period => period.open) ? "on_site" : "finished";
    const attended = new Set(periods.flatMap(period => period.people.map(person => person.operative_id)));
    const people = [...new Set([...expected, ...attended])].map((id): PersonOnPlan => {
      const rows = periods.flatMap(period => period.people.filter(person => person.operative_id === id).map(person => ({ period, person })));
      const current = rows.find(row => row.period.open && row.person.left_at === null);
      const absence = absences.find(item => item.planned_allocation_id === plan.id && item.operative_id === id);
      const last = rows[rows.length - 1];
      const [personStatus, detail]: [PersonStatus, string] = current ? ["here", `${current.period.location} since ${londonClock(current.person.joined_at)}`]
        : last ? ["left", last.person.left_at ? `Left at ${londonClock(last.person.left_at)}` : `Finished at ${londonClock(last.period.allocation.ended_at ?? records.now)}`]
        : absence ? ["absent", absence.reason]
        : status === "on_site" || status === "finished" ? ["not_recorded", "Not recorded on site"] : ["awaiting", "Not confirmed yet"];
      const person = byId.get(id);
      return { id, name: name(id), status: personStatus, detail, planned: expected.includes(id), provisional: person?.status === "provisional", inactive: person?.status === "inactive" };
    }).sort((a, b) => Number(b.id === lead) - Number(a.id === lead) || a.name.localeCompare(b.name, "en-GB"));

    const exceptions: DayException[] = [];
    if (status === "unconfirmed") exceptions.push({ kind: "unconfirmed", team: teamName, text: `${teamName} is not confirmed yet`, reason: null, at: null });
    if (teamAbsence) exceptions.push({ kind: "team_absent", team: teamName, text: `${teamName} not on site`, reason: teamAbsence.reason, at: teamAbsence.recorded_at });
    for (const absence of absences.filter(item => item.planned_allocation_id === plan.id && item.operative_id)) {
      exceptions.push({ kind: "operative_absent", team: teamName, text: `${name(absence.operative_id!)} absent`, reason: absence.reason, at: absence.recorded_at });
    }
    for (const person of people.filter(item => item.status === "not_recorded" && item.planned)) {
      exceptions.push({ kind: "operative_missing", team: teamName, text: `${person.name} was planned but is not recorded on site`, reason: null, at: null });
    }
    for (const id of attended) {
      if (expected.includes(id)) continue;
      const first = periods.flatMap(period => period.people).find(person => person.operative_id === id)!;
      exceptions.push({ kind: "additional_operative", team: teamName, text: `${name(id)} worked with ${teamName} but was not planned`, reason: first.note, at: first.joined_at });
    }
    for (const period of periods) {
      const target = index.get(period.allocation.work_area_id);
      if (target && !target.path_ids.includes(plan.work_area_id)) {
        exceptions.push({ kind: "moved", team: teamName, text: `Worked at ${period.location} instead of ${locationPath(index, plan.work_area_id)}`,
          reason: period.allocation.deviation_reason, at: period.allocation.started_at });
      }
      if (period.allocation.stage !== plan.stage) {
        exceptions.push({ kind: "stage_changed", team: teamName, text: `${installationStageLabels[period.allocation.stage]} instead of ${installationStageLabels[plan.stage]} at ${period.location}`,
          reason: period.allocation.deviation_reason, at: period.allocation.started_at });
      }
      exceptions.push(...periodExceptions(period, teamName));
    }
    const overlapping = periods.filter(period => periods.some(other => other !== period && overlaps(period.allocation, other.allocation, records.now)));
    if (overlapping.length > 1) {
      exceptions.push({ kind: "split", team: teamName, text: `Split between ${[...new Set(overlapping.map(period => period.location))].join(" and ")}`,
        reason: overlapping[0].allocation.deviation_reason, at: overlapping[0].allocation.started_at });
    }
    return { plan, team, company, location: locationPath(index, plan.work_area_id) || "Location not visible", plannedLead: lead, expected,
      named: namedIds.length > 0, status, periods, teamAbsence, people, exceptions };
  });

  const order: Record<CardStatus, number> = { unconfirmed: 0, on_site: 1, not_on_site: 2, finished: 3 };
  cards.sort((a, b) => order[a.status] - order[b.status] || (a.team?.name ?? "").localeCompare(b.team?.name ?? "", "en-GB"));
  const unplanned = live.filter(item => item.planned_allocation_id === null).sort((a, b) => time(a.started_at) - time(b.started_at))
    .map(item => periodFor(item, records, index));
  const unplannedExceptions = unplanned.flatMap(period => {
    const label = period.team?.name ?? period.people.map(person => person.name).join(", ");
    return [{ kind: "unplanned" as const, team: label, text: `${label} at ${period.location}, not on the plan`, reason: period.allocation.deviation_reason, at: period.allocation.started_at },
      ...periodExceptions(period, label)];
  });
  const open = [...cards.flatMap(card => card.periods), ...unplanned].filter(period => period.open);
  return {
    day: records.day, cards, unplanned, exceptions: [...cards.flatMap(card => card.exceptions), ...unplannedExceptions],
    summary: {
      plannedTeams: cards.length, confirmedTeams: cards.filter(card => card.status === "on_site" || card.status === "finished").length,
      unconfirmed: cards.filter(card => card.status === "unconfirmed").length, notOnSite: cards.filter(card => card.status === "not_on_site").length,
      presentNow: new Set(open.flatMap(period => period.presentNow)).size, activeLocations: new Set(open.map(period => period.allocation.work_area_id)).size,
      openPeriods: open.length,
    },
  };
}
function overlaps(a: ActualAllocation, b: ActualAllocation, now: string) {
  return time(a.started_at) < time(b.ended_at ?? now) && time(b.started_at) < time(a.ended_at ?? now);
}

export type NextActionKey = "checks" | "earlier" | "confirm" | "review" | "issues" | "monitor" | "critical" | "reinspection" | "disputed" | "overdue" | "safety" | "quality" | "release" | "inspection";
export type NextAction = { key: NextActionKey; label: string; detail: string; href: string };
/**
 * @deprecated The shared Next Action engine in lib/operations/next-actions is the single
 * source of truth. This remains only for the supervisor page while FEATURE_NEXT_ACTIONS is off.
 */
export function nextAction(input: { siteHref: string; issuesHref: string; checksDone: boolean; staleOpen: number; openIssues: number; day: SiteDay; snags?: { critical: number; awaiting_reinspection: number; disputed: number; overdue: number }; holds?: { href: string; active_safety: number; active_quality: number; awaiting_release: number; inspections_due: number; failed_mandatory: number } }): NextAction {
  const { summary } = input.day;
  const filtered = (filter: string) => `${input.issuesHref}${input.issuesHref.includes("?") ? "&" : "?"}${filter}`;
  const holdFilter = (filter: string) => `${input.holds!.href}${input.holds!.href.includes("?") ? "&" : "?"}${filter}`;
  if (input.holds?.active_safety) return { key: "safety", label: "Review safety stops", detail: `${input.holds.active_safety} saved safety stops affect the work shown in their scope. Follow the principal contractor's site-safety controls.`, href: holdFilter("hold_type=safety") };
  if (input.holds?.awaiting_release) return { key: "release", label: "Review release requests", detail: `${input.holds.awaiting_release} corrections await an independently authorised office decision. A request does not release work.`, href: holdFilter("status=awaiting_release") };
  if (input.holds?.active_quality) return { key: "quality", label: "Review quality holds", detail: `${input.holds.active_quality} saved quality holds restrict their specified location and activity.`, href: holdFilter("hold_type=quality") };
  if (input.holds?.failed_mandatory) return { key: "inspection", label: "Review failed mandatory inspections", detail: `${input.holds.failed_mandatory} mandatory inspection requirements have a failed saved result. Affected work remains blocked.`, href: `${input.siteHref}/inspections` };
  if (input.snags?.critical) return { key: "critical", label: "Review critical defects", detail: `${input.snags.critical} critical findings require immediate office review. Critical escalation does not grant a stop-work hold. Raise a scoped hold explicitly where affected work must stop.`, href: filtered("severity=critical") };
  if (input.snags?.awaiting_reinspection) return { key: "reinspection", label: "Reinspect repairs", detail: `${input.snags.awaiting_reinspection} repairs await independent reinspection. Submission is not acceptance.`, href: filtered("awaiting_reinspection=true") };
  if (input.snags?.disputed) return { key: "disputed", label: "Review disputed responsibility", detail: `${input.snags.disputed} responsibility decisions require office review.`, href: filtered("disputed=true") };
  if (input.snags?.overdue) return { key: "overdue", label: "Review overdue rectification", detail: `${input.snags.overdue} repairs have passed their target date.`, href: filtered("overdue=true") };
  if (!input.checksDone) return { key: "checks", label: "Start morning checks", detail: "No morning readiness check has been recorded for this site today.", href: `${input.siteHref}/checks` };
  if (input.staleOpen > 0) {
    return { key: "earlier", label: "Finish earlier work", detail: `${input.staleOpen} ${input.staleOpen === 1 ? "period of work from an earlier day was" : "periods of work from earlier days were"} never finished. Finish them before confirming today.`,
      href: `${input.siteHref}/workforce#earlier-work` };
  }
  if (summary.unconfirmed > 0) {
    const started = summary.confirmedTeams + summary.notOnSite > 0;
    return started
      ? { key: "review", label: "Review unconfirmed teams", detail: `${summary.unconfirmed} of ${summary.plannedTeams} planned ${summary.plannedTeams === 1 ? "team is" : "teams are"} not confirmed yet.`, href: `${input.siteHref}/workforce` }
      : { key: "confirm", label: "Confirm today's allocations", detail: `${summary.plannedTeams} ${summary.plannedTeams === 1 ? "team is" : "teams are"} planned for today. Confirm who is here and where.`, href: `${input.siteHref}/workforce` };
  }
  if (input.openIssues > 0) {
    return { key: "issues", label: "Review outstanding issues", detail: `${input.openIssues} ${input.openIssues === 1 ? "issue is" : "issues are"} open on this site.`, href: input.issuesHref };
  }
  if (input.holds?.inspections_due) return { key: "inspection", label: "Inspect location", detail: `${input.holds.inspections_due} applicable mandatory inspections are outstanding. Inspect against the approved contract requirements.`, href: `${input.siteHref}/inspections` };
  return { key: "monitor", label: "Monitor today's work", detail: summary.plannedTeams || summary.openPeriods
    ? "Every planned team is accounted for. Record moves, arrivals and departures as the day goes on." : "Nothing is planned for today. Record any labour that arrives.",
    href: `${input.siteHref}/workforce` };
}
