import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { addDays } from "@/lib/operations/next-actions/lookups";
import { gangCalendar, jobStage, workingDays, stageLabels } from "@/lib/operations/command-centre";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * The cross-job planner: every active gang against the next 14 days, with double bookings, idle gangs
 * and live jobs that nobody is planned on. Plans are added and changed on each job's existing plan page.
 */
export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const params = await searchParams;
  const today = londonDate();
  const from = typeof params.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const to = addDays(from, 13);
  const days = workingDays(from, 14);
  const [contracts, teams, plans, actuals] = await Promise.all([
    supabase.from("contracts").select("*").order("reference"),
    supabase.from("teams").select("id,name,active").eq("active", true).order("name"),
    supabase.from("planned_allocations").select("id,contract_id,team_id,stage,planned_start,planned_end,work_area_id").lte("planned_start", to).gte("planned_end", from)
      .is("cancelled_at", null).is("superseded_by", null),
    supabase.from("actual_allocations").select("id,contract_id,team_id").eq("work_date", today).is("voided_at", null),
  ]);
  [contracts, teams, plans, actuals].forEach(r => checkDatabase(r.error));
  const jobs = ((contracts.data ?? []) as Row[]).map(c => ({ id: String(c.id), label: `${c.reference} · ${c.name}`, reference: String(c.reference),
    start: (c.start_date as string | null) ?? null, end: (c.end_date as string | null) ?? null, ...jobStage(c.lifecycle_stage as string | null, c.start_date as string | null, c.end_date as string | null, today) }));
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const teamRows = (teams.data ?? []) as Row[];
  const planRows = ((plans.data ?? []) as Row[]).map(p => ({ id: String(p.id), contract_id: String(p.contract_id), team_id: String(p.team_id), planned_start: String(p.planned_start), planned_end: String(p.planned_end) }));
  const calendar = gangCalendar(planRows, teamRows.map(t => String(t.id)), days);
  const cell = (team: string, date: string) => calendar.find(c => c.team_id === team && c.date === date)?.contracts ?? [];
  const running = jobs.filter(j => ["mobilising", "live"].includes(j.stage) || (j.start && j.start <= to && (!j.end || j.end >= from) && ["won", "mobilising", "live"].includes(j.stage)));
  const onSite = (actuals.data ?? []) as Row[];
  const doubles = calendar.filter(c => c.contracts.length > 1).length;
  const idleGangDays = calendar.filter(c => c.contracts.length === 0).length;

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Planning</p><h1 className={styles.title}>Workforce and programme planner</h1>
      <p className={styles.description}>Every active gang across every job for the next 14 days. Plan or change work on each job's plan page; the supervisor confirms it on site.</p></div></div>
    <nav className={styles.weekNav} aria-label="Fortnight">
      <Link className={styles.secondaryButton} href={`/admin/planner?from=${addDays(from, -14)}`}>← Previous fortnight</Link>
      {from !== today && <Link className={styles.secondaryButton} href="/admin/planner">This fortnight</Link>}
      <Link className={styles.secondaryButton} href={`/admin/planner?from=${addDays(from, 14)}`}>Next fortnight →</Link>
    </nav>
    <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.metricLabel}>Gangs confirmed on site today</span><strong className={styles.metricValue}>{new Set(onSite.map(a => a.team_id)).size}</strong>
        <span className={styles.small}>{onSite.length} people across {new Set(onSite.map(a => a.contract_id)).size} jobs</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Double-booked gang-days</span><strong className={styles.metricValue}>{doubles}</strong><span className={styles.small}>A gang planned on two jobs the same day</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Idle gang-days</span><strong className={styles.metricValue}>{idleGangDays}</strong><span className={styles.small}>Working days with no plan</span></div>
    </div>

    <section className={styles.panel} aria-labelledby="gangs-heading">
      <h2 id="gangs-heading">Gangs</h2>
      {teamRows.length === 0 ? <p>No active gangs yet. <Link href="/admin/subcontractors/new">Add a gang</Link>.</p>
      : <div className={styles.tableWrap}><table className={styles.table} data-planner="gangs">
        <thead><tr><th scope="col">Gang</th>{days.map(d => <th scope="col" key={d}>{day(d)}</th>)}</tr></thead>
        <tbody>{teamRows.map(team => <tr key={String(team.id)}><th scope="row">{String(team.name)}</th>{days.map(d => {
          const here = cell(String(team.id), d);
          return <td key={d} data-double={here.length > 1 ? "yes" : undefined} style={here.length > 1 ? { background: "#fdecea" } : here.length ? { background: "#e7f0ee" } : undefined}>
            {here.length ? here.map(c => <Link key={c} href={`/admin/contracts/${c}/plan`} title={jobById.get(c)?.label}>{jobById.get(c)?.reference ?? "Job"}</Link>) : <span className={styles.muted}>—</span>}
          </td>;
        })}</tr>)}</tbody>
      </table></div>}
    </section>

    <section className={styles.panel} aria-labelledby="jobs-heading">
      <h2 id="jobs-heading">Jobs</h2>
      {running.length === 0 ? <p>No jobs are running or starting in this fortnight.</p>
      : <div className={styles.tableWrap}><table className={styles.table} data-planner="jobs">
        <thead><tr><th scope="col">Job</th><th scope="col">Stage</th>{days.map(d => <th scope="col" key={d}>{day(d)}</th>)}<th scope="col">Plan</th></tr></thead>
        <tbody>{running.map(job => <tr key={job.id}><th scope="row"><Link href={`/admin/contracts/${job.id}`}>{job.label}</Link></th><td>{stageLabels[job.stage]}</td>{days.map(d => {
          const inProgramme = (!job.start || job.start <= d) && (!job.end || job.end >= d);
          const gangs = planRows.filter(p => p.contract_id === job.id && p.planned_start <= d && p.planned_end >= d);
          return <td key={d} style={inProgramme && !gangs.length ? { background: "#fff3dd" } : undefined}>{gangs.length ? `${gangs.length} gang${gangs.length === 1 ? "" : "s"}` : inProgramme ? "None planned" : ""}</td>;
        })}<td><Link href={`/admin/contracts/${job.id}/plan`}>Plan work</Link></td></tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
