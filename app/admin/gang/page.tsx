import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { gangNextStep, gangStatusLabel, gangStatusTone, quantityText } from "@/lib/operations/gang-invoices";
import { calendarDate, money } from "@/components/operations/format";
import { OperationsForm } from "@/components/operations/operations-form";
import { ClaimPhotoForm, FinishUploadForm } from "@/components/gang/invoice-form";
import { addClaimPhotoAction, answerGangQueryAction, cancelGangInvoiceAction, finishGangUploadAction } from "./actions";
import styles from "../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";

type Line = { area: string; unit: string; claimed: number; verified: number | null; approved: number | null };
type Event = { at: string; action: string; by: string; note: string | null; to_status: string | null };
type Invoice = {
  id: string; reference: string; status: string; job: string; team: string; submitted_at: string; workmanship: string | null; correction_note: string | null;
  invoice_number: string | null; invoice_total: number | null; payment_due_on: string | null; approved_amount: number | null; paid_on: string | null; paid_amount: number | null;
  replaces: string | null; lines: Line[]; events: Event[];
};
const needsYou = ["uploading", "query_gang", "returned"];
const inProgress = ["awaiting_check", "with_office"];
const settled = ["approved", "paid"];
const dateTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const tone = gangStatusTone(invoice.status, invoice.workmanship);
  const lastQuestion = [...invoice.events].reverse().find(e => e.action === "query_gang" || e.action === "returned" || e.action === "rejected");
  return <li className={css.card}>
    <div className={css.cardHead}>
      <h3>{invoice.reference}{invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}</h3>
      <span className={`${css.status} ${css[tone]}`}>{gangStatusLabel(invoice.status, invoice.workmanship)}</span>
    </div>
    <p className={styles.muted} style={{ margin: 0 }}>{invoice.job} · {invoice.team}</p>
    {gangNextStep(invoice.status) && <p style={{ margin: "8px 0" }}>{gangNextStep(invoice.status)}</p>}
    {lastQuestion?.note && ["query_gang", "returned", "rejected"].includes(invoice.status) && <p className={styles.warning}><strong>Office:</strong> {lastQuestion.note}</p>}
    {invoice.workmanship === "correction_needed" && invoice.correction_note && <p className={styles.warning}><strong>Correction needed:</strong> {invoice.correction_note}</p>}
    <table className={css.compare}><thead><tr><th>Work area</th><th className={css.num}>Claimed</th><th className={css.num}>Checked</th>{invoice.lines.some(l => l.approved !== null) && <th className={css.num}>Approved</th>}</tr></thead>
      <tbody>{invoice.lines.map((l, i) => <tr key={i}><td>{l.area}</td><td className={css.num}>{quantityText(l.claimed, l.unit)}</td><td className={css.num}>{quantityText(l.verified, l.unit)}</td>
        {invoice.lines.some(x => x.approved !== null) && <td className={css.num}>{quantityText(l.approved, l.unit)}</td>}</tr>)}</tbody></table>
    <dl className={css.facts}>
      <dt>Sent</dt><dd>{dateTime(invoice.submitted_at)}</dd>
      {invoice.invoice_total !== null && <><dt>Your invoice total</dt><dd className={css.money}>{money(Number(invoice.invoice_total))}</dd></>}
      {invoice.payment_due_on && !["rejected", "cancelled", "superseded"].includes(invoice.status) && <><dt>{invoice.status === "paid" ? "Due date was" : "Payment due"}</dt><dd>{calendarDate(invoice.payment_due_on)}</dd></>}
      {invoice.approved_amount !== null && <><dt>Approved</dt><dd className={css.money}>{money(Number(invoice.approved_amount))}</dd></>}
      {invoice.paid_on && <><dt>Paid</dt><dd className={css.money}>{money(Number(invoice.paid_amount))} on {calendarDate(invoice.paid_on)}</dd></>}
      {invoice.replaces && <><dt>Replaces</dt><dd>{invoice.replaces}</dd></>}
    </dl>
    {invoice.status === "uploading" && <FinishUploadForm action={finishGangUploadAction} invoiceId={invoice.id} />}
    {invoice.status === "query_gang" && <OperationsForm action={answerGangQueryAction} submitLabel="Send answer" compact>
      <input type="hidden" name="invoice_id" value={invoice.id} />
      <label className={styles.field}>Your answer<textarea name="note" rows={2} maxLength={2000} required /></label>
    </OperationsForm>}
    <div className={css.actionsRow}>
      {invoice.status === "returned" && <Link className={styles.button} href={`/admin/gang/new?replaces=${invoice.id}`}>Send corrected invoice</Link>}
    </div>
    {!["paid", "rejected", "cancelled", "superseded"].includes(invoice.status) && <details><summary>Add a photo of the work</summary>
      <ClaimPhotoForm action={addClaimPhotoAction} invoiceId={invoice.id} />
    </details>}
    {["uploading", "awaiting_check", "query_gang", "returned"].includes(invoice.status) && <details><summary>Withdraw this invoice</summary>
      <OperationsForm action={cancelGangInvoiceAction} submitLabel="Withdraw invoice" compact>
        <input type="hidden" name="invoice_id" value={invoice.id} />
        <label className={styles.field}>Reason (optional)<input name="reason" maxLength={500} /></label>
      </OperationsForm>
    </details>}
    <details><summary>History</summary>
      <ul className={css.history}>{invoice.events.map((e, i) => <li key={i}><time>{dateTime(e.at)} · {e.by}</time>{e.note ?? gangStatusLabel(e.to_status ?? "")}</li>)}</ul>
    </details>
  </li>;
}

