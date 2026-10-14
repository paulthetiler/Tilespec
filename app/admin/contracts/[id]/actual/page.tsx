import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase, siteDayFor } from "@/lib/operations/data";
import { addDays, dayLabel, isCalendarDate, londonDate } from "@/lib/operations/planning";
import { buildSiteDay } from "@/lib/operations/site-day";
import { ExceptionList, PeriodView, TeamCardView, type DayContext } from "@/components/site/workforce-day";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The office's view of a site day: the plan, what the supervisor confirmed,
// and every difference, without re-entering anything. Workforce records only:
// no payroll, CIS or payment figures are derived from them.
export default async function PlannedVersusActual({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string | string[] }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireActor();
  if (!["owner", "contracts_manager", "supervisor"].includes(member.role)) {
    return <p className={styles.empty}>Planned versus actual is for the office and supervisors.</p>;
  }
  const contract = await supabase.from("contracts").select("id,reference,name").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const today = londonDate();
  const requested = (await searchParams).date;
  const day = isCalendarDate(requested) && requested <= today ? requested : today;
  const { records, names } = await siteDayFor(supabase, id, day);
  const site = buildSiteDay(records);
  const context: DayContext = { contractId: id, day, newKey: randomUUID, locations: records.locations, operatives: records.operatives, names,
    userId: member.user_id, isOffice: canManageContracts(member) };
  const base = `/admin/contracts/${id}/actual`;
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{contract.data.reference}</p><h1 className={styles.title}>Planned versus actual</h1>
        <p className={styles.description}>What the office planned for {contract.data.name}, and what the supervisor recorded on site.</p></div>
      <div className={styles.inline}>
        <Link className={styles.secondaryButton} href={`/admin/contracts/${id}/plan`}>Plan work</Link>
        <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}/history`}>Workforce history</Link>
      </div>
    </div>
    <nav className={styles.weekNav} aria-label="Choose day">
      <strong>{dayLabel(day, "long")}</strong>
      <Link className={styles.secondaryButton} href={`${base}?date=${addDays(day, -1)}`}>← Previous day</Link>
      {day !== today && <Link className={styles.secondaryButton} href={base}>Today</Link>}
      {day < today && <Link className={styles.secondaryButton} href={`${base}?date=${addDays(day, 1)}`}>Next day →</Link>}
    </nav>
    <section aria-label="Summary" className={styles.metrics}>
      {[["Planned teams", site.summary.plannedTeams], ["Confirmed", site.summary.confirmedTeams], ["Not confirmed", site.summary.unconfirmed], ["Not on site", site.summary.notOnSite]]
        .map(([label, value]) => <div key={label} className={styles.metric}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong></div>)}
    </section>
    <section className={styles.panel} aria-labelledby="exceptions-heading">
      <h2 id="exceptions-heading">Differences from the plan ({site.exceptions.length})</h2>
      <ExceptionList exceptions={site.exceptions} empty="Everything matched the plan." />
    </section>
    <section className={styles.panel} aria-labelledby="teams-heading">
      <h2 id="teams-heading">Team by team</h2>
      <div className={styles.cardList}>{site.cards.map(card => <TeamCardView key={card.plan.id} card={card} context={context} />)}</div>
      {site.cards.length === 0 && <p className={styles.empty}>Nothing was planned for this day.</p>}
    </section>
    {site.unplanned.length > 0 && <section className={styles.panel} aria-labelledby="added-heading">
      <h2 id="added-heading">Added by the supervisor</h2>
      {site.unplanned.map(period => <PeriodView key={period.allocation.id} period={period} context={context} />)}
    </section>}
  </>;
}
