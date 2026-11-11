import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { renderSummary } from "@/lib/notifications/render";
import { emailConfiguration, publicBaseUrl } from "@/lib/notifications/send";
import { eventDate } from "@/components/operations/format";
import { DailyForm } from "@/components/site/daily-form";
import { addRecipientAction, confirmRecipientAction, queueTestAction, retryNotificationAction, rotateDispatcherKeyAction, setDeliveryAction, updateRecipientAction } from "@/app/admin/command-centre-actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const statusLabels: Record<string, string> = { pending: "Waiting", sending: "Sending", sent: "Sent", failed: "Failed", dry_run: "Prepared, not sent (delivery off)", suppressed: "Not sent" };

/**
 * Email notifications (owner only): urgent alerts and the morning summary. Delivery stays off until a
 * recipient has received a test message and the owner switches it on. Every message is logged.
 */
export default async function NotificationsPage() {
  const { supabase, member } = await requireActor();
  if (member.role !== "owner") notFound();
  const [settings, recipients, outbox, members, preview] = await Promise.all([
    supabase.from("notification_settings").select("*").maybeSingle(),
    supabase.from("notification_recipients").select("*").order("created_at"),
    supabase.from("notification_outbox").select("id,kind,topic,email,subject,status,attempts,last_error,created_at,sent_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("organisation_members").select("user_id,display_name,role,active").eq("active", true).in("role", ["owner", "contracts_manager"]).order("display_name"),
    supabase.rpc("preview_morning_summary"),
  ]);
  if (settings.error && ["42P01", "PGRST205"].includes(settings.error.code ?? "")) {
    return <><h1 className={styles.title}>Email notifications</h1><p className={styles.warning}>Email notifications arrive with the latest database update, which is not applied yet.</p></>;
  }
  [settings, recipients, outbox, members].forEach(r => checkDatabase(r.error));
  const s = (settings.data ?? {}) as Row;
  const rows = (recipients.data ?? []) as Row[];
  const email = emailConfiguration();
  const envReady = { service: email.configured, key: !!process.env.NOTIFICATIONS_DISPATCH_TOKEN?.trim(), cron: !!process.env.CRON_SECRET?.trim() };
  const confirmed = rows.filter(r => r.active && r.confirmed_at).length;
  const candidates = ((members.data ?? []) as Row[]).filter(m => !rows.some(r => r.user_id === m.user_id && r.active));
  const summary = preview.error ? null : renderSummary(preview.data as Row, publicBaseUrl());
  const check = (ok: boolean, label: string, fix: string) => <li data-ready={ok ? "yes" : "no"}><strong>{ok ? "✓" : "✗"}</strong> {label}{ok ? "" : ` — ${fix}`}</li>;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Administration</p><h1 className={styles.title}>Email notifications</h1>
      <p className={styles.description}>Urgent alerts (safety stops, critical defects, urgent site problems and decisions) and a morning summary at 7:00. Only owners and contracts managers can receive them; money appears only for someone with money access.</p></div></div>

    <section className={styles.panel} aria-labelledby="readiness"><h2 id="readiness">Before anything is sent</h2>
      <ul className={styles.plainList}>
        {check(envReady.service, "Email service configured (RESEND_API_KEY and NOTIFICATIONS_FROM in the hosting settings)", "add them in Vercel, using a sender address on a domain verified with the email service")}
        {check(!!s.dispatcher_token_set_at, "Dispatcher key created", "create it below")}
        {check(envReady.key, "Dispatcher key added to the hosting settings (NOTIFICATIONS_DISPATCH_TOKEN)", "paste the key shown below into Vercel")}
        {check(envReady.cron, "Schedule protected (CRON_SECRET in the hosting settings)", "add a long random CRON_SECRET in Vercel")}
        {check(confirmed > 0, "At least one recipient confirmed with a test message", "send a test below and confirm it arrived")}
        {check(s.live === true, "Delivery switched on", "switch it on below once everything above is ticked")}
      </ul>
      <p className={styles.small}>Until delivery is switched on, every alert and summary is still prepared and logged below as “Prepared, not sent”, so you can see exactly what would go out.</p>
    </section>

    <section className={styles.panel} aria-labelledby="delivery"><h2 id="delivery">Delivery</h2>
      <DailyForm action={setDeliveryAction} label="Save delivery settings">
        <label className={styles.checkboxRow}><input type="checkbox" name="live" defaultChecked={s.live === true} />Send emails (switch on only when everything above is ticked)</label>
        <label className={styles.checkboxRow}><input type="checkbox" name="urgent_enabled" defaultChecked={s.urgent_enabled !== false} />Urgent alerts</label>
        <label className={styles.checkboxRow}><input type="checkbox" name="summary_enabled" defaultChecked={s.summary_enabled !== false} />Morning summary at 7:00</label>
      </DailyForm>
      <p className={styles.small}>At most {String(s.urgent_hourly_cap ?? 6)} urgent emails per person per hour; anything beyond that waits for the next summary. The same event is never emailed twice.</p>
    </section>

    <section className={styles.panel} aria-labelledby="recipients"><h2 id="recipients">Recipients</h2>
      <p className={styles.small}>Emails go only to the address each person signs in with.</p>
      <div className={styles.cardList}>{rows.map(r => <article key={String(r.id)} className={styles.card} data-recipient={String(r.email)}>
        <h3>{String(r.email)}</h3>
        <p className={styles.small}>{r.active ? "" : "Stopped · "}{r.confirmed_at ? `Confirmed ${eventDate(String(r.confirmed_at))}` : r.test_sent_at ? "Test sent: check it arrived, then confirm" : "Not confirmed: send a test first"}</p>
        <div className={styles.rowActions}>
          <DailyForm action={queueTestAction} label="Send a test message"><input type="hidden" name="recipient_id" value={String(r.id)} /></DailyForm>
          {!r.confirmed_at && !!r.test_sent_at && <DailyForm action={confirmRecipientAction} label="It arrived: confirm this mailbox"><input type="hidden" name="recipient_id" value={String(r.id)} /></DailyForm>}
        </div>
        <details className={styles.details}><summary>Change</summary>
          <DailyForm action={updateRecipientAction} label="Save">
            <input type="hidden" name="recipient_id" value={String(r.id)} />
            <label className={styles.checkboxRow}><input type="checkbox" name="urgent" defaultChecked={r.urgent === true} />Urgent alerts</label>
            <label className={styles.checkboxRow}><input type="checkbox" name="summary" defaultChecked={r.summary === true} />Morning summary</label>
            <label className={styles.checkboxRow}><input type="checkbox" name="active" defaultChecked={r.active === true} />Receives emails</label>
          </DailyForm>
        </details>
      </article>)}</div>
      {candidates.length > 0 && <details className={styles.details} open={!rows.length}><summary>Add a recipient</summary>
        <DailyForm action={addRecipientAction} label="Add recipient">
          <label className={styles.field}>Person<select name="user_id" required>{candidates.map(m => <option key={String(m.user_id)} value={String(m.user_id)}>{String(m.display_name)} ({m.role === "owner" ? "owner" : "contracts manager"})</option>)}</select></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="urgent" defaultChecked />Urgent alerts</label>
          <label className={styles.checkboxRow}><input type="checkbox" name="summary" defaultChecked />Morning summary</label>
        </DailyForm>
      </details>}
    </section>

    <section className={styles.panel} aria-labelledby="dispatcher"><h2 id="dispatcher">Dispatcher key</h2>
      <p className={styles.small}>{s.dispatcher_token_set_at ? `Created ${eventDate(String(s.dispatcher_token_set_at))}. Creating a new key stops the old one working.` : "Not created yet."} The key is shown once; only a fingerprint is stored.</p>
      <DailyForm action={rotateDispatcherKeyAction} label={s.dispatcher_token_set_at ? "Create a new key" : "Create the key"}><span /></DailyForm>
    </section>

    {summary && <section className={styles.panel} aria-labelledby="preview"><h2 id="preview">This morning's summary, as you would receive it</h2>
      <iframe title="Morning summary preview" srcDoc={summary.html} sandbox="" style={{ width: "100%", minHeight: 520, border: "1px solid var(--admin-line)", borderRadius: 8 }} />
    </section>}

    <section className={styles.panel} aria-labelledby="log"><h2 id="log">Delivery log</h2>
      {((outbox.data ?? []) as Row[]).length === 0 ? <p>Nothing has been prepared yet.</p>
      : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Prepared</th><th scope="col">Kind</th><th scope="col">To</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col"></th></tr></thead>
        <tbody>{((outbox.data ?? []) as Row[]).map(o => <tr key={String(o.id)} data-outbox-status={String(o.status)}><td>{eventDate(String(o.created_at))}</td><td>{String(o.kind)}</td><td>{String(o.email)}</td>
          <td>{String(o.subject)}</td><td>{statusLabels[String(o.status)] ?? String(o.status)}{Number(o.attempts) > 1 ? ` · ${o.attempts} attempts` : ""}{o.last_error ? ` · ${String(o.last_error)}` : ""}</td>
          <td>{["failed", "suppressed"].includes(String(o.status)) && <DailyForm action={retryNotificationAction} label="Retry"><input type="hidden" name="outbox_id" value={String(o.id)} /></DailyForm>}</td></tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
