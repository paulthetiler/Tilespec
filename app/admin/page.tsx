import Link from "next/link";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { budgetSummary, contractWarnings } from "@/lib/operations/summary";
import type { Commercial } from "@/lib/operations/types";
import { calendarDate, money } from "@/components/operations/format";
import styles from "./admin.module.css";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  const financial = canReadFinancial(member);
  const contracts = await contractsFor(supabase);
  const [areaResult, documentResult, budgetResult] = await Promise.all([
    supabase.from("work_areas").select("contract_id"),
    supabase.from("document_revisions").select("contract_id,uploaded_at"),
    financial ? supabase.from("contract_commercials").select("*") : Promise.resolve({ data: null, error: null }),
  ]);
  [areaResult, documentResult, budgetResult].forEach(result => checkDatabase(result.error));
  const budgets = (budgetResult.data ?? []) as Commercial[];
  const summaries = budgets.map(budgetSummary);
  const recordedValue = summaries.reduce((sum, budget) => sum + budget.value, 0);
  const recordedProfit = summaries.reduce((sum, budget) => sum + budget.riskAdjustedProfit, 0);
  const areaCount = (id: string) => (areaResult.data ?? []).filter(area => area.contract_id === id).length;
  const documentCount = (id: string) => (documentResult.data ?? []).filter(document => document.contract_id === id && document.uploaded_at).length;
  const params = await searchParams;
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>TileSPEC operations</p><h1 className={styles.title}>{member.role === "owner" ? "Portfolio overview" : "Your site overview"}</h1><p className={styles.description}>Welcome, {member.display_name}. Review your contracts, work areas and outstanding setup.</p></div>
      {canManageContracts(member) && <Link href="/admin/contracts/new" className={styles.button}>New contract</Link>}
    </div>
    {params.error === "permission" && <p className={styles.error} role="alert">Your account does not have permission to access that page.</p>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.metricLabel}>Available contracts</span><strong className={styles.metricValue}>{contracts.length}</strong><span className={styles.small}>Draft records within your access</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Installation release</span><strong className={styles.metricValue}>Blocked</strong><span className={styles.small}>Quality gates required before release</span></div>
      {financial && <>
        <div className={styles.metric}><span className={styles.metricLabel}>Recorded contract values</span><strong className={styles.metricValue}>{budgets.length > 0 ? money(recordedValue) : "Not recorded"}</strong><span className={styles.small}>{budgets.length} of {contracts.length} original budgets recorded</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Budgeted profit after reserve</span><strong className={styles.metricValue}>{budgets.length > 0 ? money(recordedProfit) : "Not recorded"}</strong><span className={styles.small}>Original budgets; actual costs not yet tracked</span></div>
      </>}
    </div>
    <div className={styles.warning}><strong>Mobilisation and installation remain unreleased.</strong> The foundation records are ready for project setup. Supervisor approvals, stop-work controls and quality-gate decisions arrive in Phase 2.</div>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Contracts requiring setup</h2><p className={styles.muted}>Missing information is shown explicitly. No project has been marked compliant.</p></div><Link href="/admin/contracts" className={styles.secondaryButton}>View register</Link></div>
      {contracts.length === 0
        ? <div className={styles.empty}><h3>No contracts yet</h3><p>{canManageContracts(member) ? "Create your first draft contract, record the work areas, then add the project documents and allocations." : "You will see contracts here when an owner or manager allocates your work."}</p></div>
        : <div className={styles.stack}>{contracts.map(contract => {
          const warnings = contractWarnings(contract, areaCount(contract.id), documentCount(contract.id));
          return <article key={contract.id} className={styles.contractCard}>
            <div className={styles.cardTop}><Link href={`/admin/contracts/${contract.id}`}><span className={styles.eyebrow}>{contract.reference}</span><h3>{contract.name}</h3></Link><span className={styles.warningBadge}>Draft · unreleased</span></div>
            <p className={styles.muted}>{contract.client} · Programme starts {calendarDate(contract.start_date)}</p>
            <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            {financial && (() => {
              const budget = budgets.find(item => item.contract_id === contract.id);
              if (!budget) return <p className={styles.small}>Commercial budget not recorded.</p>;
              const summary = budgetSummary(budget);
              return summary.margin !== null && summary.margin < Number(budget.target_margin)
                ? <p className={styles.warning}><strong>Below target margin:</strong> {summary.margin.toFixed(1)}% against {Number(budget.target_margin).toFixed(1)}%. Owner acceptance with a recorded reason is required before mobilisation.</p>
                : null;
            })()}
          </article>;
        })}</div>}
    </section>
    <section className={styles.panel}><h2>Next delivery phases</h2><p className={styles.muted}>Live progress, inspections, variations, payment deadlines and cash forecasts will appear as their workflows are implemented. There are no estimated or invented operational results here.</p></section>
  </>;
}
