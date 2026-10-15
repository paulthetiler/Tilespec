import { randomUUID } from "node:crypto";
import Link from "next/link";
import { siteDayFor } from "@/lib/operations/data";
import { supervisorDailyFor } from "@/lib/operations/daily-data";
import { buildSiteDay } from "@/lib/operations/site-day";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { DailyForm } from "@/components/site/daily-form";
import { recordHandoverAction } from "../../../daily-actions";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
export default async function FinishToday({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`, day = londonDate();
  const [{ records, stale }, daily] = await Promise.all([siteDayFor(supabase, id, day), supervisorDailyFor(supabase, id)]);
  const site = buildSiteDay(records), index = indexLocations(records.locations);
  const periods = [...site.cards.flatMap(card => card.periods), ...site.unplanned];
  const open = periods.filter(period => period.open);
  const saved = daily?.handovers.filter(row => row.actor_id === member.user_id && row.work_date === day) || [];
  return <>
    <h2 className={styles.title}>Finish today</h2><p>{dayLabel(day, "long")} · A short handover for the office.</p>
    <section className={styles.panel} aria-label="Today’s recorded work"><h3>Already recorded</h3>
      <p>{site.summary.presentNow} people on site now · {open.length} work periods still open.</p>
      {periods.length > 0 && <details className={styles.details}><summary>View today’s work</summary><ul>{periods.map(period => <li key={period.allocation.id}>{locationPath(index, period.allocation.work_area_id)} · {londonClock(period.allocation.started_at)}–{period.allocation.ended_at ? londonClock(period.allocation.ended_at) : "still working"}</li>)}</ul></details>}
      <p><Link href={`${base}/workforce`}>Correct workforce times or record a move</Link></p>
      {stale.length > 0 && <p className={styles.warning}>Earlier days still have unfinished work. <Link href={`${base}/workforce#earlier-work`}>Review those times separately</Link>.</p>}
    </section>
    {!daily ? <p className={styles.warning}>Handovers are not available yet. Contact the office and <Link href={`${base}/workforce#finish-heading`}>finish your workforce records</Link>.</p> : <>
      {!!saved.length && <section className={styles.success} aria-label="Saved handovers"><h3>Today’s handover is saved</h3>{saved.map(row => <p key={row.id}>{londonClock(row.created_at)} · {row.work_completed || row.office_notes || "Office handover recorded"}</p>)}<p>Use another handover only to add new information. Earlier handovers stay in the history.</p></section>}
      <section className={styles.panel}><h3>{saved.length ? "Add a handover update" : "How did today go?"}</h3>
        <DailyForm action={recordHandoverAction} label="FINISH TODAY" nextHref={base}>
          <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="day" value={day} /><input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>Work completed<textarea name="work_completed" maxLength={2000} rows={2} placeholder="A sentence is enough" /></label>
          <label className={styles.field}>Outstanding problems<textarea name="outstanding_problems" maxLength={2000} rows={2} /></label>
          <label className={styles.field}>Materials needed for tomorrow<textarea name="materials_needed" maxLength={2000} rows={2} /></label>
          <label className={styles.field}>Areas awaiting attention<textarea name="areas_awaiting_attention" maxLength={2000} rows={2} /></label>
          <label className={styles.field}>Important information for the office<textarea name="office_notes" maxLength={2000} rows={2} /></label>
          <label className={`${styles.field} ${styles.timeField}`}>Work finished at<input type="time" name="at_time" required defaultValue={londonClock(new Date().toISOString())} /><small>Use the actual finish time for today.</small></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="finish_workforce" defaultChecked={open.length > 0} />Finish today’s open workforce records up to this time</label>
          <p className={styles.small}>Existing attendance is reused. Snags and stopped work remain open until dealt with through their own checks.</p>
        </DailyForm>
      </section>
    </>}
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
}
