import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinancialActor } from "@/lib/auth";
import {
  cancelApplicationAction, certifyAction, disputeAction, issueDocumentAction, payLessAction, receiptAction, resolveDisputeAction, updateApplicationAction,
  voidNoticeAction, voidReceiptAction,
} from "@/app/admin/accounts-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { StatusBadge } from "@/components/office/accounts/status";
import { ValuationFields } from "@/components/office/accounts/valuation-fields";
import { checkDatabase } from "@/lib/operations/data";
import { accountsFor } from "@/lib/operations/accounts-data";
import { documentKindLabels, kindLabels, lineKindLabels, nextStep, vatLabels } from "@/lib/operations/accounts";
import { formatPercent, formatPounds } from "@/lib/operations/money";
import { londonDate } from "@/lib/operations/planning";
import { longDate } from "@/lib/documents/model";
import styles from "../../../../../admin.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// One application from draft to paid (money access only): check the figures, preview, approve and
// issue, record the client's certificate or pay less notice, invoice, and record payments.
export default async function ApplicationPage({ params }: { params: Promise<{ id: string; applicationId: string }> }) {
  const { id, applicationId } = await params;
  if (!uuidPattern.test(id) || !uuidPattern.test(applicationId)) notFound();
  const { supabase } = await requireFinancialActor();
  const contract = await supabase.from("contracts").select("id,reference,name").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const accounts = await accountsFor(supabase, id);
  if (!accounts) notFound();
  const row = accounts.account.applications.find(a => a.application_id === applicationId), record = accounts.applications.find(a => a.id === applicationId);
  if (!row || !record) notFound();
  const v = row.valuation, t = accounts.account.terms, today = londonDate();
  const lines = accounts.lines.filter(l => l.application_id === applicationId);
  const receipts = accounts.receipts.filter(r => r.application_id === applicationId);
  const notices = accounts.notices.filter(n => n.application_id === applicationId);
  const disputes = accounts.disputes.filter(d => d.application_id === applicationId);
  const documents = accounts.documents.filter(d => d.application_id === applicationId || (d.kind === "credit_note"
    && accounts.documents.some(i => i.id === d.credits_document_id && i.application_id === applicationId)));
  const invoices = documents.filter(d => d.kind === "invoice");
  const docKind = row.kind === "final" ? "final_account" : "payment_application";
  const issued = documents.some(d => d.kind === docKind);
  const open = row.status === "submitted" || row.status === "certified";
  const liveInvoice = row.invoiced !== 0;
  const ids = <><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="application_id" value={applicationId} /></>;
  const key = () => <input type="hidden" name="request_key" value={randomUUID()} />;
  const preview = (kind: string) => `/admin/contracts/${id}/accounts/preview?kind=${kind}&application=${applicationId}`;
  const extraRef = (dayworkId: string | null) => accounts.account.extras.find(e => e.daywork_id === dayworkId)?.reference ?? "";
  const defaultNoticeDue = row.status === "submitted" && row.construction_act && !!row.payment_notice_by && today > row.payment_notice_by && !row.default_notice_on;
  const summary: [string, string, string?][] = [
    ...(row.kind !== "advance" ? [["Gross valuation to date", formatPounds(v.gross)] as [string, string]] : []),
    ...(v.retention > 0 || v.retention_percent > 0 ? [["Less retention held", `(${formatPounds(v.retention_held)})`,
      `${formatPercent(v.retention_percent)} of ${formatPounds(v.retention_base)}${v.retention_cap !== null ? `, limit ${formatPounds(v.retention_cap)}` : ""}${v.retention_released_pc > 0 ? `, ${formatPounds(v.retention_released_pc)} released at practical completion` : ""}${v.retention_released_final > 0 ? `, ${formatPounds(v.retention_released_final)} released on making good` : ""}`] as [string, string, string]] : []),
    ...(v.advance > 0 ? [["Advance payment", formatPounds(v.advance)] as [string, string]] : []),
    ...(v.advance_recovered > 0 ? [["Less advance recovered", `(${formatPounds(v.advance_recovered)})`] as [string, string]] : []),
    ...(v.deductions > 0 ? [["Less agreed deductions", `(${formatPounds(v.deductions)})`] as [string, string]] : []),
    ["Net valuation to date", formatPounds(row.net)],
    ["Less previously certified or notified", `(${formatPounds(row.previous_notified)})`],
    ["Applied for this application", formatPounds(row.applied_this_period)],
  ];

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.data.reference} · Accounts</p>
      <h1 className={styles.title}>{kindLabels[row.kind]} {row.number}</h1>
      <p className={styles.description}>Valued to {longDate(row.period_end)} · <StatusBadge status={row.display_status} /></p>
      <p className={styles.lead}>{nextStep(row, today)}</p></div>
      <div className={styles.inline}><Link className={styles.secondaryButton} href={`/admin/contracts/${id}/accounts`}>All accounts</Link></div></div>

    <section className={styles.panel} aria-label="Figures">
      <h2>Figures</h2>
      <div className={styles.metrics}>
        <div className={styles.metric}><span className={styles.metricLabel}>Applied this period</span><strong className={styles.metricValue}>{formatPounds(row.applied_this_period)}</strong>
          <span className={styles.small}>Excluding VAT</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Sum due (notified)</span><strong className={styles.metricValue}>{formatPounds(row.due_this_period)}</strong>
          <span className={styles.small}>{row.pay_less_effective ? "Under the pay less notice" : row.certified_net !== null ? "Under the certificate" : row.default_notice_on ? "Under TileSPEC's default notice" : "As applied"}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Expected payment</span><strong className={styles.metricValue}>{formatPounds(row.payable)}</strong>
          <span className={styles.small}>{row.vat > 0 ? `Includes VAT ${formatPounds(row.vat)}` : vatLabels[row.vat_treatment]}{row.cis_expected > 0 ? `; after CIS ${formatPounds(row.cis_expected)}` : ""}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Outstanding</span><strong className={styles.metricValue}>{row.status === "draft" ? "Not issued" : formatPounds(row.outstanding)}</strong>
          <span className={styles.small}>Received {formatPounds(row.received)}{row.received_cis > 0 ? ` (CIS ${formatPounds(row.received_cis)})` : ""}</span></div>
      </div>
      <div className={styles.tableWrap}><table className={styles.table}><tbody>{summary.map(([label, value, detail]) => <tr key={label}><td>{label}{detail && <div className={styles.small}>{detail}</div>}</td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{value}</td></tr>)}</tbody></table></div>
      {lines.length > 0 && <><h3>Valuation lines</h3><ul className={styles.plainList}>{lines.map(l => <li key={l.id}>
        {lineKindLabels[l.kind]}{l.daywork_id ? ` ${extraRef(l.daywork_id)}` : ""}: {l.description} · <strong>{formatPounds(l.amount)}</strong></li>)}</ul></>}
      {row.status !== "draft" && <dl className={styles.detailGrid}>
        <div className={styles.detailItem}><dt>Applied on</dt><dd>{row.applied_on ? longDate(row.applied_on) : ""}</dd></div>
        <div className={styles.detailItem}><dt>Payment due date</dt><dd>{row.due_on ? longDate(row.due_on) : ""}</dd></div>
        <div className={styles.detailItem}><dt>Payment notice due by</dt><dd>{row.payment_notice_by ? longDate(row.payment_notice_by) : ""}
          {row.certificate_in_time === false ? " · certificate was late" : ""}</dd></div>
        <div className={styles.detailItem}><dt>Pay less notice by</dt><dd>{row.pay_less_by ? longDate(row.pay_less_by) : ""}</dd></div>
        <div className={styles.detailItem}><dt>Final date for payment</dt><dd>{row.final_on_effective ? longDate(row.final_on_effective) : ""}
          {row.final_on_effective !== row.final_on ? " (postponed by the default notice)" : ""}</dd></div>
        {row.certified_on && <div className={styles.detailItem}><dt>Certificate</dt><dd>{longDate(row.certified_on)}{record.certificate_reference ? ` · ${record.certificate_reference}` : ""}
          · gross {formatPounds(row.certified_gross ?? 0)} · net {formatPounds(row.certified_net ?? 0)}</dd></div>}
      </dl>}
    </section>

    {row.status === "draft" && <section className={styles.panel} aria-label="Approve and issue">
      <h2>Check, preview and issue</h2>
      <ol className={styles.steps}>
        <li className={styles.step}>Check the figures above. Correct the draft below if anything is wrong.</li>
        <li className={styles.step}><a className={styles.secondaryButton} href={preview(docKind)} target="_blank" rel="noopener">Preview the {documentKindLabels[docKind].toLowerCase()}</a></li>
        <li className={styles.step}>Approve and issue it. Issuing fixes every figure and the payment dates; it cannot be edited afterwards.</li>
      </ol>
      <OperationsForm action={issueDocumentAction} submitLabel={`Approve and issue ${documentKindLabels[docKind].toLowerCase()}`}>
        {ids}{key()}<input type="hidden" name="kind" value={docKind} /><input type="hidden" name="application_version" value={record.version} />
        <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />I have checked the figures and the preview</label>
      </OperationsForm>
      <details className={styles.details}><summary>Correct the draft</summary>
        <OperationsForm key={`draft-${record.version}`} action={updateApplicationAction} submitLabel="Save the corrected draft">
          {ids}{key()}<input type="hidden" name="version" value={record.version} /><input type="hidden" name="kind" value={row.kind} />
          <ValuationFields kind={row.kind} terms={t} extras={accounts.account.extras} stages={accounts.stages} lines={lines} periodEnd={row.period_end}
            cisMaterials={record.cis_materials} note={record.note} />
        </OperationsForm></details>
    </section>}

    {row.status !== "draft" && row.status !== "cancelled" && !issued && <section className={styles.panel} aria-label="Issue">
      <h2>Issue the document</h2>
      <p className={styles.small}>This application was submitted without a document. Its figures are already fixed.</p>
      <p><a className={styles.secondaryButton} href={preview(docKind)} target="_blank" rel="noopener">Preview</a></p>
      <OperationsForm action={issueDocumentAction} submitLabel={`Issue ${documentKindLabels[docKind].toLowerCase()}`}>{ids}{key()}<input type="hidden" name="kind" value={docKind} />
        <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />I have checked the preview</label></OperationsForm>
    </section>}

    {open && <section className={styles.panel} aria-label="Certification and notices">
      <h2>Certificate and notices</h2>
      {row.status === "submitted" && <details className={styles.details} open><summary>Record the client&apos;s certificate (payment notice)</summary>
        <OperationsForm action={certifyAction} submitLabel="Record certificate">{ids}{key()}<input type="hidden" name="version" value={record.version} />
          <label className={styles.field}>Gross value certified to date (£)<input name="certified_gross" inputMode="decimal" required /></label>
          <label className={styles.field}>Retention certified (£, optional; else the contract&apos;s rules)<input name="certified_retention" inputMode="decimal" /></label>
          <label className={styles.field}>Deductions certified (£, optional; else as applied)<input name="certified_deductions" inputMode="decimal" /></label>
          <label className={styles.field}>Certificate date<input type="date" name="certified_on" defaultValue={today} max={today} /></label>
          <label className={styles.field}>Certificate reference<input name="certificate_reference" maxLength={120} /></label>
        </OperationsForm></details>}
      {notices.filter(n => !n.voided_at).map(n => <div key={n.id} className={styles.card}>
        <p><strong>{n.kind === "pay_less" ? "Pay less notice" : "Default payment notice"}</strong> given {longDate(n.given_on)}: sum stated {formatPounds(n.sum_stated)}
          {n.kind === "pay_less" ? (n.in_time ? " · given in time" : row.construction_act ? " · given late, so not effective under the Construction Act" : " · given late") : ""}</p>
        <p className={styles.small}>{n.basis}</p>
        {n.kind === "pay_less" && <details className={styles.details}><summary>Void (recorded in error)</summary><OperationsForm action={voidNoticeAction} submitLabel="Void notice" compact>
          <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="notice_id" value={n.id} />
          <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>}
      </div>)}
      {!notices.some(n => n.kind === "pay_less" && !n.voided_at) && <details className={styles.details}><summary>Record a pay less notice from the client</summary>
        <OperationsForm action={payLessAction} submitLabel="Record pay less notice">{ids}{key()}
          <label className={styles.field}>Sum the notice says is due for this payment (£, excluding VAT)<input name="sum_stated" inputMode="decimal" required /></label>
          <label className={styles.field}>Basis given in the notice<textarea name="basis" required minLength={3} maxLength={2000} /></label>
          <label className={styles.field}>Date given<input type="date" name="given_on" defaultValue={today} max={today} /></label>
          <label className={styles.field}>Reference<input name="reference" maxLength={120} /></label>
          {row.pay_less_by && <p className={styles.small}>It must be given by {longDate(row.pay_less_by)} to be effective under the Construction Act.</p>}
        </OperationsForm></details>}
      {defaultNoticeDue && <div className={styles.card}>
        <h3>No payment notice was given by {longDate(row.payment_notice_by!)}</h3>
        <p className={styles.small}>TileSPEC may give its own payment notice. The sum in the application then becomes the notified sum, and the final date for payment moves
          back by the days the notice is late.</p>
        <p><a className={styles.secondaryButton} href={preview("default_payment_notice")} target="_blank" rel="noopener">Preview the notice</a></p>
        <OperationsForm action={issueDocumentAction} submitLabel="Give default payment notice">{ids}{key()}<input type="hidden" name="kind" value="default_payment_notice" />
          <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />I have checked the notice</label></OperationsForm>
      </div>}
      {disputes.filter(d => !d.resolved_on).map(d => <div key={d.id} className={styles.card}>
        <p><strong>Disputed</strong> since {longDate(d.raised_on)} by {d.raised_by_party === "client" ? "the client" : "TileSPEC"}: {d.summary}
          {d.amount_disputed !== null ? ` (${formatPounds(d.amount_disputed)})` : ""}</p>
        <OperationsForm action={resolveDisputeAction} submitLabel="Record the resolution" compact><input type="hidden" name="contract_id" value={id} />
          <input type="hidden" name="dispute_id" value={d.id} /><label className={styles.field}>How it was resolved<input name="resolution" required minLength={3} maxLength={1000} /></label>
        </OperationsForm></div>)}
      {!disputes.some(d => !d.resolved_on) && <details className={styles.details}><summary>Record a dispute</summary>
        <OperationsForm action={disputeAction} submitLabel="Record dispute">{ids}{key()}
          <fieldset className={styles.plainFieldset}><legend>Raised by</legend>
            <label className={styles.checkboxRow}><input type="radio" name="raised_by_party" value="client" defaultChecked />The client</label>
            <label className={styles.checkboxRow}><input type="radio" name="raised_by_party" value="tilespec" />TileSPEC</label></fieldset>
          <label className={styles.field}>What is in dispute<textarea name="summary" required minLength={5} maxLength={1000} /></label>
          <label className={styles.field}>Amount in dispute (£, optional)<input name="amount_disputed" inputMode="decimal" /></label>
        </OperationsForm></details>}
    </section>}

    {open && <section className={styles.panel} aria-label="Invoice and payments">
      <h2>Invoice and payments</h2>
      {!liveInvoice && row.due_this_period > 0 && <div className={styles.card}>
        <h3>Invoice the sum due: {formatPounds(row.due_this_period)}{row.vat > 0 ? ` plus VAT ${formatPounds(row.vat)}` : ""}</h3>
        <p><a className={styles.secondaryButton} href={preview("invoice")} target="_blank" rel="noopener">Preview the invoice</a></p>
        <OperationsForm action={issueDocumentAction} submitLabel="Approve and issue invoice">{ids}{key()}<input type="hidden" name="kind" value="invoice" />
          <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />I have checked the invoice</label></OperationsForm></div>}
      <h3>Payments received</h3>
      {receipts.filter(r => !r.voided_at).length ? <ul className={styles.plainList}>{receipts.filter(r => !r.voided_at).map(r => <li key={r.id}>
        {longDate(r.received_on)}: <strong>{formatPounds(r.amount)}</strong>{r.cis_deducted > 0 ? ` plus CIS deducted ${formatPounds(r.cis_deducted)}` : ""}{r.reference ? ` (${r.reference})` : ""}
        <span className={styles.small}> · {r.recorded_by_name}</span>
        <details className={styles.details}><summary>Void</summary><OperationsForm action={voidReceiptAction} submitLabel="Void this payment" compact>
          <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="receipt_id" value={r.id} />
          <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details></li>)}</ul>
        : <p className={styles.small}>None recorded.</p>}
      <details className={styles.details} open={["certified", "part_paid", "overdue"].includes(row.display_status)}><summary>Record a payment</summary>
        <OperationsForm action={receiptAction} submitLabel="Record payment">{ids}{key()}
          <label className={styles.field}>Cash received (£)<input name="amount" inputMode="decimal" required /></label>
          {t.cis_applies && <label className={styles.field}>CIS deducted by the client (£, from their deduction statement)<input name="cis_deducted" inputMode="decimal" /></label>}
          <label className={styles.field}>Date received<input type="date" name="received_on" defaultValue={today} max={today} /></label>
          <label className={styles.field}>Reference<input name="reference" maxLength={120} /></label>
          <p className={styles.small}>Expected: {formatPounds(row.payable)}. Outstanding now: {formatPounds(row.outstanding)}.</p>
        </OperationsForm></details>
    </section>}

    <section className={styles.panel} aria-label="Documents">
      <h2>Documents</h2>
      {documents.length ? <ul className={styles.documentList}>{documents.map(d => <li key={d.id} className={styles.documentRow}>
        <div><strong>{d.reference}</strong> · {d.title}{d.superseded_at ? " · superseded" : ""}
          <div className={styles.small}>Issued {longDate(d.issued_on)} by {d.issued_by_name}{d.total !== null ? ` · ${formatPounds(d.total)}` : ""}</div></div>
        <div className={styles.inline}><a className={styles.secondaryButton} href={`/admin/contracts/${id}/accounts/documents/${d.id}`} target="_blank" rel="noopener">Open PDF</a>
          <a className={styles.secondaryButton} href={`/admin/contracts/${id}/accounts/documents/${d.id}?download=1`}>Download</a></div>
      </li>)}</ul> : <p className={styles.small}>No documents issued for this application yet.</p>}
      {invoices.map(inv => <details key={inv.id} className={styles.details}><summary>Credit note against {inv.reference}</summary>
        <OperationsForm action={issueDocumentAction} submitLabel="Issue credit note">
          <input type="hidden" name="contract_id" value={id} />{key()}<input type="hidden" name="kind" value="credit_note" /><input type="hidden" name="invoice_id" value={inv.id} />
          <label className={styles.field}>Amount to credit (£, excluding VAT; blank for the whole uncredited amount)<input name="amount" inputMode="decimal" /></label>
          <label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={1000} /></label>
          <p className={styles.small}>VAT is credited at the invoice&apos;s rate. To correct an invoice, credit it in full and issue a new one.</p>
          <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />Issue the credit note</label>
        </OperationsForm></details>)}
      {(row.status === "draft" || (row.status === "submitted" && !liveInvoice && row.received === 0)) && <details className={styles.details}><summary>Cancel this application</summary>
        <OperationsForm action={cancelApplicationAction} submitLabel="Cancel application" compact>{ids}<input type="hidden" name="version" value={record.version} />
          <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
          <p className={styles.small}>It stays on record, with any document issued for it, marked cancelled.</p></OperationsForm></details>}
    </section>
  </>;
}
