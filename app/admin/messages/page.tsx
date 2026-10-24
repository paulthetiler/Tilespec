import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { reviewLine, type OfficeItem, type OfficeReview, type OfficeWithdrawal, type SiteHandover } from "@/lib/operations/daily";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { eventDate } from "@/components/operations/format";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
type Job = { reference: string; name: string };
type MessageRow = Pick<OfficeItem, "id" | "contract_id" | "kind" | "title" | "body" | "recipient_name" | "created_by_name" | "created_at" | "due_on" | "replaces_id" | "urgent"> & { contract: Job };
type HandoverRow = Pick<SiteHandover, "id" | "contract_id" | "actor_name" | "work_date" | "work_completed" | "outstanding_problems" | "materials_needed" | "areas_awaiting_attention" | "office_notes" | "created_at"> & { contract: Job };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member) || (!flagEnabled("nextActions", member.role) && !flagEnabled("roleShell", member.role))) notFound();
  const query = await searchParams;
  const contractId = typeof query.contract_id === "string" ? query.contract_id : "";
  if (contractId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contractId)) notFound();
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(Number(query.page), 100000) : 0;
  const contracts = await contractsFor(supabase);
  if (contractId && !contracts.some(contract => contract.id === contractId)) notFound();
  let messages = supabase.from("supervisor_office_items")
    // Every column, so instruction changes (replaces_id, urgent) appear once their migration is applied.
    .select("*,contract:contracts!inner(reference,name)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id");
  let handovers = supabase.from("site_handovers")
    .select("id,contract_id,actor_name,work_date,work_completed,outstanding_problems,materials_needed,areas_awaiting_attention,office_notes,created_at,contract:contracts!inner(reference,name)")
    .order("created_at", { ascending: false }).order("id").limit(20);
  if (contractId) { messages = messages.eq("contract_id", contractId); handovers = handovers.eq("contract_id", contractId); }
  const [messageResult, handoverResult] = await Promise.all([messages.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1), handovers]);
  const results = [messageResult, handoverResult];
  // A missing reviewed daily-workflow migration is an unavailable state, never an empty inbox.
  const unavailable = results.some(result => result.error && ["42P01", "PGRST205"].includes(result.error.code));
  results.filter(result => result.error && !["42P01", "PGRST205"].includes(result.error.code)).forEach(result => checkDatabase(result.error));
  const rows = (messageResult.data ?? []) as unknown as (MessageRow & { acknowledgement_required: boolean })[];
  // Who acknowledged each instruction and when, and whether each inspection result has come back.
  const listed = rows.map(item => item.id);
  const daily = (handoverResult.data ?? []) as unknown as HandoverRow[];
  const none = { data: [], error: null };
  const [acks, qaResults, members, withdrawals, changes] = listed.length && !unavailable ? await Promise.all([
    supabase.from("supervisor_office_acknowledgements").select("id,item_id,actor_id,acknowledged_at").in("item_id", listed),
    supabase.from("supervisor_qa_submissions").select("id,item_id,has_issues").in("item_id", listed),
    supabase.from("organisation_members").select("user_id,display_name"),
    supabase.from("supervisor_office_item_withdrawals").select("*").in("item_id", listed),
    supabase.from("supervisor_office_items").select("id,replaces_id,title").in("replaces_id", listed),
  ]) : [none, none, none, none, none];
  [acks, qaResults, members].forEach(result => checkDatabase(result.error));
  // Reviews, withdrawals and changes need their own reviewed migration; until then the page works as before.
  const missing = (error: { code?: string } | null) => !!error && ["42P01", "PGRST205", "42703"].includes(error.code ?? "");
  const resultIds = ((qaResults.data ?? []) as { id: string }[]).map(row => row.id), handoverIds = daily.map(row => row.id);
  const reviews = !unavailable && (resultIds.length || handoverIds.length) ? await supabase.from("office_reviews").select("*")
    .or([resultIds.length ? `qa_submission_id.in.(${resultIds.join(",")})` : "", handoverIds.length ? `handover_id.in.(${handoverIds.join(",")})` : ""].filter(Boolean).join(",")) : none;
  const followUp = !unavailable && ![withdrawals, changes, reviews].some(result => missing(result.error));
  if (followUp) [withdrawals, changes, reviews].forEach(result => checkDatabase(result.error));
  const reviewRows = followUp ? (reviews.data ?? []) as OfficeReview[] : [];
  const nameOf = new Map(((members.data ?? []) as { user_id: string; display_name: string }[]).map(row => [row.user_id, row.display_name]));
  const time = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;
  const status = (item: (typeof rows)[number]) => {
    const withdrawal = followUp ? ((withdrawals.data ?? []) as OfficeWithdrawal[]).find(row => row.item_id === item.id) : undefined;
    if (withdrawal) return `Withdrawn by ${withdrawal.withdrawn_by_name} at ${time(withdrawal.withdrawn_at)}: ${withdrawal.reason}`;
    const replacement = followUp ? ((changes.data ?? []) as { id: string; replaces_id: string; title: string }[]).find(row => row.replaces_id === item.id) : undefined;
    if (replacement) return `Changed: replaced by “${replacement.title}”`;
    if (item.kind === "qa_request") {
      const result = ((qaResults.data ?? []) as { id: string; item_id: string; has_issues: boolean }[]).find(row => row.item_id === item.id);
      if (!result) return `Waiting for ${item.recipient_name ?? "the supervisor"} to send the result`;
      const review = reviewRows.find(row => row.qa_submission_id === result.id);
      return `Result sent: ${result.has_issues ? "problems found" : "no problems found"}${followUp ? ` · ${review ? reviewLine(review, time) : "Not reviewed yet"}` : ""}`;
    }
    const done = ((acks.data ?? []) as { id: string; item_id: string; actor_id: string; acknowledged_at: string }[]).filter(row => row.item_id === item.id);
    if (done.length) return done.map(row => `Acknowledged by ${nameOf.get(row.actor_id) ?? "a supervisor"} at ${time(row.acknowledged_at)}`).join("; ");
    return item.acknowledgement_required ? `Waiting for ${item.recipient_name ?? "a supervisor"} to acknowledge` : "No acknowledgement asked for";
  };
  const total = messageResult.count ?? 0;
  const pageHref = (next: number) => { const params = new URLSearchParams(); if (contractId) params.set("contract_id", contractId); params.set("page", String(next)); return `/admin/messages?${params}`; };
  return <>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Messages and handovers</h1><p className={styles.description}>Instructions, inspection requests and permanent site handovers from your authorised jobs.</p></div></div>
    <form method="get" className={styles.search}><label>Job<select name="contract_id" defaultValue={contractId}><option value="">All authorised jobs</option>{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.reference} · {contract.name}</option>)}</select></label><button className={styles.secondaryButton} type="submit">Show messages</button></form>
    {unavailable ? <p className={styles.warning}>Saved office messages and handovers are unavailable until the reviewed daily-workflow migration is applied. Contact the site directly.</p> : <>
      <details className={styles.details}><summary>Send a message or request a check</summary><p>Choose the job to use its existing message form and assigned supervisor list.</p><div className={styles.cardList}>{contracts.filter(contract => !contractId || contract.id === contractId).map(contract => <Link key={contract.id} className={styles.contractCard} href={`/admin/supervisor/sites/${contract.id}/messages`}>{contract.reference} · {contract.name}</Link>)}</div>{!contracts.length && <p>No authorised jobs yet. <Link href="/admin/contracts/new">Create a job</Link> first.</p>}</details>
      <section className={styles.panel} aria-labelledby="saved-messages-heading"><h2 id="saved-messages-heading">Saved messages</h2><p className={styles.small}>{total} saved message{total === 1 ? "" : "s"} · Page {page + 1}.</p>
        <div className={styles.cardList}>{rows.map(item => <article key={item.id} className={styles.card}><p className={styles.eyebrow}>{item.contract.reference} · {item.contract.name}</p><h3>{item.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p><p className={styles.small}>{item.kind === "qa_request" ? "Inspection request" : item.urgent ? "Urgent site instruction" : "Site instruction"}{item.replaces_id ? " (changed version)" : ""} · {item.created_by_name} · {eventDate(item.created_at)}{item.recipient_name ? ` · For ${item.recipient_name}` : " · For the site"}{item.due_on ? ` · Needed by ${dayLabel(item.due_on)}` : ""}</p><p data-message-status=""><strong>{status(item)}</strong></p><div className={styles.rowActions}><Link className={styles.secondaryButton} href={item.kind === "qa_request" ? `/admin/supervisor/sites/${item.contract_id}/tasks/${item.id}` : `/admin/supervisor/sites/${item.contract_id}/messages#message-${item.id}`}>View {item.kind === "qa_request" ? "request and saved result" : "message and acknowledgements"}</Link><Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${item.contract_id}/activity`}>Job activity</Link></div></article>)}</div>
        {!rows.length && <p>No saved messages on this page.</p>}
        <nav className={`${styles.rowActions} ${styles.cardActions}`} aria-label="Message pages">{page > 0 && <Link className={styles.secondaryButton} href={pageHref(page - 1)}>Previous page</Link>}{(page + 1) * PAGE_SIZE < total && <Link className={styles.secondaryButton} href={pageHref(page + 1)}>Next page</Link>}</nav>
      </section>
      <section className={styles.panel} aria-labelledby="recent-handovers-heading"><h2 id="recent-handovers-heading">Recent handovers</h2><p className={styles.small}>Latest 20 saved handovers. Open the job’s messages for its earlier handovers.</p>
        {daily.map(record => <details key={record.id} id={`handover-${record.id}`} className={styles.details}><summary>{dayLabel(record.work_date)} · {record.contract.name} · {record.actor_name}</summary>{[["Work completed", record.work_completed], ["Outstanding problems", record.outstanding_problems], ["Materials needed", record.materials_needed], ["Areas awaiting attention", record.areas_awaiting_attention], ["Information for the office", record.office_notes]].filter(([, value]) => value).map(([label, value]) => <div key={label}><h3>{label}</h3><p style={{ whiteSpace: "pre-wrap" }}>{value}</p></div>)}<p className={styles.small}>Saved {eventDate(record.created_at)}</p>{followUp && (() => { const review = reviewRows.find(row => row.handover_id === record.id); return <p data-handover-status=""><strong>{review ? reviewLine(review, time) : "Not reviewed yet"}</strong></p>; })()}<Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${record.contract_id}/messages?handover=${record.id}#handover-${record.id}`}>{followUp && !reviewRows.some(row => row.handover_id === record.id) ? "Open the handover to review it" : "Open job messages and handovers"}</Link></details>)}
        {!daily.length && <p>No saved handovers in this scope.</p>}
      </section>
    </>}
    <Link className={styles.secondaryButton} href={`/admin/paperwork${contractId ? `?contract_id=${contractId}` : ""}`}>Job paperwork</Link>
  </>;
}
