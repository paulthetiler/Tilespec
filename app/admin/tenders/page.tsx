import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { DailyForm } from "@/components/site/daily-form";
import { setTenderStatusAction } from "@/app/admin/command-centre-actions";
import { rotateEnquiryRetryKeyAction, sendEnquiryAlertAction } from "./actions";
import { AUTOMATIC_ATTEMPTS, enquiryRecipient } from "@/lib/notifications/enquiry";
import { emailConfiguration } from "@/lib/notifications/send";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { received: "Received", reviewing: "Reviewing", pricing: "Pricing", submitted: "Submitted", won: "Won", lost: "Lost", declined: "Declined to price" };
const open = ["received", "reviewing", "pricing"];
type Alert = { id: string; enquiry_id: string; status: string; attempts: number; next_attempt_at: string; claimed_at: string | null; recipient: string | null; sent_at: string | null; last_error: string | null };
const londonTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) : "");
const missingTable = (code?: string) => ["42P01", "PGRST205", "42501"].includes(code ?? "");

/** One line about the office's email alert for an enquiry, and whether it can be sent now. */
function alertSummary(alert: Alert | undefined): { text: string; canSend: boolean; tone?: "warning" } | null {
  if (!alert) return null;
  const stale = alert.status === "sending" && !!alert.claimed_at && Date.now() - new Date(alert.claimed_at).getTime() > 10 * 60_000;
  if (alert.status === "sent") return { text: `Email alert sent to ${alert.recipient ?? "the office"} · ${londonTime(alert.sent_at)}`, canSend: false };
  if (alert.status === "sending") return stale ? { text: "Email alert attempt did not finish; it will be retried", canSend: true, tone: "warning" } : { text: "Email alert being sent", canSend: false };
  if (alert.status === "failed") return { text: `Email alert NOT sent after ${alert.attempts} attempt${alert.attempts === 1 ? "" : "s"}${alert.last_error ? `: ${alert.last_error}` : ""}`, canSend: true, tone: "warning" };
  if (alert.attempts === 0) return { text: "Email alert waiting to be sent", canSend: true };
  return { text: `Email alert not sent yet (${alert.attempts} of ${AUTOMATIC_ATTEMPTS} automatic attempts; next ${londonTime(alert.next_attempt_at)})${alert.last_error ? `: ${alert.last_error}` : ""}`, canSend: true, tone: "warning" };
}

