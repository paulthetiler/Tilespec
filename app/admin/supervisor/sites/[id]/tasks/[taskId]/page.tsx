import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supervisorDailyFor } from "@/lib/operations/daily-data";
import { itemState, qaInspectionHref, reviewLine } from "@/lib/operations/daily";
import { canManageContracts } from "@/lib/auth";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { followUpCandidates } from "@/lib/operations/review-data";
import { ReviewForm, WithdrawForm } from "@/components/site/office-follow-up";
import { isRecordId } from "@/lib/operations/daily-input";
import { checkDatabase } from "@/lib/operations/data";
import { installationStageLabels } from "@/lib/operations/types";
import { inspectionHasBlockingFailure } from "@/lib/operations/inspections";
import { DailyForm } from "@/components/site/daily-form";
import { submitQaResultAction } from "../../../../daily-actions";
import { requireSite } from "../../../../site-access";
import styles from "../../../../../admin.module.css";

export const dynamic = "force-dynamic";
export default async function InspectionRequest({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  if (!isRecordId(taskId)) notFound();
  const daily = await supervisorDailyFor(supabase, id);
  const item = daily?.items.find(row => row.id === taskId && row.kind === "qa_request");
  if (!item) notFound();
  const base = `/admin/supervisor/sites/${id}`;
  const submission = daily!.submissions.find(row => row.item_id === item.id);
  const snagQuery = new URLSearchParams({ location_id: item.work_area_id!, stage: item.stage! });
  if (item.work_package_id) snagQuery.set("package", item.work_package_id);
  let query = supabase.from("location_inspections").select("id,created_at,issues_count,answers,work_package_id,location_inspection_templates!inner(stage)")
    .eq("contract_id", id).eq("work_area_id", item.work_area_id).eq("location_inspection_templates.stage", item.stage)
    .eq("actor_id", member.user_id).gte("created_at", item.created_at).order("created_at", { ascending: false }).limit(30);
  query = item.work_package_id ? query.eq("work_package_id", item.work_package_id) : query.is("work_package_id", null);
  const inspections = await query;
  checkDatabase(inspections.error);
  const mine = item.recipient_id === member.user_id, office = canManageContracts(member);
  const state = itemState(item, daily!.items, daily!.withdrawals);
  const withdrawn = state.state === "withdrawn" ? state.withdrawal : null;
  const review = submission ? daily!.reviews.find(row => row.qa_submission_id === submission.id) : undefined;
  const time = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;
  // Snags or stops raised since the request, offered as the review's linked follow-up.
  const candidates = office && daily!.followUp && submission && !review ? await followUpCandidates(supabase, id, item.created_at, daily!.items, daily!.withdrawals) : [];
  return <>
    <p className={styles.eyebrow}>Work awaiting sign-off</p><h2 className={styles.title}>{item.title}</h2>
    <section className={styles.panel}><h3>{item.location_path.join(" → ")}</h3>
      <p>Office has requested QA confirmation{item.stage ? ` for ${installationStageLabels[item.stage].toLowerCase()}` : ""}.</p><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
      <p className={styles.small}>Requested by {item.created_by_name}{item.recipient_name ? ` · Assigned to ${item.recipient_name}` : ""}{item.due_on ? ` · Needed by ${item.due_on}` : ""}.</p>
      {withdrawn && <p className={styles.warning}>Withdrawn by {withdrawn.withdrawn_by_name} at {time(withdrawn.withdrawn_at)}: {withdrawn.reason}. Nothing more is needed for this request.</p>}
      <div className={styles.cardButtons}>{mine && !submission && !withdrawn && <Link className={styles.bigButton} href={qaInspectionHref(item)}>INSPECT WORK</Link>}
        <Link className={styles.secondaryButton} href={`${base}/snags?${snagQuery}`}>VIEW OUTSTANDING SNAGS</Link></div>
    </section>
    {submission ? <>
      <section className={styles.success} role="status"><h3>Result sent to the office</h3><p>{submission.has_issues ? "Issues were found and need attention." : "The requested inspection was submitted."}</p><Link href={`${base}/inspections?inspection=${submission.inspection_id}#inspection-${submission.inspection_id}`}>View saved inspection</Link></section>
      {daily!.followUp && <section className={styles.panel} aria-label="Office review" data-result-reviewed={String(!!review)}><h3>Office review</h3>
        {review ? <><p>{reviewLine(review, time)}</p>{review.note && <p style={{ whiteSpace: "pre-wrap" }}>{review.note}</p>}</>
          : office ? <ReviewForm subject="qa_result" subjectId={submission.id} contractId={id} itemId={item.id} candidates={candidates} />
          : <p>Not reviewed by the office yet.</p>}
      </section>}
    </> : withdrawn ? null
      : mine ? <section className={styles.panel}><h3>Submit result</h3>
        {inspections.data?.length ? <DailyForm action={submitQaResultAction} label="SUBMIT RESULT" nextHref={base}>
          <input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>Your saved inspection<select name="inspection_id" required defaultValue={inspections.data[0].id}>{inspections.data.map(record => <option key={record.id} value={record.id}>{new Date(record.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })} — {inspectionHasBlockingFailure(record) ? "Issues need attention" : "Checks passed"}</option>)}</select></label>
          <p>The office receives your saved findings. This does not approve payment or remove work restrictions.</p>
        </DailyForm> : <p>Tap INSPECT WORK to record your findings, then return here to send the result to the office.</p>}
      </section> : <><p>Only the assigned supervisor can submit this result.</p>{office && daily!.followUp && <WithdrawForm item={item} contractId={id} />}</>}
    {mine && daily!.conversations && <Link className={styles.secondaryButton} href={`${base}/messages?about=${submission ? `qa_result:${submission.id}` : `office_item:${item.id}`}#ask`}>Ask the office about this</Link>}
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
}
