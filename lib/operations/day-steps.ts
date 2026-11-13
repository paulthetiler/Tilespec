/*
 * The supervisor's day on one site, as five steps in the order they are done:
 * morning checks → who is on site → work done → check work → finish the day.
 *
 * Each step is "done" only from saved records for today, worked out the same way as the pages that record them.
 * The steps are a guide through the day, not a gate: safety stops, holds and the rules engine's required steps
 * still decide what is allowed, and Today still puts the most urgent thing first.
 */
export type SiteStepKey = "checks" | "people" | "progress" | "inspect" | "finish";
export type SiteStep = { key: SiteStepKey; label: string; next: string; href: string; done: boolean; detail: string };
export type SiteDayFacts = {
  /** A morning check was saved today. */
  checked: boolean;
  /** Planned teams today, and how many still have nobody confirmed and no recorded absence. */
  plannedTeams: number; unconfirmed: number; presentNow: number;
  /** Progress entries saved today, or null when the site diary is not installed yet. */
  progressToday: number | null;
  /** Location inspections saved today. */
  inspectionsToday: number;
  /** This person's end-of-day handover was saved today. */
  handedOver: boolean;
  /** Who the office planned here today, and whether each gang is confirmed. */
  gangs?: { name: string; location: string; people: number; status: "unconfirmed" | "on_site" | "finished" | "not_on_site" }[];
};

export function siteDaySteps(base: string, facts: SiteDayFacts): SiteStep[] {
  const steps: SiteStep[] = [
    { key: "checks", label: "Checks", next: "Do the morning checks", href: `${base}/checks`, done: facts.checked,
      detail: facts.checked ? "Morning checks saved" : "People, materials, access and safety" },
    { key: "people", label: "People", next: "Confirm who is on site", href: `${base}/workforce`,
      done: facts.plannedTeams > 0 ? facts.unconfirmed === 0 : facts.presentNow > 0,
      detail: facts.plannedTeams === 0 ? (facts.presentNow ? `${facts.presentNow} on site` : "Nobody planned today")
        : facts.unconfirmed ? `${facts.unconfirmed} of ${facts.plannedTeams} planned ${facts.plannedTeams === 1 ? "gang" : "gangs"} to confirm` : "Everyone planned is confirmed" },
    ...(facts.progressToday === null ? [] : [{ key: "progress" as const, label: "Progress", next: "Record the work done", href: `${base}/diary`, done: facts.progressToday > 0,
      detail: facts.progressToday ? `${facts.progressToday} ${facts.progressToday === 1 ? "entry" : "entries"} today` : "Quantities and photographs" }]),
    { key: "inspect", label: "Inspect", next: "Check the work", href: `${base}/inspections`, done: facts.inspectionsToday > 0,
      detail: facts.inspectionsToday ? `${facts.inspectionsToday} ${facts.inspectionsToday === 1 ? "check" : "checks"} saved today` : "Check workmanship by area" },
    { key: "finish", label: "Finish", next: "Finish the day", href: `${base}/finish`, done: facts.handedOver,
      detail: facts.handedOver ? "Handover sent" : "Send the handover before you leave" },
  ];
  return steps;
}

/** The step to do next: the first one not done after the current page (or from the start), else the first not done at all. */
export function nextSiteStep(steps: SiteStep[], current: SiteStepKey | null): SiteStep | null {
  const at = current ? steps.findIndex(step => step.key === current) : -1;
  return steps.slice(at + 1).find(step => !step.done) ?? steps.find(step => !step.done && step.key !== current) ?? null;
}
