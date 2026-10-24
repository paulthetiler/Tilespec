/*
 * Job Activity: one chronological story of a job, built only from records that are already
 * saved (snag and stop events, office messages, acknowledgements, inspection results,
 * handovers, morning checks, inspections, plans and documents). Pure: no I/O, no writes.
 * Each line says who did what, in plain English, and links to the saved record.
 */
export type ActivityEntry = {
  id: string;
  at: string;
  who: string;
  what: string;
  detail?: string;
  href?: string;
  tone?: "stop" | "problem" | "done";
};

export type ActivitySources = {
  snagEvents: { id: string | number; issue_id: string; action: string; note: string; actor_id: string; actor_name: string | null; created_at: string;
    assigned_action?: string | null; target_date?: string | null; assigned_party?: string | null }[];
  snags: { id: string; check_label: string; location: string }[];
  holdEvents: { id: string | number; hold_id: string; action: string; note: string; actor_id: string; actor_name: string | null; created_at: string }[];
  holds: { id: string; hold_type: string; location: string }[];
  messages: { id: string; kind: string; title: string; body: string; created_by: string; created_by_name: string; recipient_name: string | null;
    location_path: string[]; due_on: string | null; created_at: string; replaces_id?: string | null; urgent?: boolean }[];
  /** Empty until office reviews and instruction changes are installed. */
  withdrawals?: { id: string; item_id: string; reason: string; withdrawn_by: string; withdrawn_by_name: string; withdrawn_at: string }[];
  reviews?: { id: string; qa_submission_id: string | null; handover_id: string | null; outcome: string; note: string; reviewed_by: string; reviewed_by_name: string; reviewed_at: string }[];
  acknowledgements: { id: string; item_id: string; actor_id: string; acknowledged_at: string }[];
  results: { id: string; item_id: string; submitted_by: string; submitted_at: string; has_issues: boolean }[];
  handovers: { id: string; actor_id: string; actor_name: string; created_at: string; outstanding_problems: string; areas_awaiting_attention: string; office_notes: string; work_completed: string }[];
  morningChecks: { id: string; actor_id: string; created_at: string; issues_count: number }[];
  inspections: { id: string; actor_id: string; actor_name: string | null; created_at: string; issues_count: number; location: string }[];
  plans: { id: string; team: string; location: string; planned_start: string; planned_end: string; instructions: string; created_by: string | null; created_at: string;
    supersedes_id: string | null; cancelled_at: string | null; cancelled_by: string | null }[];
  documents: { id: string; title: string; revision: number; created_by: string; uploaded_at: string }[];
};

export type ActivityOptions = {
  viewerId: string;
  /** Names the viewer may already see (the office reads the member list; a supervisor only their own). */
  names: Map<string, string>;
  siteBase: string;
  contractId: string;
  /** The office reads handovers in Messages; a supervisor reads their own on Finish today. */
  office: boolean;
};

const SNAG_VERBS: Record<string, string> = {
  create: "started a snag record", submit: "reported a snag", add_original_evidence: "added photos to a snag", assign: "asked a gang to fix a snag",
  submit_rectification: "sent a snag repair for checking", start_reinspection: "started checking a snag repair", accept: "accepted a snag repair",
  reject: "sent a snag repair back", escalate: "passed a snag to the office", resolve_escalation: "resolved an escalated snag", reopen: "reopened a snag",
  cancel: "marked a snag as entered in error", propose_responsibility: "proposed who was responsible for a snag",
  accept_responsibility: "accepted responsibility for a snag", dispute_responsibility: "disputed responsibility for a snag",
  review_responsibility: "decided responsibility for a snag", mark_unknown: "marked a snag's responsibility as unknown",
};
const HOLD_VERBS: Record<string, string> = {
  raise: "stopped work", add_original_evidence: "added photos to a stop", assign: "asked a gang to fix a stop", escalate: "escalated a stop",
  submit_correction: "sent the fix for a stop", request_release: "asked the office to check a stop", release: "restarted work after a stop",
  reject_release: "sent a stop's fix back", supersede: "replaced a stop", entered_in_error: "marked a stop as entered in error",
};
const OUTCOMES: Record<string, string> = { noted: "noted", snag_raised: "snag raised", stop_raised: "stop raised", instruction_sent: "instruction sent" };
const brief = (text: string, length = 200) => { const t = text.trim(); return t.length > length ? `${t.slice(0, length - 1).trimEnd()}…` : t; };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const at = (where: string) => (where ? ` at ${where}` : "");

