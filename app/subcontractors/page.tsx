import Link from "next/link";
import { FileSignature, FilePlus2, FileUp, ChevronRight } from "lucide-react";
import { loadPortal } from "@/lib/subcontractors/portal";
import { cisLabels, portalNextStep, portalStatusLabel, type PortalInvoice } from "@/lib/subcontractors/claim";
import { quantityText } from "@/lib/operations/gang-invoices";
import { PortalForm } from "@/components/subcontractors/portal-form";
import { answerQueryAction, cancelInvoiceAction, leavePortalAction } from "./actions";
import css from "@/components/subcontractors/portal.module.css";

const pounds = (value: number | null | undefined) => value === null || value === undefined ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value));
const day = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(new Date(iso)) : "";
const tone = (status: string) => status === "approved" || status === "paid" ? css.good : ["query_gang", "returned", "uploading"].includes(status) ? css.warn
  : ["rejected", "cancelled", "superseded"].includes(status) ? css.closed : css.wait;

function Choices({ signedIn, canInvoice, generator, agreementWaiting }: { signedIn: boolean; canInvoice: boolean; generator: boolean; agreementWaiting: boolean }) {
  const item = (href: string, icon: React.ReactNode, title: string, detail: string, on: boolean, primary = false) => on
    ? <Link href={href} className={`${css.choice}${primary ? ` ${css.choicePrimary}` : ""}`}><span className={css.choiceIcon}>{icon}</span><span><strong>{title}</strong><span>{detail}</span></span><ChevronRight aria-hidden="true" /></Link>
    : <div className={`${css.choice} ${css.choiceOff}`} aria-disabled="true"><span className={css.choiceIcon}>{icon}</span><span><strong>{title}</strong><span>{detail}</span></span><span /></div>;
  return <nav className={css.choices} aria-label="What would you like to do?">
    {item("/subcontractors/invoice", <FilePlus2 aria-hidden="true" />, "Generate an invoice", !signedIn ? "We fill in your rates. You enter what you have done."
      : !canInvoice ? "Sign your agreement first." : generator ? "We fill in your rates. You enter what you have done." : "Not available for you yet. Upload your own invoice instead.",
      signedIn && canInvoice && generator, !agreementWaiting)}
    {item("/subcontractors/upload", <FileUp aria-hidden="true" />, "Upload an existing invoice", !signedIn || canInvoice ? "Already made your own invoice? Send a PDF or a photo." : "Sign your agreement first.", signedIn && canInvoice)}
    {item("/subcontractors/agreement", <FileSignature aria-hidden="true" />, "Review and sign subcontractor agreement", agreementWaiting ? "Waiting for your signature." : "Read your agreement with TileSPEC.", signedIn, agreementWaiting)}
  </nav>;
}

