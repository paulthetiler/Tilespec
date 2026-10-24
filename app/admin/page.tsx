import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { budgetSummary, contractWarnings } from "@/lib/operations/summary";
import type { Commercial } from "@/lib/operations/types";
import { calendarDate, money } from "@/components/operations/format";
import { configFromEnv, flagEnabled } from "@/lib/operations/next-actions";
import { loadOfficeSnapshot } from "@/lib/operations/next-actions/office-snapshot";
import { AdminToday } from "@/components/admin/admin-today";
import styles from "./admin.module.css";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  if (member.role === "supervisor") redirect("/admin/supervisor");
  const params = await searchParams;
  if ((member.role === "owner" || member.role === "contracts_manager") && flagEnabled("nextActions", member.role)) {
    const config = configFromEnv(process.env);
    const { snapshot, viewer } = await loadOfficeSnapshot(supabase, member, config);
    return <>
      {params.error === "permission" && <p className={styles.error} role="alert">Your account does not have permission to access that page.</p>}
      <AdminToday snapshot={snapshot} viewer={viewer} member={member} config={config} />
    </>;
  }
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
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>TileSPEC operations</p><h1 className={styles.title}>{member.role === "owner" ? "Portfolio overview" : "Your site overview"}</h1><p className={styles.description}>Welcome, {member.display_name}. Review your contracts, work areas and outstanding setup.</p></div>
      {canManageContracts(member) && <Link href="/admin/contracts/new" className={styles.button}>New contract</Link>}
    </div>
    {params.error === "permission" && <p className={styles.error} role="alert">Your account does not have permission to access that page.</p>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.metricLabel}>Available contracts</span><strong className={styles.metricValue}>{contracts.length}</strong><span className={styles.small}>Draft records within your access</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Site operations</span><Link className={styles.secondaryButton} href="/admin/supervisor">Open site dashboard</Link><span className={styles.small}>Recorded workforce, inspections, defects and restrictions</span></div>
      {financial && <>
        <div className={styles.metric}><span className={styles.metricLabel}>Recorded contract values</span><strong className={styles.metricValue}>{budgets.length > 0 ? money(recordedValue) : "Not recorded"}</strong><span className={styles.small}>{budgets.length} of {contracts.length} original budgets recorded</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Budgeted profit after reserve</span><strong className={styles.metricValue}>{budgets.length > 0 ? money(recordedProfit) : "Not recorded"}</strong><span className={styles.small}>Original budgets; actual costs not yet tracked</span></div>
      </>}
    </div>
    <section className={styles.panel}><h2>Quality and work restrictions</h2><p>Permission to proceed is assessed for a specified location and activity from saved requirements, inspections and hold decisions.</p><div className={styles.rowActions}>{canManageContracts(member) && <Link href="/admin/quality" className={styles.button}>Quality control</Link>}<Link href="/admin/holds" className={styles.secondaryButton}>Holds and releases</Link><Link href="/admin/alerts" className={styles.secondaryButton}>Site alerts</Link></div></section>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Contracts requiring setup</h2><p className={styles.muted}>Missing information is shown explicitly. No project has been marked compliant.</p></div><Link href="/admin/contracts" className={styles.secondaryButton}>View register</Link></div>
      {contracts.length === 0
        ? <div className={styles.empty}><h3>No contracts yet</h3><p>{canManageContracts(member) ? "Create your first draft contract, record the work areas, then add the project documents and allocations." : "You will see contracts here when an owner or manager allocates your work."}</p></div>
        : <div className={styles.stack}>{contracts.map(contract => {
          const warnings = contractWarnings(contract, areaCount(contract.id), documentCount(contract.id));
          return <article key={contract.id} className={styles.contractCard}>
            <div className={styles.cardTop}><Link href={`/admin/contracts/${contract.id}`}><span className={styles.eyebrow}>{contract.reference}</span><h3>{contract.name}</h3></Link><span className={styles.warningBadge}>Draft contract record</span></div>
            <p className={styles.muted}>{contract.client} · Programme starts {calendarDate(contract.start_date)}</p>
            <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            {financial && (() => {
              const budget = budgets.find(item => item.contract_id === contract.id);
              if (!budget) return <p className={styles.small}>Commercial budget not recorded.</p>;
              const summary = budgetSummary(budget);
              return summary.margin !== null && summary.margin < Number(budget.target_margin)
                ? <p className={styles.warning}><strong>Below target margin:</strong> {summary.margin.toFixed(1)}% against {Number(budget.target_margin).toFixed(1)}%. There is nowhere to record an owner decision on this yet, so it is shown here for your information.</p>
                : null;
            })()}
          </article>;
        })}</div>}
    </section>
    <section className={styles.panel}><h2>Recorded site work</h2><p className={styles.muted}>Use the guided site dashboard for morning checks, actual workforce confirmation, location inspections, snags and scoped holds. Earlier records and decisions remain in their histories.</p><Link href="/admin/supervisor" className={styles.secondaryButton}>Choose site dashboard</Link></section>
  </>;
}
