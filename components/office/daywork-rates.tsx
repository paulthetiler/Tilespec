import { randomUUID } from "node:crypto";
import { saveRateAction } from "@/app/admin/supervisor/daywork-actions";
import { DailyForm } from "@/components/site/daily-form";
import { categoryLabels, currentRates, dayworkUnits, pounds, rateCategories, unitLabels, type DayworkRate } from "@/lib/operations/dayworks";
import styles from "@/app/admin/admin.module.css";

/**
 * The job's day rates (money access only). A change adds a new version and a retired rate stops
 * being offered; prices already worked out keep the exact rate they used.
 */
export function DayworkRates({ contractId, rates }: { contractId: string; rates: DayworkRate[] }) {
  const current = currentRates(rates);
  return <section className={styles.panel} id="daywork-rates" aria-label="Daywork rates">
    <h2>Daywork rates</h2>
    <p className={styles.small}>Money access only. Supervisors record hours and quantities; dayworks are priced from these rates. Changing a rate never alters a daywork already priced.</p>
    {current.length ? <ul className={styles.plainList}>{current.map(rate => <li key={rate.id} data-rate-id={rate.id}>
      <strong>{categoryLabels[rate.category]}: {rate.item}</strong> · {pounds(rate.rate)} per {rate.unit === "m2" ? "m²" : rate.unit}
      <span className={styles.small}> · set by {rate.created_by_name}</span>
      <details className={styles.details}><summary>Change or retire</summary>
        <DailyForm action={saveRateAction} label="Save rate">
          <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="supersedes_id" value={rate.id} /><input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>New rate (£ per {rate.unit === "m2" ? "m²" : rate.unit})<input name="rate" inputMode="decimal" defaultValue={rate.rate.toFixed(2)} /></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="retired" />Retire this rate (stop offering it)</label>
        </DailyForm>
      </details>
    </li>)}</ul> : <p>No daywork rates yet. Dayworks stay awaiting pricing until their lines have rates.</p>}
    <details className={styles.details} open={!current.length}><summary>Add a rate</summary>
      <DailyForm action={saveRateAction} label="Add rate">
        <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={randomUUID()} />
        <label className={styles.field}>Kind<select name="category" defaultValue="operative">{rateCategories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
        <label className={styles.field}>Item (e.g. Tiler, Wet saw, Adhesive 20 kg)<input name="item" required maxLength={120} /></label>
        <label className={styles.field}>Unit (people are always per hour)<select name="unit" defaultValue="hour">{dayworkUnits.map(unit => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}</select></label>
        <label className={styles.field}>Rate (£)<input name="rate" required inputMode="decimal" placeholder="0.00" /></label>
      </DailyForm>
    </details>
  </section>;
}