function InvoiceCard({ invoice }: { invoice: PortalInvoice }) {
  const question = [...invoice.events].reverse().find(e => ["query_gang", "returned", "rejected"].includes(e.action));
  const p = invoice.payment;
  return <li className={css.card}>
    <div className={css.cardHead}>
      <h3>Invoice {invoice.invoice_number ?? invoice.reference}</h3>
      <span className={`${css.status} ${tone(invoice.status)}`}>{portalStatusLabel(invoice.status, invoice.workmanship)}</span>
    </div>
    <p className={css.muted}>{invoice.job} · sent {day(invoice.submitted_at)} · reference {invoice.reference}</p>
    {portalNextStep(invoice.status) && <p>{portalNextStep(invoice.status)}</p>}
    {question?.note && ["query_gang", "returned", "rejected"].includes(invoice.status) && <p className={`${css.notice} ${css.attention}`}><strong>TileSPEC says:</strong> {question.note}</p>}
    {invoice.workmanship === "correction_needed" && invoice.correction_note && <p className={`${css.notice} ${css.attention}`}><strong>Correction needed on site:</strong> {invoice.correction_note}</p>}
    <dl className={css.facts}>
      {invoice.invoice_total !== null && <><dt>Invoice amount</dt><dd>{pounds(invoice.invoice_total)}</dd></>}
      {invoice.approved_amount !== null && <><dt>Approved</dt><dd>{pounds(invoice.approved_amount)}</dd></>}
      {p && p.retention > 0 && <><dt>Retention held ({p.retention_percent}%)</dt><dd>− {pounds(p.retention)}</dd></>}
      {p && p.vat > 0 && <><dt>VAT</dt><dd>+ {pounds(p.vat)}</dd></>}
      {p && <><dt>CIS tax ({p.cis_rate}%)</dt><dd>{p.cis > 0 ? `− ${pounds(p.cis)}` : "None"}</dd></>}
      {p && <><dt>Payment</dt><dd>{pounds(p.payable)}</dd></>}
      {invoice.payment_due_on && !["rejected", "cancelled", "superseded", "paid"].includes(invoice.status) && <><dt>Payment date</dt><dd>{day(invoice.payment_due_on)}</dd></>}
      {invoice.paid_on && <><dt>Paid</dt><dd>{pounds(invoice.paid_amount)} on {day(invoice.paid_on)}</dd></>}
    </dl>
    {p && p.adjustment !== 0 && <p className={css.muted}>Includes an adjustment of {pounds(p.adjustment)}: {p.adjustment_reason}</p>}
    <details><summary>What was claimed and checked</summary>
      <table className={css.rows}><thead><tr><th>Work</th><th className={css.num}>Claimed</th><th className={css.num}>Checked</th></tr></thead><tbody>
        {invoice.lines.map((l, i) => <tr key={i}><td>{l.area}</td><td className={css.num}>{quantityText(l.claimed, l.unit)}</td><td className={css.num}>{quantityText(l.approved ?? l.verified, l.unit)}</td></tr>)}
        {invoice.extras.map((e, i) => <tr key={`e${i}`}><td>{e.kind === "additional" ? "Additional work (not yet approved): " : e.kind === "day_rate" ? "Day rate: " : ""}{e.description}</td>
          <td className={css.num}>{e.kind === "day_rate" ? `${e.quantity} ${e.unit}${e.quantity === 1 ? "" : "s"}` : pounds(e.amount)}</td>
          <td className={css.num}>{e.approved_amount !== null ? pounds(e.approved_amount) : e.confirmed === null ? "—" : e.kind === "day_rate" ? `${e.confirmed} ${e.unit}${e.confirmed === 1 ? "" : "s"}` : e.confirmed > 0 ? "Confirmed" : "Not confirmed"}</td></tr>)}
      </tbody></table>
    </details>
    {invoice.status === "query_gang" && <PortalForm action={answerQueryAction} submitLabel="Send my answer">
      <input type="hidden" name="invoice_id" value={invoice.id} />
      <label className={css.field}>Your answer<textarea name="note" rows={3} maxLength={2000} required /></label>
    </PortalForm>}
    {invoice.status === "returned" && <Link className={css.button} href={`/subcontractors/${invoice.source === "generated" ? "invoice" : "upload"}?replaces=${invoice.id}`}>Send a corrected invoice</Link>}
    {invoice.source === "generated" && invoice.has_document && <a className={`${css.secondary} ${css.small}`} href={`/subcontractors/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">Open my invoice (PDF)</a>}
    {["uploading", "awaiting_check", "query_gang", "returned"].includes(invoice.status) && <details><summary>Withdraw this invoice</summary>
      <PortalForm action={cancelInvoiceAction} submitLabel="Withdraw invoice" tone="danger" pendingLabel="Withdrawing…">
        <input type="hidden" name="invoice_id" value={invoice.id} />
        <label className={css.field}>Why? (optional)<input name="reason" maxLength={500} /></label>
      </PortalForm></details>}
  </li>;
}

export default async function SubcontractorPortal({ searchParams }: { searchParams: Promise<{ link?: string; left?: string }> }) {
  const [portal, query] = await Promise.all([loadPortal(), searchParams]);
  if ("problem" in portal) {
    const expired = portal.problem === "expired" || query.link === "expired";
    return <>
      <div><p className={css.eyebrow}>TileSPEC subcontractors</p><h1 className={css.title}>Subcontractor portal</h1>
        <p className={css.lead}>Send your invoice and sign your agreement. No account or password is needed.</p></div>
      {query.left === "1" && <p className={css.success} role="status">You have left the portal on this device. Open your link again whenever you need it.</p>}
      {portal.problem === "unavailable" || query.link === "unavailable" ? <p className={css.error} role="alert">The portal cannot be reached at the moment. Please try again in a few minutes.</p>
        : expired ? <p className={css.error} role="alert">That link has expired or been withdrawn. Ask the TileSPEC office to send you a new one.</p> : null}
      <section className={`${css.notice}${expired ? "" : ` ${css.attention}`}`}>
        <strong>Open the personal link TileSPEC sent you</strong>
        <span>To keep your details private, the portal opens from your own secure link, sent to you by text or email. Tap that link to continue. If you have not got one, or it has stopped working, call the office on <a href="tel:+443333393445">0333 339 3445</a>.</span>
      </section>
      <Choices signedIn={false} canInvoice={false} generator={false} agreementWaiting={false} />
    </>;
  }
  const { session } = portal;
  const first = session.subcontractor.issued_to.trim().split(/\s+/)[0] || "there";
  const waiting = session.agreement?.status === "issued";
  const needsYou = session.invoices.filter(i => ["query_gang", "returned"].includes(i.status));
  const open = session.invoices.filter(i => ["uploading", "awaiting_check", "with_office", "approved"].includes(i.status));
  const done = session.invoices.filter(i => ["paid", "rejected", "cancelled", "superseded"].includes(i.status));
  return <>
    <div><p className={css.eyebrow}>Hello, {first}</p><h1 className={css.title}>{session.subcontractor.name}</h1>
      <p className={css.lead}>What would you like to do?</p></div>
    {waiting && <Link href="/subcontractors/agreement" className={`${css.notice} ${css.attention}`}><strong>Your subcontractor agreement is waiting for your signature</strong>
      <span>Please read and sign it before sending an invoice. It takes a few minutes.</span></Link>}
    {!waiting && !session.agreement_signed && <p className={`${css.notice} ${css.attention}`}><strong>TileSPEC has not issued your agreement yet.</strong> <span>You will be able to send invoices once it has been issued and you have signed it. Call the office if you are waiting.</span></p>}
    {session.agreement_signed && session.jobs.length === 0 && <p className={`${css.notice} ${css.attention}`}>You are not set up on a job yet. Ask the TileSPEC office to add you to your job.</p>}
    {needsYou.length > 0 && <section aria-label="Needs you"><h2>Needs you</h2><ul className={css.cards}>{needsYou.map(i => <InvoiceCard key={i.id} invoice={i} />)}</ul></section>}
    <Choices signedIn canInvoice={session.can_invoice && session.jobs.length > 0} generator={session.generator.allowed} agreementWaiting={waiting} />
    {session.can_invoice && !session.generator.allowed && session.generator.reason && <p className={css.muted}>{session.generator.reason}</p>}
    {open.length > 0 && <section aria-label="Invoices in progress" className={css.form}><h2>In progress</h2><ul className={css.cards}>{open.map(i => <InvoiceCard key={i.id} invoice={i} />)}</ul></section>}
    {done.length > 0 && <details className={css.panel}><summary>Paid and closed invoices ({done.length})</summary><ul className={css.cards}>{done.map(i => <InvoiceCard key={i.id} invoice={i} />)}</ul></details>}
    <section className={css.panel} aria-label="Your details">
      <h2>Your details with TileSPEC</h2>
      <dl className={css.facts}>
        <dt>Business</dt><dd>{session.subcontractor.name}</dd>
        {session.subcontractor.address && <><dt>Address</dt><dd>{session.subcontractor.address}</dd></>}
        <dt>CIS</dt><dd>{cisLabels[session.subcontractor.cis_status] ?? session.subcontractor.cis_status}</dd>
        <dt>VAT</dt><dd>{session.subcontractor.vat_registered ? "Registered" : "Not registered"}</dd>
        <dt>Paid into</dt><dd>{session.subcontractor.bank_ending ? `Account ending ${session.subcontractor.bank_ending}` : "Not recorded yet"}</dd>
        <dt>Agreement</dt><dd>{session.agreement_signed ? "Signed" : waiting ? "Waiting for your signature" : "Not issued"}</dd>
      </dl>
      <p className={css.muted}>Something wrong? Call the office. For your security, details cannot be changed here.</p>
      <p className={css.muted}>Your link works until {day(session.link.expires_at)}. Keep it private: anyone with it can send invoices in your name.</p>
      <form action={leavePortalAction}><button type="submit" className={`${css.secondary} ${css.small}`}>Finish and leave the portal on this device</button></form>
    </section>
  </>;
}
