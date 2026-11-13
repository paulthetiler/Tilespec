import { notFound } from "next/navigation";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { positionsFor } from "@/lib/operations/financial-position-data";
import { budgetSummary } from "@/lib/operations/summary";
import type { Commercial } from "@/lib/operations/types";
import { money } from "@/components/operations/format";
import { FinancialPositionView } from "@/components/office/financial-position";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

// Money (money access only). Each job's position, worked out by the database from saved records:
// original value and agreed extras, cost to date, forecast profit, applications, certificates and
// payments received. Nothing is added up on this page.
export default async function MoneyPage() {
  const { supabase, member } = await requireActor();
  // Money access only.
  if (!canReadFinancial(member)) notFound();
  const contracts = await contractsFor(supabase);
  const positions = await positionsFor(supabase, contracts.map(contract => contract.id));
  const header = <div className={styles.pageHeader}><div><h1 className={styles.title}>Money</h1>
    <p className={styles.description}>Each job&apos;s value, extras, costs, applications and payments, from what has been recorded.</p></div>
    <Link className={styles.secondaryButton} href="/admin/estimator">Estimator</Link></div>;
  if (positions) return <>
    {header}
    {contracts.map(contract => {
      const position = positions.get(contract.id);
      return <section key={contract.id} className={styles.panel}>
        <h2><Link href={`/admin/contracts/${contract.id}/money`}>{contract.reference} · {contract.name}</Link></h2>
        {position ? <FinancialPositionView position={position} compact /> : <p className={styles.muted}>You do not have money access on this job.</p>}
        <p className={styles.small}><Link href={`/admin/contracts/${contract.id}/money`}>Job money: costs, applications and payments</Link></p>
      </section>;
    })}
    {!contracts.length && <p>No jobs yet.</p>}
  </>;
  // Until the database update is applied, only the original budgets exist.
  const commercials = await supabase.from("contract_commercials").select("*");
  checkDatabase(commercials.error);
  const rows = (commercials.data ?? []) as Commercial[];
  return <>
    {header}
    <p className={styles.warning}>Costs, extras and payments appear here once the office applies the database update. Until then these are the original budgets.</p>
    {contracts.map(contract => {
      const commercial = rows.find(row => row.contract_id === contract.id);
      if (!commercial) return <section key={contract.id} className={styles.panel}><h2>{contract.reference} · {contract.name}</h2><p className={styles.muted}>Commercial budget not recorded.</p></section>;
      const b = budgetSummary(commercial);
      return <section key={contract.id} className={styles.panel}>
        <h2><Link href={`/admin/contracts/${contract.id}`}>{contract.reference} · {contract.name}</Link></h2>
        <div className={styles.metrics}>
          <div className={styles.metric}><span className={styles.metricLabel}>Contract value</span><strong className={styles.metricValue}>{money(b.value)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Budgeted cost</span><strong className={styles.metricValue}>{money(b.originalCost)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Profit after {money(b.reserve)} reserve</span><strong className={styles.metricValue}>{money(b.riskAdjustedProfit)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Margin (target {Number(commercial.target_margin).toFixed(0)}%)</span><strong className={styles.metricValue}>{b.margin === null ? "n/a" : `${b.margin.toFixed(1)}%`}</strong></div>
        </div>
      </section>;
    })}
  </>;
}
