import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { threadsFrom, threadState, type JobMessage, type JobMessageRead } from "@/lib/operations/daily";
import { messageCategoryLabels } from "@/lib/operations/daily-input";
import { meaningfulText } from "@/lib/operations/text";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { addDays } from "@/lib/operations/next-actions/lookups";
import { DailyForm } from "@/components/site/daily-form";
import { postJobMessageAction, recordOfficeReviewAction } from "@/app/admin/supervisor/daily-actions";
import { recordThreadOutcomeAction } from "@/app/admin/command-centre-actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
const when = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;
const age = (iso: string) => {
  const hours = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
  return hours < 1 ? "just now" : hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};
type Row = Record<string, unknown>;
const MISSING = ["42P01", "PGRST205", "42703"];

/**
 * The office inbox: everything from site that waits on the office, across every job, in one place.
 * Questions, decision requests and problems are answered or decided here; reports are reviewed here;
 * everything else opens its own record. Reads use the signed-in person's own session.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const query = await searchParams;
  const job = typeof query.job === "string" && /^[0-9a-f-]{36}$/i.test(query.job) ? query.job : null;
  const focus = typeof query.thread === "string" ? query.thread : null;
  const financial = canReadFinancial(member);
  const today = londonDate();

  const contracts = await supabase.from("contracts").select("id,reference,name").order("reference");
  checkDatabase(contracts.error);
  const jobs = new Map(((contracts.data ?? []) as Row[]).map(c => [String(c.id), `${c.reference} · ${c.name}`]));
  const ids = job ? [job] : [...jobs.keys()];
  const none = { data: [] as Row[], error: null };
  const scoped = (q: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>) => (ids.length ? q() : Promise.resolve(none));
  const [messages, reads, handovers, items, acks, submissions, gang, drafts, notices] = await Promise.all([
    scoped(() => supabase.from("job_messages").select("*").in("contract_id", ids).order("created_at").order("id")),
    scoped(() => supabase.from("job_message_reads").select("*").in("contract_id", ids)),
    scoped(() => supabase.from("site_handovers").select("id,contract_id,actor_name,work_date,outstanding_problems,areas_awaiting_attention,office_notes,created_at")
      .in("contract_id", ids).gte("work_date", addDays(today, -7)).order("created_at", { ascending: false })),
    scoped(() => supabase.from("supervisor_office_items").select("*").in("contract_id", ids).order("created_at", { ascending: false })),
    scoped(() => supabase.from("supervisor_office_acknowledgements").select("item_id").in("contract_id", ids)),
    scoped(() => supabase.from("supervisor_qa_submissions").select("id,item_id,has_issues,submitted_at,contract_id").in("contract_id", ids)),
    scoped(() => supabase.from("gang_invoices").select("id,reference,contract_id,status,submitted_by_name,submitted_at").in("contract_id", ids).in("status", ["awaiting_check", "with_office"]).order("submitted_at")),
    scoped(() => supabase.from("supervisor_issues").select("id,contract_id,check_label,inspector_name,created_at").in("contract_id", ids).eq("snag_status", "draft").lt("created_at", `${today}T00:00:00Z`)),
    supabase.rpc("hold_notifications", { p_contract: job, p_unread_only: true }),
  ]);
  for (const r of [messages, reads, handovers, items, acks, submissions, drafts]) if (r.error && !MISSING.includes(r.error.code ?? "")) checkDatabase(r.error);
  const reviewsResult = ids.length ? await supabase.from("office_reviews").select("handover_id,qa_submission_id").in("contract_id", ids) : none;
  const reviewsAvailable = !reviewsResult.error;
  const reviewed = new Set(((reviewsResult.data ?? []) as Row[]).flatMap(r => [r.handover_id, r.qa_submission_id]).filter(Boolean) as string[]);

  const threads = threadsFrom((messages.data ?? []) as unknown as JobMessage[], (reads.data ?? []) as unknown as JobMessageRead[])
    .map(thread => ({ thread, state: threadState(thread), root: thread.messages[0] as JobMessage & { category?: string; urgent?: boolean } }))
    // A conversation you have just answered stays in view (marked answered) so the confirmation is seen.
    .filter(t => t.state.waitingOn === "office" || t.thread.id === focus
      || (t.state.latest.author_side === "office" && t.state.latest.author_id === member.user_id && Date.now() - Date.parse(t.state.latest.created_at) < 2 * 3_600_000))
    .sort((a, b) => Number(b.root.urgent === true) - Number(a.root.urgent === true) || a.state.latest.created_at.localeCompare(b.state.latest.created_at));
  const reports = ((handovers.data ?? []) as Row[]).filter(h => !reviewed.has(String(h.id))
    && [h.outstanding_problems, h.areas_awaiting_attention, h.office_notes].some(t => meaningfulText(t as string)));
  const ackd = new Set(((acks.data ?? []) as Row[]).map(a => String(a.item_id)));
  const allItems = (items.data ?? []) as Row[];
  const replaced = new Set(allItems.map(i => i.replaces_id).filter(Boolean) as string[]);
  const instructions = allItems.filter(i => i.kind === "instruction" && i.acknowledgement_required && !ackd.has(String(i.id)) && !replaced.has(String(i.id)));
  const answered = new Set(((submissions.data ?? []) as Row[]).map(s => String(s.item_id)));
  const qa = allItems.filter(i => i.kind === "qa_request" && !answered.has(String(i.id)) && !replaced.has(String(i.id)));
  const problemResults = ((submissions.data ?? []) as Row[]).filter(s => s.has_issues && !reviewed.has(String(s.id)));
  const gangRows = ((gang.data ?? []) as Row[]).filter(g => financial || g.status === "awaiting_check");
  const draftRows = (drafts.data ?? []) as Row[];
  const noticeRows = (notices.error ? [] : ((notices.data as { rows?: Row[] } | null)?.rows ?? [])) as Row[];
  const total = threads.filter(t => t.state.waitingOn === "office").length + reports.length + problemResults.length + instructions.length + qa.length + gangRows.length + draftRows.length + noticeRows.length;

  return <>
    <div className={styles.pageHeader}><div>
      <p className={styles.eyebrow}>Office inbox</p>
      <h1 className={styles.title}>Inbox{total ? ` (${total})` : ""}</h1>
      <p className={styles.description}>Everything from site waiting on the office, across every job. Answer, decide and review here; everything else opens its record.</p>
    </div></div>
    <form method="get" className={styles.search}>
      <label className={styles.field}>Job<select name="job" defaultValue={job ?? ""}><option value="">Every job</option>
        {[...jobs].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button className={styles.secondaryButton} type="submit">Show</button>
    </form>
    {total === 0 && <section className={styles.empty}><h2>Nothing is waiting on the office</h2><p>New questions, reports and claims from site appear here as soon as they are saved.</p></section>}

    {threads.length > 0 && <section className={styles.panel} id="questions" aria-labelledby="questions-heading">
      <h2 id="questions-heading">Questions, decisions and problems ({threads.filter(t => t.state.waitingOn === "office").length})</h2>
      <div className={styles.cardList}>{threads.map(({ thread, state, root }) => {
        const category = (root.category ?? "message") as keyof typeof messageCategoryLabels;
        return <article key={thread.id} id={`thread-${thread.id}`} className={styles.card} data-inbox-thread={thread.id}>
          <p className={styles.eyebrow}>{state.waitingOn === "office" ? "" : "Answered · "}{root.urgent ? "Urgent · " : ""}{messageCategoryLabels[category] ?? "Message"} · {jobs.get(thread.contract_id)} · {age(state.latest.created_at)}</p>
          <ol className={styles.plainList}>{thread.messages.map(message => <li key={message.id}>
            <p className={styles.small}><strong>{message.author_name}</strong> · {when(message.created_at)}{message.needs_answer ? " · Needs an answer" : ""}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
          </li>)}</ol>
          <div className={styles.grid}>
            <details className={styles.details} open={thread.id === focus || category === "question" || category === "message"}><summary>Reply</summary>
              <DailyForm action={postJobMessageAction} label="Send reply">
                <input type="hidden" name="contract_id" value={thread.contract_id} /><input type="hidden" name="thread_id" value={thread.id} /><input type="hidden" name="request_key" value={randomUUID()} />
                <label className={styles.field}>Your reply<textarea name="body" required maxLength={2000} rows={2} /></label>
                <label className={styles.checkboxRow}><input type="checkbox" name="needs_answer" />I need an answer from site</label>
              </DailyForm>
            </details>
            <details className={styles.details} open={thread.id === focus || category === "decision" || category === "problem"}><summary>{category === "decision" ? "Decide" : "Answer or resolve"}</summary>
              <DailyForm action={recordThreadOutcomeAction} label="Record and tell site">
                <input type="hidden" name="contract_id" value={thread.contract_id} /><input type="hidden" name="thread_id" value={thread.id} /><input type="hidden" name="request_key" value={randomUUID()} />
                <label className={styles.field}>Outcome<select name="outcome" defaultValue={category === "decision" ? "approved" : "answered"} required>
                  {category === "decision" && <><option value="approved">Approve</option><option value="rejected">Do not approve</option></>}
                  <option value="answered">Answer</option><option value="resolved">Resolved, no answer needed</option>
                </select></label>
                <label className={styles.field}>Answer, condition or reason<textarea name="note" maxLength={2000} rows={2} /></label>
              </DailyForm>
            </details>
          </div>
          <p className={styles.small}><Link href={`/admin/supervisor/sites/${thread.contract_id}/messages?thread=${thread.id}#thread-${thread.id}`}>Open the job's conversations →</Link></p>
        </article>;
      })}</div>
    </section>}

    {(reports.length > 0 || problemResults.length > 0) && <section className={styles.panel} id="reports" aria-labelledby="reports-heading">
      <h2 id="reports-heading">Site reports to review ({reports.length + problemResults.length})</h2>
      {!reviewsAvailable && <p className={styles.warning}>Recording reviews arrives with a database update that is not yet applied. Open each report to act on it.</p>}
      <div className={styles.cardList}>
        {reports.map(h => <article key={String(h.id)} className={styles.card} id={`handover-${h.id}`}>
          <p className={styles.eyebrow}>End-of-day report · {jobs.get(String(h.contract_id))} · {dayLabel(String(h.work_date), "long")} · {String(h.actor_name)}</p>
          {meaningfulText(h.outstanding_problems as string) && <p><strong>Problems:</strong> {String(h.outstanding_problems)}</p>}
          {meaningfulText(h.areas_awaiting_attention as string) && <p><strong>Needs attention:</strong> {String(h.areas_awaiting_attention)}</p>}
          {meaningfulText(h.office_notes as string) && <p><strong>For the office:</strong> {String(h.office_notes)}</p>}
          {reviewsAvailable && <details className={styles.details}><summary>Mark as reviewed</summary>
            <DailyForm action={recordOfficeReviewAction} label="Save review">
              <input type="hidden" name="contract_id" value={String(h.contract_id)} /><input type="hidden" name="subject" value="handover" />
              <input type="hidden" name="subject_id" value={String(h.id)} /><input type="hidden" name="outcome" value="noted" /><input type="hidden" name="request_key" value={randomUUID()} />
              <label className={styles.field}>What you did about it<textarea name="note" maxLength={1000} rows={2} /></label>
            </DailyForm>
          </details>}
          <p className={styles.small}><Link href={`/admin/supervisor/sites/${h.contract_id}/messages?handover=${h.id}#handover-${h.id}`}>Open the report to raise a snag, stop or instruction →</Link></p>
        </article>)}
        {problemResults.map(r => <article key={String(r.id)} className={styles.card}>
          <p className={styles.eyebrow}>Inspection result with problems · {jobs.get(String(r.contract_id))} · {when(String(r.submitted_at))}</p>
          <p><Link href={`/admin/supervisor/sites/${r.contract_id}/tasks/${r.item_id}`}>Open the result and decide what to do →</Link></p>
        </article>)}
      </div>
    </section>}

    {(instructions.length > 0 || qa.length > 0) && <section className={styles.panel} id="instructions" aria-labelledby="instructions-heading">
      <h2 id="instructions-heading">Sent to site and not yet done ({instructions.length + qa.length})</h2>
      <ul className={styles.plainList}>
        {instructions.map(i => <li key={String(i.id)}><Link href={`/admin/supervisor/sites/${i.contract_id}/messages`}>Instruction not acknowledged: {String(i.title)}</Link> · {jobs.get(String(i.contract_id))} · sent {when(String(i.created_at))} to {String(i.recipient_name ?? "the supervisors")}</li>)}
        {qa.map(i => <li key={String(i.id)}><Link href={`/admin/supervisor/sites/${i.contract_id}/tasks/${i.id}`}>Inspection requested: {String(i.title)}</Link> · {jobs.get(String(i.contract_id))}{i.due_on ? ` · due ${dayLabel(String(i.due_on))}` : ""}</li>)}
      </ul>
    </section>}

    {gangRows.length > 0 && <section className={styles.panel} id="claims" aria-labelledby="claims-heading">
      <h2 id="claims-heading">Subcontractor claims ({gangRows.length})</h2>
      <ul className={styles.plainList}>{gangRows.map(g => <li key={String(g.id)}><Link href={financial ? `/admin/gang-invoices/${g.id}` : `/admin/supervisor/sites/${g.contract_id}/progress`}>{String(g.reference)}</Link> · {jobs.get(String(g.contract_id))} · {String(g.submitted_by_name)} ·
        {g.status === "awaiting_check" ? " waiting for the supervisor to verify the work" : " verified, ready for approval"}</li>)}</ul>
    </section>}

    {(draftRows.length > 0 || noticeRows.length > 0) && <section className={styles.panel} id="other" aria-labelledby="other-heading">
      <h2 id="other-heading">Also waiting</h2>
      <ul className={styles.plainList}>
        {draftRows.map(d => <li key={String(d.id)}><Link href={`/admin/snags/${d.id}`}>Snag saved but never sent: {String(d.check_label)}</Link> · {jobs.get(String(d.contract_id))} · started by {String(d.inspector_name ?? "a supervisor")}</li>)}
        {noticeRows.map((n, i) => <li key={String(n.id ?? i)}><Link href={`/admin/holds/${n.hold_id}`}>{String(n.title ?? "Stop or release notice not yet read")}</Link> · {String(n.contract_reference ?? "")} · <Link href="/admin/alerts">mark as read in Site alerts</Link></li>)}
      </ul>
    </section>}
  </>;
}