/** Tender enquiries from the website, tracked from receipt to submission and outcome. Files are private and expire after five minutes. */
export default async function TenderInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (member.role !== "owner" && member.role !== "contracts_manager") return <p>Not authorised to view tender enquiries.</p>;
  // Read in the signed-in person's own session: only the owner and contracts managers are allowed
  // to see enquiries and their files. No service key is used.
  const params = await searchParams;
  // The link in an enquiry's email alert opens that one enquiry, whatever its status.
  const reference = typeof params.ref === "string" && /^TS-[0-9A-F]{8}$/.test(params.ref) ? params.ref : null;
  const filter = typeof params.status === "string" && (params.status === "closed" || statusLabels[params.status]) ? params.status : "open";
  const wanted = filter === "open" ? open : filter === "closed" ? ["submitted", "won", "lost", "declined"] : [filter];
  const query = supabase.from("tender_enquiries").select("id,reference,kind,name,company,email,project,deadline,message,status,attachments,received_at");
  const { data, error } = await (reference ? query.eq("reference", reference).neq("status", "uploading") : query.in("status", wanted))
    .order("deadline", { ascending: true, nullsFirst: false }).order("received_at", { ascending: false }).limit(100);
  if (error) return <p>Tender inbox unavailable. Please try again shortly.</p>;
  // Email alerts arrive with their own database update; until it is applied there is nothing to show.
  const ids = (data || []).map(e => e.id as string);
  const [alertRows, settings] = await Promise.all([
    ids.length ? supabase.from("enquiry_notifications").select("id,enquiry_id,status,attempts,next_attempt_at,claimed_at,recipient,sent_at,last_error").in("enquiry_id", ids)
      : Promise.resolve({ data: [] as Alert[], error: null }),
    member.role === "owner" ? supabase.from("enquiry_notification_settings").select("retry_key_set_at").maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const alertsInstalled = !alertRows.error && !(settings.error && missingTable(settings.error.code));
  const alerts = new Map(((alertRows.data ?? []) as Alert[]).map(a => [a.enquiry_id, a]));
  const entries = await Promise.all((data || []).map(async e => {
    const documents = await Promise.all(((e.attachments || []) as { name: string; path: string }[]).map(async f => {
      const { data: link } = await supabase.storage.from("tilespec-tenders").createSignedUrl(f.path, 300);
      return { name: f.name, url: link?.signedUrl || "" };
    }));
    return { ...e, documents };
  }));
  const financial = canReadFinancial(member);
  const email = emailConfiguration();
  const retry = { key: !!process.env.ENQUIRY_NOTIFICATIONS_KEY?.trim(), cron: !!process.env.CRON_SECRET?.trim(), created: (settings.data as { retry_key_set_at?: string | null } | null)?.retry_key_set_at ?? null };
  const check = (ok: boolean, label: string, fix: string) => <li data-ready={ok ? "yes" : "no"}><strong>{ok ? "✓" : "✗"}</strong> {label}{ok ? "" : ` — ${fix}`}</li>;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>New business</p><h1 className={styles.title}>Tender enquiries</h1>
      <p className={styles.description}>Enquiries from the website, from receipt to pricing, submission and outcome. Files expire after five minutes; refresh to renew.</p></div>
      {financial && <Link className={styles.secondaryButton} href="/admin/quotes">Quotations</Link>}</div>
    {member.role === "owner" && <details className={styles.details} open={!email.configured || undefined}><summary>Email alerts for new enquiries</summary>
      <section className={styles.panel} aria-labelledby="enquiry-alerts">
        <h2 id="enquiry-alerts">Email alerts for new enquiries</h2>
        {!alertsInstalled ? <p className={styles.warning}>Email alerts arrive with the latest database update, which is not applied yet. Enquiries are still received and listed here.</p> : <>
          <p className={styles.small}>Every enquiry is emailed to <strong>{enquiryRecipient()}</strong> once it and all its documents have arrived. The email links here; documents are never attached or linked.</p>
          <ul className={styles.plainList}>
            {check(email.configured, `Email service configured (RESEND_API_KEY and NOTIFICATIONS_FROM in the hosting settings)${email.configured && email.from ? `: sending as ${email.from}` : ""}`, "add them in Vercel, using a sender address on a domain verified with the email service")}
            {check(!!retry.created, `Retry key created${retry.created ? ` ${londonTime(retry.created)}` : ""}`, "create it below")}
            {check(retry.key, "Retry key added to the hosting settings (ENQUIRY_NOTIFICATIONS_KEY)", "paste the key shown below into Vercel, then redeploy")}
            {check(retry.cron, "Retry schedule protected (CRON_SECRET in the hosting settings)", "add a long random CRON_SECRET in Vercel, then redeploy")}
          </ul>
          <p className={styles.small}>An alert that cannot be sent straight away is retried every few minutes, then hourly, for about a day and a half when the three retry items are ticked, and can always be sent from its enquiry below.</p>
          <DailyForm action={rotateEnquiryRetryKeyAction} label={retry.created ? "Create a new retry key" : "Create the retry key"}><span /></DailyForm>
        </>}
      </section>
    </details>}
    {reference && <p className={styles.small}>Showing enquiry {reference}. <Link href="/admin/tenders">Show all open enquiries</Link></p>}
    <nav className={styles.rowActions} aria-label="Filter enquiries">
      {[["open", "Open"], ["closed", "Submitted and decided"], ...Object.entries(statusLabels)].map(([key, label]) =>
        <Link key={key} className={styles.secondaryButton} href={`/admin/tenders?status=${key}`} aria-current={filter === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <section className={styles.panel}>{entries.length === 0 ? <p>{reference ? `No received enquiry has the reference ${reference}.` : `No enquiries ${filter === "open" ? "are open" : "with this status"}.`}</p> : entries.map(e => { const alert = alerts.get(e.id), summary = alertSummary(alert); return <article key={e.id} id={`tender-${e.id}`} style={{ padding: "20px 0", borderBottom: "1px solid #dce4e6" }}>
      <p className={styles.eyebrow}>{statusLabels[e.status] ?? e.status}{e.deadline ? ` · return by ${e.deadline}` : ""}</p>
      <strong>{e.reference} · {e.project || "General enquiry"}</strong><p>{e.company || e.name} · {e.email}</p>
      <p>Submitted: {e.received_at ? new Date(e.received_at).toLocaleString("en-GB") : "Not confirmed"}</p>
      {summary && <p className={summary.tone === "warning" ? styles.warning : styles.small} data-alert-status={alert?.status}>{summary.text}</p>}
      {e.message && <p style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>}
      {e.documents.length > 0 && <div><strong>Documents</strong><ul>{e.documents.map((f, i) => <li key={i}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name + " (temporarily unavailable)"}</li>)}</ul></div>}
      <div className={styles.rowActions}>
        {financial && open.includes(e.status) && <Link className={styles.secondaryButton} href={`/admin/quotes?tender=${e.id}#new`}>Prepare a quotation</Link>}
        {alert && summary?.canSend && <details className={styles.details}><summary>Send the email alert now</summary>
          <DailyForm action={sendEnquiryAlertAction} label={`Send to ${enquiryRecipient()}`}><input type="hidden" name="notification_id" value={alert.id} /></DailyForm>
        </details>}
        <details className={styles.details}><summary>Change status</summary>
          <DailyForm action={setTenderStatusAction} label="Save status">
            <input type="hidden" name="tender_id" value={e.id} />
            <label className={styles.field}>Status<select name="status" defaultValue={e.status === "received" ? "reviewing" : e.status}>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className={styles.field}>Note (a reason is needed for declined or lost)<input name="note" maxLength={1000} /></label>
          </DailyForm>
        </details>
      </div>
    </article>; })}</section>
  </>;
}
