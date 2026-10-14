import { randomUUID } from "node:crypto";
import { canManageContracts } from "@/lib/auth";
import { workforceHistoryFor } from "@/lib/operations/data";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { addDays, dayLabel, isCalendarDate, londonClock, londonDate } from "@/lib/operations/planning";
import { periodFor } from "@/lib/operations/site-day";
import { installationStageLabels } from "@/lib/operations/types";
import { LocationPicker } from "@/components/office/location-picker";
import { PeriodView, type DayContext } from "@/components/site/workforce-day";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Search = { from?: string | string[]; to?: string | string[]; area?: string | string[]; team?: string | string[] };

// Who worked where, when, at what stage, who recorded it and why it changed.
// A record of presence for people to weigh; it never decides responsibility.
export default async function WorkforceHistory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const search = await searchParams;
  const today = londonDate();
  const pick = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const to = isCalendarDate(pick(search.to)) ? pick(search.to)! : today;
  const from = isCalendarDate(pick(search.from)) && pick(search.from)! <= to ? pick(search.from)! : addDays(to, -6);
  const area = uuidPattern.test(pick(search.area) ?? "") ? pick(search.area)! : null;
  const team = uuidPattern.test(pick(search.team) ?? "") ? pick(search.team)! : null;
  const history = await workforceHistoryFor(supabase, id, from, to);
  const index = indexLocations(history.locations);
  const target = area ? index.get(area) : undefined;
  // A location's history includes work recorded at it, around it (a whole flat
  // covers its bathroom) and within it.
  const matches = history.allocations.filter(allocation => {
    if (team && allocation.team_id !== team) return false;
    if (!target) return true;
    const where = index.get(allocation.work_area_id);
    return Boolean(where && (where.path_ids.includes(target.id) || target.path_ids.includes(where.id)));
  });
  const records = { attendance: history.attendance, operatives: history.workforce.operatives, teams: history.workforce.teams, companies: history.workforce.companies, now: new Date().toISOString() };
  const context: DayContext = {
    contractId: id, day: today, newKey: randomUUID, locations: history.locations, operatives: history.workforce.operatives, names: history.names,
    userId: member.user_id, isOffice: canManageContracts(member),
  };
  const days = [...new Set(matches.map(allocation => allocation.work_date))].sort().reverse();
  const plans = new Map(history.plans.map(plan => [plan.id, plan]));
  const byId = new Map(history.allocations.map(allocation => [allocation.id, allocation]));
  const absences = history.absences.filter(absence => {
    const plan = plans.get(absence.planned_allocation_id);
    if (!plan || (team && plan.team_id !== team)) return false;
    const where = index.get(plan.work_area_id);
    return !target || Boolean(where && (where.path_ids.includes(target.id) || target.path_ids.includes(where.id)));
  });
  return <>
    <div className={styles.pageHeader}><div><h2 className={styles.title}>Workforce history</h2>
      <p className={styles.description}>Who was recorded working where and when, at what stage, who recorded it and why anything changed. Presence on a record is not a finding of responsibility for a defect.</p></div></div>
    <form className={`${styles.panel} ${styles.form}`} method="get" aria-label="Filter history">
      <div className={styles.formGrid}>
        <label className={styles.field}>From<input type="date" name="from" defaultValue={from} max={today} /></label>
        <label className={styles.field}>To<input type="date" name="to" defaultValue={to} max={today} /></label>
        <label className={styles.field}>Team<select name="team" defaultValue={team ?? ""}><option value="">All teams</option>
          {history.workforce.teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <LocationPicker name="area" label="Location" locations={history.locations} defaultValue={area} allowTopLevel hint="Choose a flat to include its rooms; choose a room to include work recorded for the whole flat." />
      <div className={styles.actions}><button type="submit" className={styles.button}>Show history</button></div>
    </form>
    <p className={styles.muted}>{matches.length} {matches.length === 1 ? "period" : "periods"} of work{target ? ` at or around ${locationPath(index, target.id)}` : ""} from {dayLabel(from, "long")} to {dayLabel(to, "long")}.</p>
    {days.map(workDay => <section key={workDay} className={styles.panel} aria-labelledby={`day-${workDay}`}>
      <h2 id={`day-${workDay}`}>{dayLabel(workDay, "long")}</h2>
      {matches.filter(allocation => allocation.work_date === workDay).map(allocation => {
        const plan = allocation.planned_allocation_id ? plans.get(allocation.planned_allocation_id) : undefined;
        const previous = allocation.previous_allocation_id ? byId.get(allocation.previous_allocation_id) : undefined;
        return <div key={allocation.id}>
          <p className={styles.small}>
            {plan ? `Planned: ${locationPath(index, plan.work_area_id)} · ${installationStageLabels[plan.stage]}` : "Not on the plan"}
            {previous ? ` · Moved from ${locationPath(index, previous.work_area_id)} at ${londonClock(allocation.started_at)}` : ""}
            {allocation.ended_at && allocation.ended_by ? ` · Finished by ${history.names.get(allocation.ended_by) ?? "a supervisor"}` : ""}
          </p>
          {allocation.voided_at && <p className={styles.error}>Entered in error{allocation.voided_by && history.names.get(allocation.voided_by) ? ` (marked by ${history.names.get(allocation.voided_by)})` : ""}: {allocation.void_reason}</p>}
          <PeriodView period={periodFor(allocation, records, index)} context={context} />
        </div>;
      })}
      {absences.filter(absence => absence.work_date === workDay).map(absence => {
        const plan = plans.get(absence.planned_allocation_id)!;
        const person = absence.operative_id ? history.workforce.operatives.find(item => item.id === absence.operative_id)?.display_name : null;
        const teamName = history.workforce.teams.find(item => item.id === plan.team_id)?.name ?? "Team";
        return <p key={absence.id} className={styles.small}><strong>{person ? `${person} absent` : `${teamName} not on site`}:</strong> {absence.reason}
          {` · recorded ${londonClock(absence.recorded_at)} by ${history.names.get(absence.recorded_by) ?? "a supervisor"}`}{absence.voided_at ? ` · later voided: ${absence.void_reason}` : ""}</p>;
      })}
    </section>)}
    {days.length === 0 && <p className={styles.empty}>Nothing was recorded for these filters.</p>}
  </>;
}
