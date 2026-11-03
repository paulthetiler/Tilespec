import { randomUUID } from "node:crypto";
import {
  cancelApplicationAction, certifyApplicationAction, createApplicationAction, recordReceiptAction, submitApplicationAction, updateApplicationAction, voidReceiptAction,
} from "@/app/admin/money-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { pounds } from "@/lib/operations/dayworks";
import { dayLabel, londonDate } from "@/lib/operations/planning";
import { statusLabels, type ClaimableExtra, type PaymentLine } from "@/lib/operations/payments";
import type { Payments } from "@/lib/operations/payments-data";
import styles from "@/app/admin/admin.module.css";

// Money access only: rendered from the job money page, which requires it.
function ValuationFields({ extras, lines, periodEnd }: { extras: ClaimableExtra[]; lines?: PaymentLine[]; periodEnd?: string }) {
  const works = lines?.find(line => line.kind === "contract_works"), materials = lines?.find(line => line.kind === "materials_on_site");
  const other = lines?.find(line => line.kind === "other");
  return <>
    <label className={styles.field}>Valuation runs to<input type="date" name="period_end" defaultValue={periodEnd ?? londonDate()} required /></label>
    <label className={styles.field}>Value of work completed to date (£, gross, excluding VAT)<input name="contract_works" inputMode="decimal" required defaultValue={works ? String(works.amount) : ""} /></label>
    <label className={styles.field}>Description (optional)<input name="contract_works_description" maxLength={300} defaultValue={works?.description ?? ""} /></label>
    <fieldset className={styles.plainFieldset}><legend>Approved dayworks and variations to claim</legend>
      {extras.length ? extras.map(extra => {
        const claimed = lines?.find(line => line.daywork_id === extra.id);
        return <div key={extra.id} className={styles.card}>
          <label className={styles.checkboxRow}><input type="checkbox" name={`claim_${extra.id}`} defaultChecked={lines ? !!claimed : true} />{extra.reference}: {extra.description.slice(0, 80)}</label>
          <label className={styles.field}>Value to claim (priced at {pounds(extra.priced)})<input name={`amount_${extra.id}`} inputMode="decimal" defaultValue={String(claimed?.amount ?? extra.priced)} /></label>
        </div>;
      }) : <p className={styles.small}>None yet. A daywork or variation can be claimed once the office approves it and its charge is approved.</p>}
    </fieldset>
    <label className={styles.field}>Materials on site (£, optional)<input name="materials_on_site" inputMode="decimal" defaultValue={materials ? String(materials.amount) : ""} /></label>
    <label className={styles.field}>Other amount (£, optional; negative for a deduction)<input name="other_amount" inputMode="decimal" defaultValue={other ? String(other.amount) : ""} /></label>
    <label className={styles.field}>What the other amount is for<input name="other_description" maxLength={300} defaultValue={other?.description ?? ""} /></label>
    <p className={styles.small}>Values are cumulative to the valuation date. Retention is taken at the contract&apos;s percentage, fixed when you submit.</p>
  </>;
}

