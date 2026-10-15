import { randomUUID } from "node:crypto";
import { canManageContracts } from "@/lib/auth";
import { siteDayFor } from "@/lib/operations/data";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { buildSiteDay } from "@/lib/operations/site-day";
import { OperationsForm } from "@/components/operations/operations-form";
import { PeriodView, TeamCardView, type DayContext } from "@/components/site/workforce-day";
import { UnplannedForm } from "@/components/site/unplanned-form";
import {
  arrivalAction, confirmAsPlannedAction, confirmChangesAction, departureAction, finishDayAction, finishPeriodAction, moveAction,
  notOnSiteAction, recordUnplannedAction, setLeadAction, undoNotOnSiteAction, voidPeriodAction,
} from "../../../site-actions";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

// Today's Workforce: the office's plan as team cards, confirmed in a tap when
// it matches, and every change recorded as it happens. Reloading this page
// shows exactly what has been saved.
export default async function TodaysWorkforce({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const day = londonDate();
  const { records, stale, names } = await siteDayFor(supabase, id, day);
  const site = buildSiteDay(records);
  const index = indexLocations(records.locations);
  const context: DayContext = {
    contractId: id, day, newKey: randomUUID, locations: records.locations, operatives: records.operatives, names,
    userId: member.user_id, isOffice: canManageContracts(member),
    actions: { confirmAsPlanned: confirmAsPlannedAction, confirmChanges: confirmChangesAction, notOnSite: notOnSiteAction, undoNotOnSite: undoNotOnSiteAction,
      move: moveAction, arrival: arrivalAction, departure: departureAction, finishPeriod: finishPeriodAction, finishDay: finishDayAction,
      setLead: setLeadAction, voidPeriod: voidPeriodAction, recordUnplanned: recordUnplannedAction },
  };
  const staleDays = [...new Set(stale.map(item => item.work_date))];
  const onSite = [...new Set([...site.cards.flatMap(card => card.periods), ...site.unplanned].flatMap(period => period.presentNow))];
  return <>
    <div className={styles.pageHeader}><div>
      <p className={styles.eyebrow}>{dayLabel(day, "long")}</p>
      <h2 className={styles.title}>Today&apos;s Workforce</h2>
      <p className={styles.description}>Confirm each planned team. If anything differs, record what actually happened; the office plan and every earlier record are kept.</p>
    </div></div>

    <section aria-label="Workforce today" className={styles.metrics}>
      {[["Planned teams", site.summary.plannedTeams], ["Confirmed", site.summary.confirmedTeams], ["Not confirmed", site.summary.unconfirmed], ["People on site now", site.summary.presentNow]]
        .map(([label, value]) => <div key={label} className={styles.metric}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong></div>)}
    </section>

    {staleDays.length > 0 && <section className={styles.warning} id="earlier-work" aria-labelledby="earlier-heading">
      <h2 id="earlier-heading">Earlier work never finished</h2>
      <p>The people on this work are still recorded as working there, so they cannot be confirmed anywhere else until it is finished.</p>
      {staleDays.map(staleDay => {
        const items = stale.filter(item => item.work_date === staleDay);
        return <div key={staleDay} className={styles.stack}>
          <p><strong>{dayLabel(staleDay, "long")}:</strong> {items.map(item => `${locationPath(index, item.work_area_id)} from ${londonClock(item.started_at)}`).join("; ")}</p>
          <OperationsForm freezeOnFailure action={finishDayAction} submitLabel={`Finish ${dayLabel(staleDay, "long")}`}>
            <input type="hidden" name="contract_id" value={id} />
            <input type="hidden" name="day" value={staleDay} />
            <input type="hidden" name="earlier" value="true" />
            <label className={`${styles.field} ${styles.timeField}`}>Work finished that day at *<input type="time" name="at_time" required /></label>
          </OperationsForm>
        </div>;
      })}
    </section>}

    <section className={styles.panel} aria-labelledby="planned-heading">
      <div className={styles.panelHeader}><div><h2 id="planned-heading">Planned for today</h2>
        <p className={styles.muted}>{site.summary.plannedTeams ? "Teams still to confirm are shown first." : "The office has not planned any work here today."}</p></div></div>
      <div className={styles.cardList}>{site.cards.map(card => <TeamCardView key={card.plan.id} card={card} context={context} />)}</div>
    </section>

    <section className={styles.panel} aria-labelledby="unplanned-heading">
      <div className={styles.panelHeader}><div><h2 id="unplanned-heading">Labour not on the plan</h2>
        <p className={styles.muted}>Teams or people working here today who were not planned by the office.</p></div></div>
      {site.unplanned.map(period => <PeriodView key={period.allocation.id} period={period} context={context} />)}
      <details className={`${styles.disclosure} ${styles.panelDisclosure} ${styles.cardActions}`}>
        <summary>+ Record labour not on the plan</summary>
        <UnplannedForm action={recordUnplannedAction} contractId={id} day={day} requestKey={randomUUID()} personKey={randomUUID()}
          teams={records.teams} operatives={records.operatives} memberships={records.memberships} companies={records.companies} locations={records.locations} onSite={onSite} />
      </details>
    </section>

    <section className={styles.panel} aria-labelledby="finish-heading">
      <h2 id="finish-heading">End of the day</h2>
      <p className={styles.muted}>Finish every period of work still open today at the time work stopped.</p>
      <OperationsForm freezeOnFailure action={finishDayAction} submitLabel="Finish today's work">
        <input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="day" value={day} />
        <label className={`${styles.field} ${styles.timeField}`}>Work finished at<input type="time" name="at_time" required defaultValue={londonClock(new Date().toISOString())} /><small>Check the time work finished. Retries keep this same time.</small></label>
      </OperationsForm>
    </section>
  </>;
}
