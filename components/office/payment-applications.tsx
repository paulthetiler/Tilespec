import Link from "next/link";
import { pounds } from "@/lib/operations/dayworks";
import { dayLabel } from "@/lib/operations/planning";
import { statusLabels } from "@/lib/operations/payments";
import type { Payments } from "@/lib/operations/payments-data";
import styles from "@/app/admin/admin.module.css";

// Money access only: rendered from the job money page, which requires it. A summary; payment terms,
// applications, notices, invoices and payments are managed in the job's accounts.
export function PaymentApplications({ contractId, payments }: { contractId: string; payments: Payments }) {
  return <section className={styles.panel} id="applications" aria-label="Payment applications">
    <h2>Payment applications</h2>
    {payments.summaries.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr>
      <th>No.</th><th>To</th><th>Status</th><th>Gross</th><th>Retention held</th><th>Net to date</th><th>Certified net</th><th>Received</th></tr></thead>
      <tbody>{payments.summaries.map(row => <tr key={row.application_id} data-application-status={row.status}>
        <td>{row.number}</td><td>{dayLabel(row.period_end)}</td><td>{statusLabels[row.status]}</td><td>{pounds(row.gross)}</td>
        <td>{pounds(row.retention)}</td><td>{pounds(row.net)}</td>
        <td>{row.certified_net === null ? "" : pounds(row.certified_net)}</td><td>{pounds(row.received)}</td></tr>)}</tbody></table></div>
      : <p>No payment applications yet.</p>}
    <p className={styles.inline}><Link className={styles.button} href={`/admin/contracts/${contractId}/accounts`}>Open accounts and invoicing</Link></p>
    <p className={styles.small}>Payment terms, applications, certificates and notices, invoices, credit notes and payments received are managed in the job&apos;s accounts.</p>
  </section>;
}