export function PaymentApplications({ contractId, payments, extras }: { contractId: string; payments: Payments; extras: ClaimableExtra[] }) {
  const job = <input type="hidden" name="contract_id" value={contractId} />;
  const key = () => <input type="hidden" name="request_key" value={randomUUID()} />;
  const hasDraft = payments.applications.some(app => app.status === "draft");
  return <section className={styles.panel} id="applications" aria-label="Payment applications">
    <h2>Payment applications</h2>
    {payments.summaries.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr>
      <th>No.</th><th>To</th><th>Status</th><th>Gross</th><th>Retention</th><th>Net to date</th><th>This period</th><th>Certified net</th><th>Received</th></tr></thead>
      <tbody>{payments.summaries.map(row => <tr key={row.application_id} data-application-status={row.status}>
        <td>{row.number}</td><td>{dayLabel(row.period_end)}</td><td>{statusLabels[row.status]}</td><td>{pounds(row.gross)}</td>
        <td>{pounds(row.retention)} ({row.retention_percent}%)</td><td>{pounds(row.net)}</td><td>{row.net_this_period === null ? "" : pounds(row.net_this_period)}</td>
        <td>{row.certified_net === null ? "" : pounds(row.certified_net)}</td><td>{pounds(row.received)}</td></tr>)}</tbody></table></div>
      : <p>No payment applications yet.</p>}
    {payments.applications.filter(app => app.status !== "cancelled").map(app => {
      const lines = payments.lines.filter(line => line.application_id === app.id), receipts = payments.receipts.filter(r => r.application_id === app.id && !r.voided_at);
      const ids = <><input type="hidden" name="application_id" value={app.id} /><input type="hidden" name="version" value={app.version} />{job}</>;
      return <details key={app.id} className={styles.details} open={app.status === "draft"}><summary>Application {app.number} · {statusLabels[app.status]}</summary>
        <ul className={styles.plainList}>{lines.map(line => <li key={line.id}>{line.description}: <strong>{pounds(line.amount)}</strong></li>)}</ul>
        {app.submitted_at && <p className={styles.small}>Submitted by {app.submitted_by_name}.</p>}
        {app.certified_on && <p className={styles.small}>Certified {dayLabel(app.certified_on)}{app.certificate_reference ? ` (${app.certificate_reference})` : ""}, recorded by {app.certified_by_name}.</p>}
        {receipts.map(receipt => <div key={receipt.id} className={styles.small}>Received {pounds(receipt.amount)} on {dayLabel(receipt.received_on)}{receipt.reference ? ` (${receipt.reference})` : ""}
          <details className={styles.details}><summary>Void</summary><OperationsForm action={voidReceiptAction} submitLabel="Void this payment" compact>
            {job}<input type="hidden" name="receipt_id" value={receipt.id} /><label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
          </OperationsForm></details></div>)}
        {app.status === "draft" && <>
          <OperationsForm action={submitApplicationAction} submitLabel="Submit this application">{ids}{key()}</OperationsForm>
          <details className={styles.details}><summary>Correct the draft</summary>
            <OperationsForm action={updateApplicationAction} submitLabel="Save the corrected draft">{ids}{key()}
              <ValuationFields extras={extras} lines={lines} periodEnd={app.period_end} /></OperationsForm></details>
        </>}
        {app.status === "submitted" && <details className={styles.details}><summary>Record the client&apos;s certificate</summary>
          <OperationsForm action={certifyApplicationAction} submitLabel="Record certificate">{ids}{key()}
            <label className={styles.field}>Certified gross value (£)<input name="certified_gross" inputMode="decimal" required /></label>
            <label className={styles.field}>Certificate date<input type="date" name="certified_on" defaultValue={londonDate()} max={londonDate()} /></label>
            <label className={styles.field}>Certificate reference<input name="certificate_reference" maxLength={120} /></label>
          </OperationsForm></details>}
        {(app.status === "submitted" || app.status === "certified") && <details className={styles.details}><summary>Record a payment received</summary>
          <OperationsForm action={recordReceiptAction} submitLabel="Record payment">{job}{key()}<input type="hidden" name="application_id" value={app.id} />
            <label className={styles.field}>Amount received (£)<input name="amount" inputMode="decimal" required /></label>
            <label className={styles.field}>Date received<input type="date" name="received_on" defaultValue={londonDate()} max={londonDate()} /></label>
            <label className={styles.field}>Reference<input name="reference" maxLength={120} /></label>
          </OperationsForm></details>}
        {(app.status === "draft" || app.status === "submitted") && <details className={styles.details}><summary>Cancel this application</summary>
          <OperationsForm action={cancelApplicationAction} submitLabel="Cancel application" compact>{ids}
            <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>}
      </details>;
    })}
    {!hasDraft && <details className={styles.details}><summary>New payment application</summary>
      <OperationsForm action={createApplicationAction} submitLabel="Save as draft">{job}{key()}<ValuationFields extras={extras} /></OperationsForm>
    </details>}
  </section>;
}
