import { notFound } from "next/navigation";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { budgetSummary } from "@/lib/operations/summary";
import type { Commercial } from "@/lib/operations/types";
import { money } from "@/components/operations/format";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

// Money (behind the role shell or Next Action opt-in). A read-only view of saved budget fields.
// Variations, dayworks, payment claims, actual costs and margin sign-off are not recorded anywhere yet,
// so this page offers no button for any of them.
export default async function MoneyPage() {
  const { supabase, member } = await requireActor();
  if ((!flagEnabled("roleShell", member.role) && !flagEnabled("nextActions", member.role)) || !canReadFinancial(member)) notFound();
  const [contracts, commercials] = await Promise.all([contractsFor(supabase), supabase.from("contract_commercials").select("*")]);
  checkDatabase(commercials.error);
  const rows = (commercials.data ?? []) as Commercial[];
  return <>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Money</h1><p className={styles.description}>Original budgets compared with the profit you want.</p></div>
      <Link className={styles.secondaryButton} href="/admin/estimator">Estimator</Link></div>
    <p className={styles.muted}>These are the original budgets only. Actual costs, variations, dayworks and payment claims are not recorded in TileSPEC yet.</p>
    {contracts.map(contract => {
      const commercial = rows.find(row => row.contract_id === contract.id);
      if (!commercial) return <section key={contract.id} className={styles.panel}><h2>{contract.reference} · {contract.name}</h2><p className={styles.muted}>Commercial budget not recorded.</p></section>;
      const b = budgetSummary(commercial), low = b.margin !== null && b.margin < Number(commercial.target_margin);
      return <section key={contract.id} className={styles.panel}>
        <h2><Link href={`/admin/contracts/${contract.id}`}>{contract.reference} · {contract.name}</Link></h2>
        <div className={styles.metrics}>
          <div className={styles.metric}><span className={styles.metricLabel}>Contract value</span><strong className={styles.metricValue}>{money(b.value)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Budgeted cost</span><strong className={styles.metricValue}>{money(b.originalCost)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Profit after {money(b.reserve)} reserve</span><strong className={styles.metricValue}>{money(b.riskAdjustedProfit)}</strong></div>
          <div className={styles.metric}><span className={styles.metricLabel}>Margin (target {Number(commercial.target_margin).toFixed(0)}%)</span><strong className={styles.metricValue}>{b.margin === null ? "n/a" : `${b.margin.toFixed(1)}%`}</strong></div>
        </div>
        {low && <p className={styles.warning}><strong>Below target margin.</strong> There is nowhere to record an owner decision on this yet, so it is shown here for your information.</p>}
      </section>;
    })}
  </>;
}
