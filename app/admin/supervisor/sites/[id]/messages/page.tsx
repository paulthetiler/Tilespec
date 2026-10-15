import { randomUUID } from "node:crypto";
import Link from "next/link";
import { canManageContracts } from "@/lib/auth";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { siteSupervisorsFor, supervisorDailyFor } from "@/lib/operations/daily-data";
import { dayLabel, londonClock } from "@/lib/operations/planning";
import { DailyForm } from "@/components/site/daily-form";
import { OfficeMessageForm } from "@/components/site/office-message-form";
import { acknowledgeOfficeItemAction, sendOfficeItemAction } from "../../../daily-actions";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
export default async function OfficeMessages({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`, office = canManageContracts(member);
  const daily = await supervisorDailyFor(supabase, id);
  const [recipients, locations, packages] = daily && office ? await Promise.all([
    siteSupervisorsFor(supabase, id), locationsFor(supabase, id), supabase.from("work_packages").select("*").eq("contract_id", id),
  ]) : [[], [], { data: [], error: null }];
  checkDatabase(packages.error);
  return <>
    <h2 className={styles.title}>Office messages</h2>
    {!daily ? <p className={styles.warning}>Office messages are not available yet. Contact the office directly for today’s instructions.</p> : <>
      {office && <details className={styles.details}><summary>Send a message or request an inspection</summary>
        {!recipients.length && <p>No supervisors are currently assigned to this site. Assign a supervisor before sending an inspection request.</p>}
        <OfficeMessageForm action={sendOfficeItemAction} contractId={id} requestKey={randomUUID()} recipients={recipients} locations={locations} packages={packages.data || []} />
      </details>}
      <section className={styles.cardList} aria-label="Saved office messages">
        {daily.items.map(item => {
          const mine = daily.acknowledgements.find(row => row.item_id === item.id && row.actor_id === member.user_id);
          const acknowledgements = daily.acknowledgements.filter(row => row.item_id === item.id);
          const submission = daily.submissions.find(row => row.item_id === item.id);
          return <article className={styles.card} key={item.id} id={`message-${item.id}`}>
            <p className={styles.eyebrow}>{item.kind === "qa_request" ? "Inspection requested" : "From the office"}</p>
            <h3>{item.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
            <p className={styles.small}>{item.created_by_name} · {new Date(item.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}{item.recipient_name ? ` · For ${item.recipient_name}` : " · For this site"}{item.due_on ? ` · Needed by ${dayLabel(item.due_on)}` : ""}</p>
            {item.kind === "qa_request" ? <>
              <p>{item.location_path.join(" → ")}</p>
              {submission && <p className={styles.success}>Result sent to the office{submission.has_issues ? " — issues need attention." : "."}</p>}
              <Link className={styles.button} href={`${base}/tasks/${item.id}`}>{submission ? "View inspection result" : "View inspection request"}</Link>
            </> : <>
              {mine ? <p className={styles.success}>You acknowledged this at {londonClock(mine.acknowledged_at)}.</p> : !office && item.acknowledgement_required ? <DailyForm action={acknowledgeOfficeItemAction} label="Acknowledge message">
                <input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
              </DailyForm> : null}
              {office && item.acknowledgement_required && <p>{acknowledgements.length ? `${acknowledgements.length} supervisor acknowledgement${acknowledgements.length === 1 ? "" : "s"} received.` : "Awaiting acknowledgement."}</p>}
            </>}
          </article>;
        })}
        {!daily.items.length && <p>No office messages for you at this site.</p>}
      </section>
      {office && <section className={styles.panel} aria-label="Daily handovers"><h2>Daily handovers</h2>
        {daily.handovers.length ? daily.handovers.map(record => <details key={record.id} className={styles.details}><summary>{dayLabel(record.work_date)} · {record.actor_name}</summary>
          {[["Work completed",record.work_completed],["Outstanding problems",record.outstanding_problems],["Materials needed for tomorrow",record.materials_needed],["Areas awaiting attention",record.areas_awaiting_attention],["Information for the office",record.office_notes]].filter(([, value]) => value).map(([label,value]) => <div key={label}><h3>{label}</h3><p style={{whiteSpace:"pre-wrap"}}>{value}</p></div>)}
          <p className={styles.small}>Saved {new Date(record.created_at).toLocaleString("en-GB", {timeZone:"Europe/London"})}. {record.finish_workforce ? `${record.ended_count} work periods finished at ${londonClock(record.finished_at)}.` : "Workforce times kept as recorded."}</p>
        </details>) : <p>No handovers saved yet.</p>}
      </section>}
    </>}
    <div className={styles.rowActions}><Link className={styles.secondaryButton} href={`${base}`}>Back to today</Link><Link className={styles.secondaryButton} href={`/admin/alerts?contract_id=${id}`}>Safety and quality alerts</Link>{office && <Link className={styles.secondaryButton} href={`/admin/snags?contract_id=${id}`}>Morning blockers and snags</Link>}</div>
  </>;
}
