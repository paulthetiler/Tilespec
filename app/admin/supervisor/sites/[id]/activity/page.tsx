import Link from "next/link";
import { notFound } from "next/navigation";
import { activityFor } from "@/lib/operations/activity-data";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { dayLabel } from "@/lib/operations/planning";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";
import activity from "./activity.module.css";

export const dynamic = "force-dynamic";

const londonDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
const londonTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// One story per job, shared by the office and the supervisor. Everything here is a saved record;
// the page only reads, and each line opens the record it came from.
export default async function JobActivity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  if (!flagEnabled("nextActions", member.role) && !flagEnabled("roleShell", member.role)) notFound();
  const { before } = await searchParams;
  const cursor = typeof before === "string" && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const { entries, nextBefore } = await activityFor(supabase, member, id, cursor);
  const days = [...new Set(entries.map(entry => londonDay(entry.at)))];
  return <>
    <div className={styles.pageHeader}><div>
      <h1 className={styles.title}>Job activity</h1>
      <p className={styles.description}>Everything the office and site have recorded on this job, newest first. Tap a line to open the record.</p>
    </div></div>
    {days.map(day => <section key={day} className={activity.day} aria-label={dayLabel(day, "long")}>
      <h2>{dayLabel(day, "long")}</h2>
      <ol className={activity.list}>{entries.filter(entry => londonDay(entry.at) === day).map(entry => {
        const body = <>
          <span className={activity.time}>{londonTime(entry.at)}</span>
          <span className={activity.text}><strong>{entry.who}</strong> {entry.what}{entry.detail && <small>{entry.detail}</small>}</span>
        </>;
        return <li key={entry.id} className={entry.tone ? activity[entry.tone] : undefined} data-activity={entry.id}>
          {entry.href ? <Link href={entry.href} className={activity.entry}>{body}</Link> : <div className={activity.entry}>{body}</div>}
        </li>;
      })}</ol>
    </section>)}
    {!entries.length && <p className={styles.description}>{cursor ? "Nothing earlier was recorded on this job." : "Nothing has been recorded on this job yet."}</p>}
    <div className={styles.rowActions}>
      {nextBefore && <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}/activity?before=${encodeURIComponent(nextBefore)}`}>Show earlier</Link>}
      {cursor && <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}/activity`}>Newest</Link>}
    </div>
  </>;
}
