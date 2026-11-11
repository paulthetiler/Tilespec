import Link from "next/link";
import { randomUUID } from "node:crypto";
import { DailyForm } from "@/components/site/daily-form";
import { setContractCustomerAction, setContractStageAction } from "@/app/admin/command-centre-actions";
import { STAGES, jobStage, stageLabels } from "@/lib/operations/command-centre";
import styles from "@/app/admin/admin.module.css";

/** The job's stage and customer, set by the office. Every change is kept in the job's history. */
export function JobStagePanel({ contract, customers, today, manage }: {
  contract: { id: string; lifecycle_stage?: string | null; start_date: string | null; end_date: string | null; customer_id?: string | null; client: string };
  customers: { id: string; name: string }[] | null; today: string; manage: boolean;
}) {
  if (!("lifecycle_stage" in contract)) return null;
  const { stage, confirmed } = jobStage(contract.lifecycle_stage, contract.start_date, contract.end_date, today);
  const linked = customers?.find(c => c.id === contract.customer_id);
  return <section className={styles.panel} id="job-stage" aria-labelledby="job-stage-heading">
    <h2 id="job-stage-heading">Stage and customer</h2>
    <p><strong>{stageLabels[stage]}</strong>{confirmed ? "" : " (worked out from the programme dates; confirm it below)"} · Customer: {linked ? <Link href={`/admin/customers/${linked.id}`}>{linked.name}</Link> : contract.client || "not set"}
      {" · "}<Link href={`/admin/contracts/${contract.id}/activity`}>Complete job history</Link></p>
    {manage && <div className={styles.grid}>
      <details className={styles.details}><summary>Change the stage</summary>
        <DailyForm action={setContractStageAction} label="Save stage">
          <input type="hidden" name="contract_id" value={contract.id} /><input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>Stage<select name="stage" defaultValue={stage}>{STAGES.map(s => <option key={s} value={s}>{stageLabels[s]}</option>)}</select></label>
          <label className={styles.field}>Note (needed for on hold, closed or lost)<input name="note" maxLength={1000} /></label>
        </DailyForm>
      </details>
      {customers && <details className={styles.details}><summary>{linked ? "Change the customer" : "Link a customer"}</summary>
        <DailyForm action={setContractCustomerAction} label="Save customer">
          <input type="hidden" name="contract_id" value={contract.id} />
          <label className={styles.field}>Customer<select name="customer_id" defaultValue={contract.customer_id ?? ""}><option value="">None</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <p className={styles.small}>Not listed? <Link href="/admin/customers#new">Add the customer</Link> first.</p>
        </DailyForm>
      </details>}
    </div>}
  </section>;
}
