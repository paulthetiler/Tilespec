import { pounds } from "@/lib/operations/dayworks";
import { belowTarget, positionWarnings, type FinancialPosition } from "@/lib/operations/financial-position";
import styles from "@/app/admin/admin.module.css";

const percent = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);
const metric = (label: string, value: string, note?: string) => <div className={styles.metric} key={label}>
  <span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong>{note && <span className={styles.small}>{note}</span>}</div>;

/**
 * Money access only. Every figure is the database's own; nothing is added up here.
 * `compact` shows the headline (value, cost, forecast, cash); the full view shows each part.
 */
export function FinancialPositionView({ position: p, compact = false }: { position: FinancialPosition; compact?: boolean }) {
  const warnings = positionWarnings(p);
  return <div data-financial-position={p.contract_id}>
    <div className={styles.metrics}>
      {metric("Revised contract value", pounds(p.revised_value), `${pounds(p.original_value)} original + ${pounds(p.extras_agreed)} agreed extras`)}
      {metric("Cost to date", pounds(p.actual_cost), `Budget ${pounds(p.budget_cost)}`)}
      {metric("Forecast profit", pounds(p.forecast_profit), `Margin ${percent(p.forecast_margin)}${p.target_margin !== null ? `, target ${p.target_margin.toFixed(0)}%` : ""}`)}
      {metric("Certified and received", p.certified_net === null ? "Not certified" : pounds(p.certified_net),
        `${pounds(p.received)} received${p.outstanding !== null ? `, ${pounds(p.outstanding)} outstanding` : ""}`)}
    </div>
    {belowTarget(p) && <p className={styles.warning}><strong>Below target margin.</strong> The forecast is {percent(p.forecast_margin)} against a target of {percent(p.target_margin)}.</p>}
    {!compact && <div className={styles.tableWrap}><table className={styles.table}><tbody>
      <tr><th>Original contract value</th><td>{pounds(p.original_value)}</td></tr>
      <tr><th>Agreed extras ({p.extras_agreed_count})</th><td>{pounds(p.extras_agreed)}</td></tr>
      <tr><th>Pending extras, not yet agreed ({p.extras_pending_count})</th><td>{pounds(p.extras_pending)}</td></tr>
      <tr><th>Revised contract value</th><td><strong>{pounds(p.revised_value)}</strong></td></tr>
      <tr><th>Labour from attendance</th><td>{pounds(p.labour_cost)}</td></tr>
      <tr><th>Materials</th><td>{pounds(p.materials_cost)}</td></tr>
      <tr><th>Subcontract</th><td>{pounds(p.subcontract_cost)}</td></tr>
      <tr><th>Plant</th><td>{pounds(p.plant_cost)}</td></tr>
      <tr><th>Other</th><td>{pounds(p.other_cost)}</td></tr>
      <tr><th>Cost to date</th><td><strong>{pounds(p.actual_cost)}</strong></td></tr>
      <tr><th>Forecast final cost (cost to date plus unspent budget)</th><td>{pounds(p.forecast_cost)}</td></tr>
      <tr><th>Contingency held back</th><td>{pounds(p.contingency)}</td></tr>
      <tr><th>Forecast profit</th><td><strong>{pounds(p.forecast_profit)}</strong> ({percent(p.forecast_margin)})</td></tr>
      <tr><th>Original budgeted profit</th><td>{pounds(p.budget_profit)} ({percent(p.budget_margin)})</td></tr>
      <tr><th>Latest application, gross</th><td>{p.applied_gross === null ? "None submitted" : pounds(p.applied_gross)}</td></tr>
      <tr><th>Latest certificate, gross</th><td>{p.certified_gross === null ? "None" : pounds(p.certified_gross)}</td></tr>
      <tr><th>Retention held ({p.retention_percent}%)</th><td>{p.retention_held === null ? "None" : pounds(p.retention_held)}</td></tr>
      <tr><th>Received</th><td>{pounds(p.received)}</td></tr>
      <tr><th>Outstanding against the certificate</th><td>{p.outstanding === null ? "None" : pounds(p.outstanding)}</td></tr>
    </tbody></table></div>}
    {warnings.length > 0 && <ul className={styles.plainList} aria-label="Before relying on these figures">{warnings.map(w => <li key={w} className={styles.small}>{w}</li>)}</ul>}
  </div>;
}
