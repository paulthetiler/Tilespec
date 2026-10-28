import type { InstallationStage } from "./types";

export type OfficeItem = {
  id: string; contract_id: string; kind: "instruction" | "qa_request";
  title: string; body: string; recipient_id: string | null; recipient_name: string | null;
  acknowledgement_required: boolean; work_area_id: string | null; location_path: string[];
  stage: InstallationStage | null; work_package_id: string | null; due_on: string | null;
  created_by: string; created_by_name: string; created_at: string; request_key: string;
  /** Present once instruction changes are installed: the earlier instruction this one replaces, and whether it is urgent. */
  replaces_id?: string | null; urgent?: boolean;
};
export type OfficeAcknowledgement = { id: string; item_id: string; actor_id: string; acknowledged_at: string; request_key: string };
export type QaSubmission = { id: string; item_id: string; inspection_id: string; submitted_by: string; submitted_at: string; has_issues: boolean; request_key: string };
export type SiteHandover = {
  id: string; contract_id: string; actor_id: string; actor_name: string; work_date: string;
  finished_at: string; work_completed: string; outstanding_problems: string; materials_needed: string;
  areas_awaiting_attention: string; office_notes: string; finish_workforce: boolean;
  actual_allocation_ids: string[]; ended_count: number; created_at: string; request_key: string;
};
export type OfficeWithdrawal = { id: string; item_id: string; reason: string; withdrawn_by: string; withdrawn_by_name: string; withdrawn_at: string; request_key: string };
export const reviewOutcomes = ["noted", "snag_raised", "stop_raised", "instruction_sent"] as const;
export type ReviewOutcome = (typeof reviewOutcomes)[number];
export const reviewOutcomeLabels: Record<ReviewOutcome, string> = {
  noted: "Noted", snag_raised: "Snag raised", stop_raised: "Stop raised", instruction_sent: "Instruction sent",
};
export type OfficeReview = {
  id: string; contract_id: string; qa_submission_id: string | null; handover_id: string | null; outcome: ReviewOutcome; note: string;
  follow_up_id: string | null; reviewed_by: string; reviewed_by_name: string; reviewed_at: string; request_key: string;
};
export const aboutTypes = ["job", "snag", "hold", "office_item", "qa_result", "handover", "daywork"] as const;
export type AboutType = (typeof aboutTypes)[number];
export type JobMessage = {
  id: string; contract_id: string; thread_id: string; site_user_id: string; author_id: string; author_name: string;
  author_side: "office" | "site"; body: string; needs_answer: boolean; about_type: AboutType | null; about_id: string | null;
  created_at: string; request_key: string;
};
export type JobMessageRead = { id: string; message_id: string; reader_id: string; read_at: string };
/** A conversation between the office and one supervisor, oldest message first. */
export type JobThread = { id: string; contract_id: string; site_user_id: string; about_type: AboutType; about_id: string | null; messages: JobMessage[]; reads: JobMessageRead[] };
export type SupervisorDailyRecords = {
  items: OfficeItem[]; acknowledgements: OfficeAcknowledgement[];
  submissions: QaSubmission[]; handovers: SiteHandover[];
  /** False until the reviewed office review and instruction change migration is applied. */
  followUp: boolean;
  withdrawals: OfficeWithdrawal[]; reviews: OfficeReview[];
  /** False until the reviewed job message migration is applied. */
  conversations: boolean;
  messages: JobMessage[]; messageReads: JobMessageRead[];
};
/** Conversations with the most recent activity first. */
export function threadsFrom(messages: JobMessage[], reads: JobMessageRead[]): JobThread[] {
  const roots = messages.filter(message => message.thread_id === message.id);
  return roots.map(root => {
    const own = messages.filter(message => message.thread_id === root.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const ids = new Set(own.map(message => message.id));
    return { id: root.id, contract_id: root.contract_id, site_user_id: root.site_user_id, about_type: root.about_type ?? "job", about_id: root.about_id,
      messages: own, reads: reads.filter(read => ids.has(read.message_id)) };
  }).sort((a, b) => b.messages.at(-1)!.created_at.localeCompare(a.messages.at(-1)!.created_at) || a.id.localeCompare(b.id));
}
/** Who has to do something next in a conversation. A question waits for an answer; an office reply waits until the supervisor has read it. */
export function threadState(thread: JobThread): { latest: JobMessage; waitingOn: "office" | "site" | null } {
  const latest = thread.messages.at(-1)!;
  if (latest.needs_answer) return { latest, waitingOn: latest.author_side === "site" ? "office" : "site" };
  if (latest.author_side === "office" && !thread.reads.some(read => read.message_id === latest.id && read.reader_id === thread.site_user_id)) return { latest, waitingOn: "site" };
  return { latest, waitingOn: null };
}
/** When the other side first saw a message: a "Got it" or a later reply from them. */
export function seenAt(message: JobMessage, thread: JobThread): string | null {
  const times = [
    ...thread.reads.filter(read => read.message_id === message.id && read.reader_id !== message.author_id).map(read => read.read_at),
    ...thread.messages.filter(reply => reply.author_side !== message.author_side && reply.created_at > message.created_at).map(reply => reply.created_at),
  ].sort();
  return times[0] ?? null;
}
export const firstLine = (text: string, length = 80) => { const line = text.trim().split(/\n/)[0]; return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line; };
/** What happened to an office message after it was sent. A change is a new message that names the one it replaces. */
export function itemState(item: OfficeItem, items: OfficeItem[], withdrawals: OfficeWithdrawal[] = []):
  { state: "current" } | { state: "replaced"; by: OfficeItem } | { state: "withdrawn"; withdrawal: OfficeWithdrawal } {
  const withdrawal = withdrawals.find(row => row.item_id === item.id);
  if (withdrawal) return { state: "withdrawn", withdrawal };
  const by = items.find(row => row.replaces_id === item.id);
  return by ? { state: "replaced", by } : { state: "current" };
}
const isCurrent = (item: OfficeItem, items: OfficeItem[], withdrawals: OfficeWithdrawal[]) => itemState(item, items, withdrawals).state === "current";
export function outstandingQa(items: OfficeItem[], submissions: QaSubmission[], withdrawals: OfficeWithdrawal[] = []) {
  const submitted = new Set(submissions.map(item => item.item_id));
  return items.filter(item => item.kind === "qa_request" && !submitted.has(item.id) && isCurrent(item, items, withdrawals));
}
export function unacknowledgedInstructions(items: OfficeItem[], acknowledgements: OfficeAcknowledgement[], actorId: string, withdrawals: OfficeWithdrawal[] = []) {
  const read = new Set(acknowledgements.filter(row => row.actor_id === actorId).map(row => row.item_id));
  return items.filter(item => item.kind === "instruction" && item.acknowledgement_required && !read.has(item.id) && isCurrent(item, items, withdrawals));
}
/** One line saying who reviewed a result or handover, when, and what they did. */
export function reviewLine(review: OfficeReview, clock: (iso: string) => string) {
  return `Reviewed by ${review.reviewed_by_name} at ${clock(review.reviewed_at)}: ${reviewOutcomeLabels[review.outcome] ?? "Reviewed"}.`;
}
export function qaInspectionHref(item: OfficeItem) {
  const query = new URLSearchParams({ location: item.work_area_id ?? "", stage: item.stage ?? "", qa_request: item.id });
  if (item.work_package_id) query.set("package", item.work_package_id);
  return `/admin/supervisor/sites/${item.contract_id}/inspections?${query}`;
}