export function buildActivity(src: ActivitySources, options: ActivityOptions): ActivityEntry[] {
  const { viewerId, names, siteBase, office } = options;
  const person = (id: string | null, saved?: string | null, fallback = "Someone") => (id && id === viewerId ? "You" : saved || (id ? names.get(id) : undefined) || fallback);
  const snag = new Map(src.snags.map(row => [row.id, row]));
  const hold = new Map(src.holds.map(row => [row.id, row]));
  const message = new Map(src.messages.map(row => [row.id, row]));
  const entries: ActivityEntry[] = [];

  for (const e of src.snagEvents) {
    const s = snag.get(e.issue_id);
    const what = `${e.action === "assign" && e.assigned_party ? `asked ${e.assigned_party} to fix a snag` : SNAG_VERBS[e.action] ?? "updated a snag"}${s?.check_label ? `: ${s.check_label}` : ""}${at(s?.location ?? "")}`;
    const detail = e.action === "assign" && e.assigned_action ? `Repair: ${e.assigned_action}${e.target_date ? ` · Target ${e.target_date}` : ""}` : brief(e.note);
    entries.push({ id: `snag-event:${e.id}`, at: e.created_at, who: person(e.actor_id, e.actor_name), what, detail, href: `/admin/snags/${e.issue_id}`,
      tone: e.action === "submit" ? "problem" : e.action === "accept" ? "done" : undefined });
  }
  for (const e of src.holdEvents) {
    const h = hold.get(e.hold_id);
    const kind = h?.hold_type === "safety" ? "safety stop" : "quality hold";
    const what = `${e.action === "raise" ? `stopped work (${kind})` : HOLD_VERBS[e.action] ?? "updated a stop"}${at(h?.location ?? "")}`;
    entries.push({ id: `hold-event:${e.id}`, at: e.created_at, who: person(e.actor_id, e.actor_name), what, detail: brief(e.note), href: `/admin/holds/${e.hold_id}`,
      tone: e.action === "raise" ? "stop" : e.action === "release" ? "done" : undefined });
  }
  const messageHref = (m: { id: string; kind: string }) => (m.kind === "qa_request" ? `${siteBase}/tasks/${m.id}` : `${siteBase}/messages#message-${m.id}`);
  for (const m of src.messages) {
    const to = m.recipient_name ?? "the site";
    const replaced = m.replaces_id ? message.get(m.replaces_id) : undefined;
    const what = m.kind === "qa_request" ? `asked ${to} to inspect${at(m.location_path.join(" › "))}: “${m.title}”`
      : m.replaces_id ? `changed ${replaced ? `“${replaced.title}”` : "an instruction"} to ${to}: “${m.title}”${m.urgent ? " (urgent)" : ""}`
      : `sent ${m.urgent ? "an urgent" : "an"} instruction to ${to}: “${m.title}”`;
    entries.push({ id: `message:${m.id}`, at: m.created_at, who: person(m.created_by, m.created_by_name, "Office"), what,
      detail: `${brief(m.body)}${m.due_on ? ` · Needed by ${m.due_on}` : ""}`, href: messageHref(m), tone: m.urgent ? "problem" : undefined });
  }
  for (const w of src.withdrawals ?? []) {
    const m = message.get(w.item_id);
    entries.push({ id: `withdrawal:${w.id}`, at: w.withdrawn_at, who: person(w.withdrawn_by, w.withdrawn_by_name, "Office"),
      what: `withdrew ${m?.kind === "qa_request" ? "the inspection request" : "the instruction"} “${m?.title ?? "an office message"}”`, detail: brief(w.reason),
      href: m ? messageHref(m) : `${siteBase}/messages` });
  }
  for (const a of src.acknowledgements) {
    const m = message.get(a.item_id);
    entries.push({ id: `ack:${a.id}`, at: a.acknowledged_at, who: person(a.actor_id, null, "A supervisor"), what: `acknowledged “${m?.title ?? "an office instruction"}”`,
      href: `${siteBase}/messages#message-${a.item_id}`, tone: "done" });
  }
  for (const r of src.results) {
    const m = message.get(r.item_id);
    entries.push({ id: `result:${r.id}`, at: r.submitted_at, who: person(r.submitted_by, null, "A supervisor"),
      what: `sent the inspection result for “${m?.title ?? "an inspection request"}”: ${r.has_issues ? "problems found" : "no problems found"}`,
      href: `${siteBase}/tasks/${r.item_id}`, tone: r.has_issues ? "problem" : "done" });
  }
  const result = new Map(src.results.map(row => [row.id, row]));
  const handover = new Map(src.handovers.map(row => [row.id, row]));
  for (const v of src.reviews ?? []) {
    const r = v.qa_submission_id ? result.get(v.qa_submission_id) : undefined;
    const h = v.handover_id ? handover.get(v.handover_id) : undefined;
    const subject = v.qa_submission_id ? `the inspection result for “${(r && message.get(r.item_id)?.title) ?? "an inspection request"}”`
      : `${!h ? "a" : h.actor_id === viewerId ? "your" : `${person(h.actor_id, h.actor_name)}’s`} handover`;
    entries.push({ id: `review:${v.id}`, at: v.reviewed_at, who: person(v.reviewed_by, v.reviewed_by_name, "Office"),
      what: `reviewed ${subject}: ${OUTCOMES[v.outcome] ?? "reviewed"}`, detail: v.note ? brief(v.note) : undefined, tone: "done",
      href: r ? `${siteBase}/tasks/${r.item_id}` : v.handover_id ? (office ? `${siteBase}/messages?handover=${v.handover_id}#handover-${v.handover_id}` : `${siteBase}/finish`) : undefined });
  }
  for (const h of src.handovers) {
    const note = [["For the office", h.office_notes], ["Problems", h.outstanding_problems], ["Needs attention", h.areas_awaiting_attention], ["Done", h.work_completed]]
      .find(([, text]) => text.trim());
    entries.push({ id: `handover:${h.id}`, at: h.created_at, who: person(h.actor_id, h.actor_name), what: "sent the end-of-day handover",
      detail: note ? brief(`${note[0]}: ${note[1]}`) : undefined,
      href: office ? `/admin/messages?contract_id=${options.contractId}#handover-${h.id}` : `${siteBase}/finish`,
      tone: h.outstanding_problems.trim() || h.office_notes.trim() ? "problem" : undefined });
  }
  for (const c of src.morningChecks) {
    entries.push({ id: `morning:${c.id}`, at: c.created_at, who: person(c.actor_id, null, "A supervisor"), what: "completed the morning checks",
      detail: c.issues_count ? `${plural(c.issues_count, "problem")} reported to the office` : "No problems reported",
      href: `${siteBase}/checks?inspection=${c.id}#morning-${c.id}`, tone: c.issues_count ? "problem" : undefined });
  }
  for (const i of src.inspections) {
    entries.push({ id: `inspection:${i.id}`, at: i.created_at, who: person(i.actor_id, i.actor_name),
      what: `inspected${at(i.location)}: ${i.issues_count ? plural(i.issues_count, "problem") : "all checks passed"}`,
      href: `${siteBase}/inspections?inspection=${i.id}`, tone: i.issues_count ? "problem" : "done" });
  }
  for (const p of src.plans) {
    const dates = p.planned_start === p.planned_end ? p.planned_start : `${p.planned_start} to ${p.planned_end}`;
    entries.push({ id: `plan:${p.id}`, at: p.created_at, who: person(p.created_by, null, "Office"),
      what: `${p.supersedes_id ? "changed the plan:" : "planned"} ${p.team}${at(p.location)} for ${dates}`, detail: p.instructions ? brief(p.instructions) : undefined });
    if (p.cancelled_at) entries.push({ id: `plan-cancelled:${p.id}`, at: p.cancelled_at, who: person(p.cancelled_by, null, "Office"),
      what: `cancelled the plan for ${p.team}${at(p.location)} (${dates})` });
  }
  for (const d of src.documents) {
    entries.push({ id: `document:${d.id}`, at: d.uploaded_at, who: person(d.created_by, null, "Office"), what: `uploaded ${d.title} (revision ${d.revision})`,
      href: `/admin/documents/${d.id}` });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
