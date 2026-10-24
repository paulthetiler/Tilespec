import { randomUUID } from "node:crypto";
import { recordOfficeReviewAction, sendOfficeItemAction, withdrawOfficeItemAction } from "@/app/admin/supervisor/daily-actions";
import { reviewOutcomeLabels, reviewOutcomes, type OfficeItem } from "@/lib/operations/daily";
import { DailyForm } from "./daily-form";
import styles from "@/app/admin/admin.module.css";

/** A snag, stop or instruction the office raised, offered as the review's linked follow-up. */
export type FollowUpCandidate = { outcome: "snag_raised" | "stop_raised" | "instruction_sent"; id: string; label: string };

/** Office only. Sends a new version that names the instruction it replaces; the original stays as sent. */
export function ChangeInstructionForm({ item, contractId }: { item: OfficeItem; contractId: string }) {
  return <details className={styles.details}><summary>Change it</summary>
    <DailyForm action={sendOfficeItemAction} label="Send the changed instruction" nextHref={`/admin/supervisor/sites/${contractId}/messages`} nextLabel="View messages">
      <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
      <input type="hidden" name="kind" value="instruction" /><input type="hidden" name="replaces_id" value={item.id} />
      <input type="hidden" name="recipient_id" value={item.recipient_id ?? ""} />
      <p className={styles.small}>Goes to {item.recipient_name ?? "everyone supervising this site"}. The original is kept and marked as replaced.</p>
      <label className={styles.field}>Title<input name="title" required maxLength={160} defaultValue={item.title} /></label>
      <label className={styles.field}>Instructions<textarea name="body" required maxLength={2000} rows={3} defaultValue={item.body} /></label>
      <label className={styles.checkboxRow}><input type="checkbox" name="urgent" defaultChecked={!!item.urgent} />Urgent: show it at the top of the supervisor’s Today</label>
      <label className={styles.checkboxRow}><input type="checkbox" name="acknowledgement_required" defaultChecked={item.acknowledgement_required} />Ask the supervisor to acknowledge this</label>
      <label className={styles.field}>Needed by (optional)<input type="date" name="due_on" defaultValue={item.due_on ?? ""} /></label>
    </DailyForm>
  </details>;
}

/** Office only. Records who withdrew it and why; nothing is deleted. */
export function WithdrawForm({ item, contractId }: { item: OfficeItem; contractId: string }) {
  const request = item.kind === "qa_request";
  return <details className={styles.details}><summary>{request ? "Withdraw this request" : "Withdraw it"}</summary>
    <DailyForm action={withdrawOfficeItemAction} label={request ? "Withdraw the request" : "Withdraw the instruction"} nextHref={`/admin/supervisor/sites/${contractId}/messages`} nextLabel="View messages">
      <input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
      <label className={styles.field}>Why? The supervisor sees this<textarea name="reason" required maxLength={500} rows={2} /></label>
    </DailyForm>
  </details>;
}

/** Office only. One review per inspection result or handover. */
export function ReviewForm({ subject, subjectId, contractId, itemId, candidates }: {
  subject: "qa_result" | "handover"; subjectId: string; contractId: string; itemId?: string; candidates: FollowUpCandidate[];
}) {
  return <DailyForm action={recordOfficeReviewAction} label="Mark as reviewed">
    <input type="hidden" name="subject" value={subject} /><input type="hidden" name="subject_id" value={subjectId} />
    <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
    {itemId && <input type="hidden" name="item_id" value={itemId} />}
    <label className={styles.field}>What did you do about it?<select name="outcome" required defaultValue="noted">
      {reviewOutcomes.map(outcome => <option key={outcome} value={outcome}>{reviewOutcomeLabels[outcome]}</option>)}
    </select></label>
    {candidates.length > 0 && <label className={styles.field}>Linked record (optional)<select name="follow_up" defaultValue="">
      <option value="">None</option>
      {candidates.map(candidate => <option key={`${candidate.outcome}:${candidate.id}`} value={`${candidate.outcome}:${candidate.id}`}>{reviewOutcomeLabels[candidate.outcome]}: {candidate.label}</option>)}
    </select></label>}
    <label className={styles.field}>Note (optional, the supervisor sees this)<textarea name="note" maxLength={1000} rows={2} /></label>
    <p className={styles.small}>Raise a snag, stop work or send an instruction first if one is needed; this only records that the office has dealt with it.</p>
  </DailyForm>;
}
