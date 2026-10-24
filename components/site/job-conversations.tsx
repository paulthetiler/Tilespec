import { randomUUID } from "node:crypto";
import { markJobMessageReadAction, postJobMessageAction } from "@/app/admin/supervisor/daily-actions";
import { aboutHref, aboutLabel, type AboutLookups } from "@/lib/operations/conversations";
import { seenAt, threadState, type AboutType, type JobThread } from "@/lib/operations/daily";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { DailyForm } from "./daily-form";
import styles from "@/app/admin/admin.module.css";

const when = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;

/**
 * Questions and replies between the office and the supervisor in each conversation.
 * The supervisor starts one, about the job or a record; the office replies. Every
 * line is a saved message; "Got it" and "Seen" come from saved read receipts.
 */
export function JobConversations({ threads, viewer, contractId, siteBase, lookups, focus, about, siteName }: {
  threads: JobThread[]; viewer: { user_id: string; office: boolean }; contractId: string; siteBase: string; lookups: AboutLookups;
  focus?: string; about?: { about_type: AboutType; about_id: string } | null; siteName: (userId: string) => string;
}) {
  const mySide = viewer.office ? "office" : "site";
  return <section className={styles.panel} aria-label="Questions and replies" id="conversations">
    <h2>Questions and replies</h2>
    {!viewer.office && <div id="ask">
      <h3>{about ? aboutLabel(about.about_type, about.about_id, lookups) : "Message the office"}</h3>
      <DailyForm action={postJobMessageAction} label="Send to the office" nextHref={`${siteBase}/messages#conversations`} nextLabel="View your messages">
        <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
        {about && <><input type="hidden" name="about_type" value={about.about_type} /><input type="hidden" name="about_id" value={about.about_id} /></>}
        <label className={styles.field}>Your message<textarea name="body" required maxLength={2000} rows={3} /></label>
        <label className={styles.checkboxRow}><input type="checkbox" name="needs_answer" defaultChecked />I need an answer</label>
      </DailyForm>
    </div>}
    <div className={styles.cardList}>{threads.map(thread => {
      const { latest, waitingOn } = threadState(thread);
      const label = aboutLabel(thread.about_type, thread.about_id, lookups), href = aboutHref(thread.about_type, thread.about_id, lookups, siteBase, viewer.office);
      const supervisor = siteName(thread.site_user_id);
      const myLatest = [...thread.messages].reverse().find(message => message.author_side === mySide);
      const seen = myLatest ? seenAt(myLatest, thread) : null;
      const unreadForMe = latest.author_side !== mySide && !latest.needs_answer && !thread.reads.some(read => read.message_id === latest.id && read.reader_id === viewer.user_id);
      const status = waitingOn === "office" ? (viewer.office ? `${supervisor} needs an answer` : "Waiting for the office to answer")
        : waitingOn === "site" ? (viewer.office ? `Waiting for ${supervisor}` : latest.needs_answer ? "The office needs your answer" : "New reply from the office") : "Nothing waiting";
      return <article className={styles.card} key={thread.id} id={`thread-${thread.id}`} data-thread-waiting={waitingOn ?? "none"}>
        <p className={styles.eyebrow}>{status}</p>
        <p>{href ? <a href={href}>{label}</a> : label}{viewer.office ? ` · ${supervisor}` : ""}</p>
        <ol className={styles.plainList}>{thread.messages.map(message => <li key={message.id} data-message-id={message.id}>
          <p className={styles.small}><strong>{message.author_side === mySide && message.author_id === viewer.user_id ? "You" : message.author_name}</strong> · {when(message.created_at)}{message.needs_answer ? " · Needs an answer" : ""}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
        </li>)}</ol>
        {seen && <p className={styles.small} data-seen="">{viewer.office ? `Seen by ${supervisor}` : "Seen by the office"} at {when(seen)}.</p>}
        {unreadForMe && <DailyForm action={markJobMessageReadAction} label="Got it">
          <input type="hidden" name="message_id" value={latest.id} /><input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
        </DailyForm>}
        <details className={styles.details} open={thread.id === focus || (waitingOn === mySide && latest.needs_answer)}><summary>Reply</summary>
          <DailyForm action={postJobMessageAction} label="Send reply" nextHref={`${siteBase}/messages?thread=${thread.id}#thread-${thread.id}`} nextLabel="View the conversation">
            <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="thread_id" value={thread.id} /><input type="hidden" name="request_key" value={randomUUID()} />
            <label className={styles.field}>Your reply<textarea name="body" required maxLength={2000} rows={2} /></label>
            <label className={styles.checkboxRow}><input type="checkbox" name="needs_answer" />{viewer.office ? `I need an answer from ${supervisor}` : "I need an answer"}</label>
          </DailyForm>
        </details>
      </article>;
    })}</div>
    {!threads.length && <p>{viewer.office ? "No questions from site on this job yet." : "No messages yet. Ask the office anything about this job here."}</p>}
  </section>;
}
