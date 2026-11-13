import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteDayFor } from "@/lib/operations/data";
import { buildSiteDay } from "@/lib/operations/site-day";
import { londonDate, londonTimeToIso } from "@/lib/operations/planning";
import { nextSiteStep, siteDaySteps, type SiteDayFacts, type SiteStepKey } from "@/lib/operations/day-steps";
import styles from "./day-steps.module.css";

const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);

/** Today's saved records for the five steps. Read-only; each count is scoped to this site by row-level security as well. */
export async function siteDayFactsFor(supabase: SupabaseClient, contractId: string, userId: string, day = londonDate()): Promise<SiteDayFacts> {
  const since = londonTimeToIso(day, "00:00");
  const count = { count: "exact" as const, head: true };
  const [checks, records, progress, inspections, handovers] = await Promise.all([
    supabase.from("supervisor_inspections").select("id", count).eq("contract_id", contractId).gte("created_at", since),
    siteDayFor(supabase, contractId, day),
    supabase.from("site_progress_entries").select("id", count).eq("contract_id", contractId).eq("work_date", day).is("voided_at", null),
    supabase.from("location_inspections").select("id", count).eq("contract_id", contractId).gte("created_at", since),
    supabase.from("site_handovers").select("id", count).eq("contract_id", contractId).eq("work_date", day).eq("actor_id", userId),
  ]);
  for (const result of [checks, inspections, handovers]) if (result.error) throw new Error(result.error.message);
  if (progress.error && !MISSING.has(progress.error.code)) throw new Error(progress.error.message);
  const { summary, cards } = buildSiteDay(records.records);
  return {
    checked: (checks.count ?? 0) > 0,
    plannedTeams: summary.plannedTeams, unconfirmed: summary.unconfirmed, presentNow: summary.presentNow,
    progressToday: progress.error ? null : progress.count ?? 0,
    inspectionsToday: inspections.count ?? 0,
    handedOver: (handovers.count ?? 0) > 0,
    gangs: cards.map(card => ({ name: card.team?.name ?? "Gang", location: card.location, people: card.expected.length, status: card.status })),
  };
}

const GANG_STATUS = { unconfirmed: "Not confirmed yet", on_site: "On site", finished: "Finished", not_on_site: "Not on site" } as const;

/**
 * The supervisor's day on this site, on every step's page: checks → people → progress → inspect → finish, with
 * what is already done today and a link to the next step, so nobody has to go back to Today between steps.
 * A guide, never a gate: if the records cannot be read, the strip is simply left out and the page works as before.
 */
export async function SiteDaySteps({ supabase, contractId, userId, current, planned = false }: { supabase: SupabaseClient; contractId: string; userId: string; current: SiteStepKey | null;
  /** Also list who the office planned here today (Today page). */
  planned?: boolean }) {
  let facts: SiteDayFacts;
  try { facts = await siteDayFactsFor(supabase, contractId, userId); } catch { return null; }
  return <DayStepsView contractId={contractId} facts={facts} current={current} planned={planned} />;
}

/** The strip itself, from facts already loaded (Today loads them alongside its other records). */
export function DayStepsView({ contractId, facts, current, planned = false }: { contractId: string; facts: SiteDayFacts; current: SiteStepKey | null; planned?: boolean }) {
  const base = `/admin/supervisor/sites/${contractId}`;
  const steps = siteDaySteps(base, facts);
  const next = nextSiteStep(steps, current);
  const done = steps.filter(step => step.done).length;
  const here = steps.find(step => step.key === current);
  const gangs = facts.gangs ?? [];
  return <nav className={styles.steps} aria-label="Your day on this site" data-site-steps={`${done}/${steps.length}`}>
    <p className={styles.heading}>Your day here · {done} of {steps.length} done</p>
    <ol>{steps.map((step, index) => <li key={step.key}>
      <Link href={step.href} className={`${styles.step} ${step.done ? styles.done : ""}`} aria-current={step.key === current ? "step" : undefined} data-step={step.key} data-done={step.done ? "yes" : "no"}>
        <span className={styles.mark} aria-hidden="true">{step.done ? "✓" : index + 1}</span>
        <span className={styles.label}>{step.label}</span>
        <span className={styles.srOnly}>{step.done ? ", done" : ", to do"}. {step.detail}</span>
      </Link>
    </li>)}</ol>
    {current !== null && (next
      // While this page's own step is still open, the link says what comes after it rather than inviting a skip.
      ? <Link className={`${styles.next} ${here && !here.done ? styles.after : ""}`} href={next.href} data-next-step={next.key}>{here && !here.done ? "After this" : "Next"}: {next.next}<span aria-hidden="true"> →</span></Link>
      : <p className={styles.allDone}>Every step is done for today. <Link href={base}>Back to today</Link></p>)}
    {planned && <details className={styles.planned}>
      <summary><span className={styles.heading}>Planned on site today</span>
        <span>{gangs.length ? `${gangs.length} ${gangs.length === 1 ? "gang" : "gangs"} · ${gangs.filter(g => g.status !== "unconfirmed").length} confirmed` : "Nobody planned"}</span></summary>
      {gangs.length ? <ul>{gangs.map((gang, index) => <li key={index}>
        <Link href={`${base}/workforce`}><strong>{gang.name}</strong> <span>{gang.location} · {gang.people} {gang.people === 1 ? "person" : "people"}</span>
          <em className={gang.status === "unconfirmed" ? styles.todo : gang.status === "not_on_site" ? styles.absent : styles.ok}>{GANG_STATUS[gang.status]}</em></Link>
      </li>)}</ul> : <p className={styles.none}>The office has not planned any gang here today. <Link href={`${base}/workforce`}>Record who is here</Link>.</p>}
    </details>}
  </nav>;
}
