import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { money } from "@/lib/operations/command-centre";
import { eventDate } from "@/components/operations/format";
import { DailyForm } from "@/components/site/daily-form";
import { saveQuoteAction, setQuoteStatusAction } from "@/app/admin/command-centre-actions";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const statusLabels: Record<string, string> = { draft: "Draft", sent: "Sent, awaiting a decision", accepted: "Accepted", declined: "Declined", expired: "Expired", withdrawn: "Withdrawn" };

/** One quotation: its details, the decision and its history. */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireFinancialActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const quote = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (quote.error || !quote.data) notFound();
  const q = quote.data as Row;
  const [events, customers, contracts] = await Promise.all([
    supabase.from("quote_events").select("*").eq("quote_id", id).order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name").order("name"),
    supabase.from("contracts").select("id,reference,name").order("reference"),
  ]);
  [events, customers, contracts].forEach(r => checkDatabase(r.error));
  const editable = q.status === "draft" || q.status === "sent";
  const margin = q.estimated_cost !== null && Number(q.value_net) > 0 ? ((Number(q.value_net) - Number(q.estimated_cost)) / Number(q.value_net)) * 100 : null;
  // One status form, kept in place while the quotation is open, so its confirmation stays in view after saving.
  const next: [string, string][] = q.status === "draft" ? [["sent", "Sent to the customer"]]
    : q.status === "sent" ? [["accepted", "Accepted"], ["declined", "Declined"], ["expired", "Expired"], ["withdrawn", "Withdrawn"]] : [];
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}><Link href="/admin/quotes">Quotations</Link> · {statusLabels[String(q.status)]}</p>
      <h1 className={styles.title}>{String(q.reference)} · {String(q.title)}</h1>
      <p className={styles.description}>{money(Number(q.value_net))} excluding VAT{margin !== null ? ` · estimated margin ${margin.toFixed(1)}%` : ""}
        {q.contract_id ? <> · <Link href={`/admin/contracts/${q.contract_id}`}>open the job</Link></> : null}</p></div></div>
    <section className={styles.panel} aria-labelledby="quote-decision"><h2 id="quote-decision">Status</h2>
      <p>{q.issued_on ? `Sent ${String(q.issued_on)}` : "Not sent yet"}{q.valid_until ? ` · valid until ${String(q.valid_until)}` : ""}{q.follow_up_on && q.status === "sent" ? ` · follow up ${String(q.follow_up_on)}` : ""}
        {q.decided_on ? ` · decided ${String(q.decided_on)}` : ""}{q.decision_note ? ` · ${String(q.decision_note)}` : ""}</p>
      {editable && <DailyForm action={setQuoteStatusAction} label="Record the status">
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="quote_id" value={id} /><input type="hidden" name="version" value={String(q.version)} />
        <label className={styles.field}>New status<select name="status" defaultValue={next[0]?.[0]}>{next.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>Date<input type="date" name="on" /></label>
          {q.status === "draft" && <><label className={styles.field}>Follow up on<input type="date" name="follow_up_on" /></label>
            <label className={styles.field}>Valid until<input type="date" name="valid_until" /></label></>}
          {q.status === "sent" && <label className={styles.field}>Job it became (if accepted)<select name="contract_id" defaultValue=""><option value="">Not created yet</option>
            {((contracts.data ?? []) as Row[]).map(c => <option key={String(c.id)} value={String(c.id)}>{String(c.reference)} · {String(c.name)}</option>)}</select></label>}
        </div>
        <label className={styles.field}>Note (a reason is needed for declined or withdrawn)<input name="note" maxLength={1000} /></label>
      </DailyForm>}
    </section>
    {editable && <section className={styles.panel} aria-labelledby="quote-edit"><h2 id="quote-edit">Details</h2>
      <DailyForm action={saveQuoteAction} label="Save quotation">
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="quote_id" value={id} /><input type="hidden" name="version" value={String(q.version)} />
        <input type="hidden" name="tender_enquiry_id" value={String(q.tender_enquiry_id ?? "")} />
        <label className={styles.field}>Title<input name="title" required maxLength={200} defaultValue={String(q.title)} /></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>Customer<select name="customer_id" defaultValue={String(q.customer_id ?? "")}><option value="">Not chosen yet</option>
            {((customers.data ?? []) as Row[]).map(c => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select></label>
          <label className={styles.field}>Value, excluding VAT (£)<input name="value_net" required inputMode="decimal" defaultValue={String(q.value_net)} pattern="\d+(\.\d{1,2})?" /></label>
          <label className={styles.field}>Estimated cost (£)<input name="estimated_cost" inputMode="decimal" defaultValue={q.estimated_cost === null ? "" : String(q.estimated_cost)} pattern="\d+(\.\d{1,2})?" /></label>
          <label className={styles.field}>Valid until<input type="date" name="valid_until" defaultValue={String(q.valid_until ?? "")} /></label>
          <label className={styles.field}>Follow up on<input type="date" name="follow_up_on" defaultValue={String(q.follow_up_on ?? "")} /></label>
        </div>
        <label className={styles.field}>Site address<input name="site_address" maxLength={500} defaultValue={String(q.site_address ?? "")} /></label>
        <label className={styles.field}>Scope<textarea name="scope" maxLength={4000} rows={4} defaultValue={String(q.scope ?? "")} /></label>
      </DailyForm>
    </section>}
    <section className={styles.panel} aria-labelledby="quote-history"><h2 id="quote-history">History</h2>
      <ul className={styles.plainList}>{((events.data ?? []) as Row[]).map(e => <li key={String(e.id)}>{eventDate(String(e.created_at))} · {String(e.actor_name)} · {e.action === "status" ? `${statusLabels[String(e.from_status)] ?? e.from_status} → ${statusLabels[String(e.to_status)]}` : e.action === "create" ? "Created" : "Details changed"}{e.note ? ` · ${String(e.note)}` : ""}</li>)}</ul>
    </section>
  </>;
}
