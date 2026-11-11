import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { money } from "@/lib/operations/command-centre";
import { DailyForm } from "@/components/site/daily-form";
import { saveQuoteAction } from "@/app/admin/command-centre-actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const statusLabels: Record<string, string> = { draft: "Draft", sent: "Sent, awaiting a decision", accepted: "Accepted", declined: "Declined", expired: "Expired", withdrawn: "Withdrawn" };

/** Quotations: what has been priced, what is waiting for the customer and what was won or lost. Money access only. */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireFinancialActor();
  const params = await searchParams;
  const status = typeof params.status === "string" && statusLabels[params.status] ? params.status : "";
  const preset = { customer: typeof params.customer === "string" ? params.customer : "", tender: typeof params.tender === "string" ? params.tender : "" };
  const today = londonDate();
  let query = supabase.from("quotes").select("*").order("number", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const [quotes, customers, tenders] = await Promise.all([query, supabase.from("customers").select("id,name").eq("active", true).order("name"),
    supabase.from("tender_enquiries").select("id,reference,project,company").in("status", ["received", "reviewing", "pricing"]).order("received_at", { ascending: false })]);
  const unavailable = !!quotes.error && ["42P01", "PGRST205"].includes(quotes.error.code ?? "");
  if (!unavailable) [quotes, customers].forEach(r => checkDatabase(r.error));
  const rows = (quotes.data ?? []) as Row[];
  const names = new Map(((customers.data ?? []) as Row[]).map(c => [String(c.id), String(c.name)]));
  const open = rows.filter(q => q.status === "sent");
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Sales</p><h1 className={styles.title}>Quotations</h1>
      <p className={styles.description}>Prepare, send and follow up quotations; an accepted quotation is linked to its job. Use the estimator to work out a price.</p></div>
      <Link className={styles.secondaryButton} href="/admin/estimator">Estimator</Link></div>
    {unavailable ? <p className={styles.warning}>Quotations arrive with the latest database update, which is not applied yet.</p> : <>
      <div className={styles.metrics}>
        <div className={styles.metric}><span className={styles.metricLabel}>Awaiting a decision</span><strong className={styles.metricValue}>{open.length}</strong><span className={styles.small}>{money(open.reduce((s, q) => s + Number(q.value_net), 0))}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Follow-ups due</span><strong className={styles.metricValue}>{open.filter(q => q.follow_up_on && String(q.follow_up_on) <= today).length}</strong></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Won (listed)</span><strong className={styles.metricValue}>{rows.filter(q => q.status === "accepted").length}</strong></div>
      </div>
      <nav className={styles.rowActions} aria-label="Filter quotations">
        <Link className={styles.secondaryButton} href="/admin/quotes">All</Link>
        {Object.entries(statusLabels).map(([key, label]) => <Link key={key} className={styles.secondaryButton} href={`/admin/quotes?status=${key}`} aria-current={status === key ? "page" : undefined}>{label}</Link>)}
      </nav>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Quotation</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Value</th><th scope="col">Follow up</th></tr></thead>
        <tbody>{rows.map(q => <tr key={String(q.id)}><td><Link href={`/admin/quotes/${q.id}`}>{String(q.reference)} · {String(q.title)}</Link></td>
          <td>{names.get(String(q.customer_id)) ?? "—"}</td><td>{statusLabels[String(q.status)]}</td><td>{money(Number(q.value_net))}</td>
          <td style={q.status === "sent" && q.follow_up_on && String(q.follow_up_on) <= today ? { color: "#a3261b", fontWeight: 700 } : undefined}>{q.status === "sent" ? String(q.follow_up_on ?? "—") : "—"}</td></tr>)}</tbody>
      </table></div>
      {!rows.length && <p>No quotations{status ? " with this status" : " yet"}.</p>}
      <section className={styles.panel} id="new" aria-labelledby="new-quote"><h2 id="new-quote">Prepare a quotation</h2>
        <DailyForm action={saveQuoteAction} label="Create quotation">
          <input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>Title<input name="title" required maxLength={200} placeholder="For example, Hotel bathrooms phase 2" /></label>
          <div className={styles.formGrid}>
            <label className={styles.field}>Customer<select name="customer_id" defaultValue={preset.customer}><option value="">Not chosen yet</option>
              {((customers.data ?? []) as Row[]).map(c => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select></label>
            <label className={styles.field}>From tender enquiry<select name="tender_enquiry_id" defaultValue={preset.tender}><option value="">None</option>
              {((tenders.data ?? []) as Row[]).map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.reference)} · {String(t.project || t.company)}</option>)}</select></label>
            <label className={styles.field}>Value, excluding VAT (£)<input name="value_net" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" /></label>
            <label className={styles.field}>Estimated cost (£, optional)<input name="estimated_cost" inputMode="decimal" pattern="\d+(\.\d{1,2})?" /></label>
            <label className={styles.field}>Valid until<input type="date" name="valid_until" /></label>
            <label className={styles.field}>Follow up on<input type="date" name="follow_up_on" /></label>
          </div>
          <label className={styles.field}>Site address<input name="site_address" maxLength={500} /></label>
          <label className={styles.field}>Scope<textarea name="scope" maxLength={4000} rows={3} /></label>
        </DailyForm>
      </section>
    </>}
  </>;
}