export default async function GangInvoices({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { supabase, member } = await requireActor();
  if (!["lead_installer", "subcontract_installer"].includes(member.role)) {
    return <div className={styles.empty}><h1 className={styles.title}>Gang invoices</h1><p>This page is for gangs sending their invoices. The office reviews them in <Link href="/admin/gang-invoices">Gang invoices</Link>.</p></div>;
  }
  const [jobs, invoices] = await Promise.all([supabase.rpc("my_gang_jobs"), supabase.rpc("my_gang_invoices")]);
  checkDatabase(jobs.error); checkDatabase(invoices.error);
  const list = (invoices.data ?? []) as Invoice[];
  const { sent } = await searchParams;
  const section = (title: string, statuses: string[], open = true) => {
    const rows = list.filter(i => statuses.includes(i.status));
    if (!rows.length) return null;
    const body = <ul className={css.cards}>{rows.map(i => <InvoiceCard key={i.id} invoice={i} />)}</ul>;
    return open ? <section><h2 className={css.sectionTitle}>{title}<span className={css.count}>{rows.length}</span></h2>{body}</section>
      : <details className={styles.panel}><summary><strong>{title} ({rows.length})</strong></summary>{body}</details>;
  };
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Hello, {firstName}</p><h1 className={styles.title}>Your invoices</h1>
      <p className={styles.description}>Send your invoice and the quantity you have done. The supervisor checks the work, then the office approves payment.</p></div></div>
    {typeof sent === "string" && sent && <p className={styles.success} role="status">Invoice {sent} sent. The site supervisor has been asked to check the work.</p>}
    {(jobs.data ?? []).length > 0 ? <Link className={css.bigAction} href="/admin/gang/new">Send an invoice</Link>
      : <p className={styles.empty}>Your gang is not set up on a job yet. Ask the office to add your gang to the job.</p>}
    {list.length === 0 && <p className={styles.muted}>You have not sent any invoices yet.</p>}
    {section("Needs you", needsYou)}
    {section("Being checked", inProgress)}
    {section("Approved and paid", settled)}
    {section("Closed", ["rejected", "cancelled", "superseded"], false)}
    <p className={styles.muted} style={{ marginTop: 24 }}><Link href="/admin/snags">Fixes assigned to you</Link> · <Link href="/admin/holds">Work restrictions</Link></p>
  </>;
}
