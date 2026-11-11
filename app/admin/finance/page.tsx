import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { positionsFor } from "@/lib/operations/financial-position-data";
import { belowTarget } from "@/lib/operations/financial-position";
import { londonDate } from "@/lib/operations/planning";
import { ageing, cashWeeks, jobStage, money, type CashLine, type DebtLine } from "@/lib/operations/command-centre";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const day = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "—";
const MISSING = ["PGRST202", "42883", "42P01", "PGRST205"];

/**
 * Debtors, cash flow and profitability for people with money access. Every figure comes from the
 * database's own commercial calculations (the same account rows as statements and the job money page).
 */
export default async function FinancePage() {
  const { supabase } = await requireFinancialActor();
  const today = londonDate();
  const contracts = await supabase.from("contracts").select("*").order("reference");
  checkDatabase(contracts.error);
  const jobRows = (contracts.data ?? []) as Row[];
  const jobs = new Map(jobRows.map(c => [String(c.id), { label: `${c.reference} · ${c.name}`, client: String(c.client ?? ""), customer: (c.customer_id as string | null) ?? null }]));
  const [debts, cash, positions] = await Promise.all([
    supabase.rpc("debtor_ledger"), supabase.rpc("cash_flow_lines", { p_weeks: 12 }), positionsFor(supabase, [...jobs.keys()]),
  ]);
  const unavailable = [debts, cash].some(r => r.error && MISSING.includes(r.error.code ?? ""));
  if (!unavailable) [debts, cash].forEach(r => checkDatabase(r.error));
  const debtLines = ((debts.data ?? []) as DebtLine[]).map(d => ({ ...d, outstanding: Number(d.outstanding), days_overdue: Number(d.days_overdue) }));
  const buckets = ageing(debtLines);
  const cashLines = ((cash.data ?? []) as CashLine[]).map(c => ({ ...c, amount: Number(c.amount) }));
  const weeks = cashWeeks(cashLines, today, 12);
  const byCustomer = new Map<string, { name: string; total: number; overdue: number }>();
  for (const d of debtLines) {
    const job = jobs.get(d.contract_id), key = job?.customer ?? job?.client ?? "Unknown";
    const entry = byCustomer.get(key) ?? { name: job?.client || "Customer not set", total: 0, overdue: 0 };
    entry.total += d.outstanding; if (d.days_overdue > 0) entry.overdue += d.outstanding;
    byCustomer.set(key, entry);
  }
  const positionRows = positions ? [...positions.values()].map(p => ({ p, job: jobs.get(p.contract_id), row: jobRows.find(r => r.id === p.contract_id)! }))
    .filter(x => x.job && !["closed", "lost", "tender"].includes(jobStage(x.row.lifecycle_stage as string | null, x.row.start_date as string | null, x.row.end_date as string | null, today).stage)) : [];
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Money</p><h1 className={styles.title}>Debtors, cash flow and profitability</h1>
      <p className={styles.description}>Worked out by the database from the recorded applications, certificates, notices, receipts, gang claims and job costs.</p></div>
      <Link className={styles.secondaryButton} href="/admin/money">Job money</Link></div>
    {unavailable && <p className={styles.warning}>Debt ageing and cash flow arrive with the latest database update, which is not applied yet.</p>}
    <section className={styles.panel} id="debtors" aria-labelledby="debtors-heading">
      <h2 id="debtors-heading">Customers owe {money(buckets.total)}</h2>
      <div className={styles.metrics}>
        {([["Not yet due", buckets.current], ["1–30 days late", buckets.days_1_30], ["31–60 days late", buckets.days_31_60], ["61–90 days late", buckets.days_61_90], ["Over 90 days late", buckets.days_over_90]] as const)
          .map(([label, value]) => <div key={label} className={styles.metric}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{money(value)}</strong></div>)}
      </div>
      {debtLines.length === 0 ? <p>No customer money is outstanding on a submitted or certified application.</p> : <>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th scope="col">Job</th><th scope="col">Application</th><th scope="col">Status</th><th scope="col">Final date for payment</th><th scope="col">Days late</th><th scope="col">Outstanding</th></tr></thead>
          <tbody>{debtLines.sort((a, b) => b.days_overdue - a.days_overdue).map(d => <tr key={d.application_id}>
            <td><Link href={`/admin/contracts/${d.contract_id}/accounts`}>{jobs.get(d.contract_id)?.label}</Link></td>
            <td><Link href={`/admin/contracts/${d.contract_id}/accounts/applications/${d.application_id}`}>Application {d.number}</Link></td>
            <td>{d.display_status.replaceAll("_", " ")}</td><td>{day(d.final_on)}</td><td>{d.days_overdue || "—"}</td><td>{money(d.outstanding)}</td></tr>)}</tbody>
        </table></div>
        <h3>By customer</h3>
        <ul className={styles.plainList}>{[...byCustomer.entries()].sort((a, b) => b[1].total - a[1].total).map(([key, c]) => <li key={key}>
          {key.length === 36 ? <Link href={`/admin/customers/${key}`}>{c.name}</Link> : c.name}: {money(c.total)}{c.overdue ? `, of which ${money(c.overdue)} overdue` : ""}</li>)}</ul>
      </>}
    </section>

    <section className={styles.panel} id="cash-flow" aria-labelledby="cash-heading">
      <h2 id="cash-heading">Cash flow: next 12 weeks</h2>
      <p className={styles.small}>In: outstanding applications on their final date for payment (overdue ones in this week). Out: approved gang payments on their payment date, and claims not yet approved on their due date. Running total starts from nothing; it is not a bank balance.</p>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Week of</th><th scope="col">Expected in</th><th scope="col">Expected out</th><th scope="col">Net</th><th scope="col">Running total</th></tr></thead>
        <tbody>{weeks.map(w => <tr key={w.start}><td>{day(w.start)}</td><td>{money(w.in)}{w.overdueIn ? ` (${money(w.overdueIn)} overdue)` : ""}</td><td>{money(w.out)}</td>
          <td style={w.net < 0 ? { color: "#a3261b" } : undefined}>{money(w.net)}</td><td style={w.running < 0 ? { color: "#a3261b" } : undefined}>{money(w.running)}</td></tr>)}</tbody>
      </table></div>
      {cashLines.length > 0 && <details className={styles.details}><summary>Every expected receipt and payment ({cashLines.length})</summary>
        <ul className={styles.plainList}>{cashLines.sort((a, b) => a.expected_on.localeCompare(b.expected_on)).map(line => <li key={`${line.source}-${line.record_id}-${line.certainty}`}>
          {day(line.expected_on)} · {line.direction === "in" ? "In" : "Out"} {money(line.amount)} · {line.reference} ({line.certainty}) · {jobs.get(line.contract_id)?.label}
          {line.source === "gang_invoice" ? <> · <Link href={`/admin/gang-invoices/${line.record_id}`}>open</Link></> : <> · <Link href={`/admin/contracts/${line.contract_id}/accounts/applications/${line.record_id}`}>open</Link></>}
        </li>)}</ul>
      </details>}
    </section>

    <section className={styles.panel} id="profit" aria-labelledby="profit-heading">
      <h2 id="profit-heading">Profitability by job</h2>
      {positions === null ? <p>The financial position arrives with an earlier database update that is not applied.</p> : positionRows.length === 0 ? <p>No jobs with a recorded budget.</p>
      : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Job</th><th scope="col">Revised value</th><th scope="col">Cost to date</th><th scope="col">Forecast cost</th><th scope="col">Forecast profit</th><th scope="col">Margin</th><th scope="col">Received</th></tr></thead>
        <tbody>{positionRows.map(({ p, job }) => <tr key={p.contract_id}><td><Link href={`/admin/contracts/${p.contract_id}/money`}>{job!.label}</Link></td>
          <td>{money(p.revised_value)}</td><td>{money(p.actual_cost)}</td><td>{money(p.forecast_cost)}</td><td>{money(p.forecast_profit)}</td>
          <td style={belowTarget(p) ? { color: "#a3261b", fontWeight: 700 } : undefined}>{p.forecast_margin === null ? "—" : `${p.forecast_margin.toFixed(1)}%`}{p.target_margin !== null ? ` (target ${p.target_margin}%)` : ""}</td>
          <td>{money(p.received)}</td></tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
