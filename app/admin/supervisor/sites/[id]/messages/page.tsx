import { randomUUID } from "node:crypto";
import Link from "next/link";
import { canManageContracts } from "@/lib/auth";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { siteSupervisorsFor, supervisorDailyFor } from "@/lib/operations/daily-data";
import { itemState, reviewLine, threadsFrom, type AboutType } from "@/lib/operations/daily";
import { aboutParam } from "@/lib/operations/daily-input";
import { aboutLookupsFor, canAsk } from "@/lib/operations/conversation-data";
import { JobConversations } from "@/components/site/job-conversations";
import { followUpCandidates } from "@/lib/operations/review-data";
import { dayLabel, londonClock, londonDate, londonTimeToIso } from "@/lib/operations/planning";
import { ChangeInstructionForm, ReviewForm, WithdrawForm, type FollowUpCandidate } from "@/components/site/office-follow-up";
import { DailyForm } from "@/components/site/daily-form";
import { OfficeMessageForm } from "@/components/site/office-message-form";
import { acknowledgeOfficeItemAction, sendOfficeItemAction } from "../../../daily-actions";
import { requireSite } from "../../../site-access";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
export default async function OfficeMessages({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ handover?: string; thread?: string; about?: string }> }) {
  const { id } = await params;
  // Office Today links straight to one handover or conversation; "Ask the office about this" names its record.
  const { handover: focus, thread: focusThread, about: aboutValue } = await searchParams;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`, office = canManageContracts(member);
  const daily = await supervisorDailyFor(supabase, id);
  const [recipients, locations, packages, members] = daily && office ? await Promise.all([
    siteSupervisorsFor(supabase, id), locationsFor(supabase, id), supabase.from("work_packages").select("*").eq("contract_id", id),
    supabase.from("organisation_members").select("user_id,display_name"),
  ]) : [[], [], { data: [], error: null }, { data: [], error: null }];
  checkDatabase(packages.error);
  checkDatabase(members.error);
  // The office already reads the member list, so it can see who acknowledged and when.
  const nameOf = new Map(((members.data ?? []) as { user_id: string; display_name: string }[]).map(row => [row.user_id, row.display_name]));
  const shared = flagEnabled("nextActions", member.role) || flagEnabled("roleShell", member.role);
  // Reviews, changes and withdrawals need their reviewed migration; until then the page works as before.
  const followUp = !!daily?.followUp;
  const unreviewed = office && followUp ? daily!.handovers.filter(record => !daily!.reviews.some(review => review.handover_id === record.id)) : [];
  const candidates: FollowUpCandidate[] = unreviewed.length
    ? await followUpCandidates(supabase, id, londonTimeToIso(unreviewed.map(record => record.work_date).sort()[0], "00:00"), daily!.items, daily!.withdrawals) : [];
  const time = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;
  // Questions and replies need their own reviewed migration; until then this section is not shown.
  const threads = daily?.conversations ? threadsFrom(daily.messages, daily.messageReads) : [];
  const asked = !office ? aboutParam(aboutValue) : null;
  const lookups = daily?.conversations ? await aboutLookupsFor(supabase, daily, threads, asked) : null;
  const about = asked && lookups && canAsk(lookups, asked) ? { about_type: asked.about_type as AboutType, about_id: asked.about_id } : null;
  const ask = !office && daily?.conversations;
  return <>
    <h2 className={styles.title}>Office messages</h2>
    {!daily ? <p className={styles.warning}>Office messages are not available yet. Contact the office directly for today’s instructions.</p> : <>
      {office && <details className={styles.details}><summary>Send a message or request an inspection</summary>
        {!recipients.length && <p>No supervisors are currently assigned to this site. Assign a supervisor before sending an inspection request.</p>}
        <OfficeMessageForm action={sendOfficeItemAction} contractId={id} requestKey={randomUUID()} recipients={recipients} locations={locations} packages={packages.data || []} urgentAvailable={followUp} />
      </details>}
      {daily.conversations && lookups && <JobConversations threads={threads} viewer={{ user_id: member.user_id, office }} contractId={id} siteBase={base} lookups={lookups}
        focus={focusThread} about={about} siteName={userId => userId === member.user_id ? member.display_name : nameOf.get(userId) ?? "the supervisor"} />}
      <section className={styles.cardList} aria-label="Saved office messages">
        {daily.items.map(item => {
          const mine = daily.acknowledgements.find(row => row.item_id === item.id && row.actor_id === member.user_id);
          const acknowledgements = daily.acknowledgements.filter(row => row.item_id === item.id);
          const submission = daily.submissions.find(row => row.item_id === item.id);
          const state = itemState(item, daily.items, daily.withdrawals);
          const replaced = daily.items.find(row => row.id === item.replaces_id);
          const current = state.state === "current";
          return <article className={styles.card} key={item.id} id={`message-${item.id}`} data-message-state={state.state}>
            <p className={styles.eyebrow}>{item.kind === "qa_request" ? "Inspection requested" : "From the office"}{item.urgent ? " · Urgent" : ""}{item.replaces_id ? " · Changed" : ""}</p>
            <h3>{current ? item.title : <del>{item.title}</del>}</h3><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
            <p className={styles.small}>{item.created_by_name} · {new Date(item.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}{item.recipient_name ? ` · For ${item.recipient_name}` : " · For this site"}{item.due_on ? ` · Needed by ${dayLabel(item.due_on)}` : ""}</p>
            {replaced && <p className={styles.small}>Replaces <a href={`#message-${replaced.id}`}>“{replaced.title}”</a>.</p>}
            {state.state === "replaced" && <p className={styles.warning}>The office changed this instruction. <a href={`#message-${state.by.id}`}>Read the latest version: “{state.by.title}”</a>.</p>}
            {state.state === "withdrawn" && <p className={styles.warning}>Withdrawn by {state.withdrawal.withdrawn_by_name} at {time(state.withdrawal.withdrawn_at)}: {state.withdrawal.reason}</p>}
            {item.kind === "qa_request" ? <>
              <p>{item.location_path.join(" → ")}</p>
              {submission && <p className={styles.success}>Result sent to the office{submission.has_issues ? " — issues need attention." : "."}</p>}
              <Link className={styles.button} href={`${base}/tasks/${item.id}`}>{submission ? "View inspection result" : "View inspection request"}</Link>
              {office && followUp && current && !submission && <WithdrawForm item={item} contractId={id} />}
            </> : <>
              {mine ? <p className={styles.success}>You acknowledged this at {londonClock(mine.acknowledged_at)}.</p> : !office && current && item.acknowledgement_required ? <DailyForm action={acknowledgeOfficeItemAction} label="Acknowledge message">
                <input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
              </DailyForm> : null}
              {office && item.acknowledgement_required && (acknowledgements.length
                ? <ul>{acknowledgements.map(row => <li key={row.id}>Acknowledged by {nameOf.get(row.actor_id) ?? "a supervisor"} at {londonClock(row.acknowledged_at)}, {dayLabel(londonDate(new Date(row.acknowledged_at)))}</li>)}</ul>
                : current ? <p>Waiting for {item.recipient_name ?? "a supervisor"} to acknowledge.</p> : <p>No acknowledgement needed any more.</p>)}
              {office && followUp && current && <div className={styles.cardList}><ChangeInstructionForm item={item} contractId={id} /><WithdrawForm item={item} contractId={id} /></div>}
              {ask && current && <Link className={styles.secondaryButton} href={`${base}/messages?about=office_item:${item.id}#ask`}>Ask the office about this</Link>}
            </>}
          </article>;
        })}
        {!daily.items.length && <p>No office messages for you at this site.</p>}
      </section>
      {office && <section className={styles.panel} aria-label="Daily handovers"><h2>Daily handovers</h2>
        {daily.handovers.length ? daily.handovers.map(record => {
          const review = daily.reviews.find(row => row.handover_id === record.id);
          return <details key={record.id} id={`handover-${record.id}`} className={styles.details} open={record.id === focus} data-handover-reviewed={followUp ? String(!!review) : undefined}>
            <summary>{dayLabel(record.work_date)} · {record.actor_name}{followUp ? (review ? " · Reviewed" : " · Not reviewed yet") : ""}</summary>
            {[["Work completed",record.work_completed],["Outstanding problems",record.outstanding_problems],["Materials needed for tomorrow",record.materials_needed],["Areas awaiting attention",record.areas_awaiting_attention],["Information for the office",record.office_notes]].filter(([, value]) => value).map(([label,value]) => <div key={label}><h3>{label}</h3><p style={{whiteSpace:"pre-wrap"}}>{value}</p></div>)}
            <p className={styles.small}>Saved {new Date(record.created_at).toLocaleString("en-GB", {timeZone:"Europe/London"})}. {record.finish_workforce ? `${record.ended_count} work periods finished at ${londonClock(record.finished_at)}.` : "Workforce times kept as recorded."}</p>
            {review ? <div className={styles.success} role="status"><p>{reviewLine(review, time)}</p>{review.note && <p style={{ whiteSpace: "pre-wrap" }}>{review.note}</p>}</div>
              : followUp && <ReviewForm subject="handover" subjectId={record.id} contractId={id} candidates={candidates} />}
          </details>;
        }) : <p>No handovers saved yet.</p>}
      </section>}
    </>}
    <div className={styles.rowActions}>{shared && <Link className={styles.secondaryButton} href={`${base}/activity`}>Job activity</Link>}<Link className={styles.secondaryButton} href={`/admin/alerts?contract_id=${id}`}>Safety and quality alerts</Link>{office && <Link className={styles.secondaryButton} href={`/admin/snags?contract_id=${id}`}>Morning blockers and snags</Link>}</div>
  </>;
}
