import { basisLabels, frequencyLabels, recoveryLabels, type PaymentTermsRecord } from "@/lib/operations/accounts";
import styles from "@/app/admin/admin.module.css";

// Each contract's own payment terms. Defaults follow the Scheme for Construction Contracts shape
// (due 7 days after the application, final date 17 days later, payment notice within 5 days of the
// due date, pay less notice 7 days before the final date); set the contract's own figures.
export function TermsFields({ terms, retention, narrative }: { terms: PaymentTermsRecord | null; retention: number; narrative: string }) {
  const t = terms;
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  return <>
    <fieldset className={styles.plainFieldset}><legend>How the contract is paid</legend>
      {(Object.keys(basisLabels) as (keyof typeof basisLabels)[]).map(basis => <label key={basis} className={styles.checkboxRow}>
        <input type="radio" name="basis" value={basis} defaultChecked={(t?.basis ?? "interim") === basis} />{basisLabels[basis]}</label>)}
    </fieldset>
    <div className={styles.formGrid}>
      <label className={styles.field}>Interim valuations<select name="valuation_frequency" defaultValue={t?.valuation_frequency ?? "monthly"}>
        {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <small>Used for interim valuations only.</small></label>
      <label className={styles.field}>Monthly valuation day (1 to 31, optional)<input name="valuation_day" inputMode="numeric" defaultValue={t?.valuation_day ?? ""} /></label>
    </div>
    <fieldset className={styles.plainFieldset}><legend>Advance payment</legend>
      <div className={styles.formGrid}>
        <label className={styles.field}>Advance or deposit (£, 0 for none)<input name="advance_payment" inputMode="decimal" defaultValue={pct(t?.advance_payment ?? 0)} /></label>
        <label className={styles.field}>Recovered<select name="advance_recovery" defaultValue={t?.advance_recovery ?? "pro_rata"}>
          {Object.entries(recoveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </fieldset>
    <fieldset className={styles.plainFieldset}><legend>Retention</legend>
      <div className={styles.formGrid}>
        <label className={styles.field}>Retention (%)<input name="retention_percent" inputMode="decimal" defaultValue={pct(retention)} /></label>
        <label className={styles.field}>Limit as % of the contract sum (optional)<input name="retention_cap_percent" inputMode="decimal" defaultValue={pct(t?.retention_cap_percent)} /></label>
        <label className={styles.field}>Or limit as an amount (£, optional)<input name="retention_cap_amount" inputMode="decimal" defaultValue={pct(t?.retention_cap_amount)} /></label>
        <label className={styles.field}>Share released at practical completion (%)<input name="retention_pc_release_percent" inputMode="decimal" defaultValue={pct(t?.retention_pc_release_percent ?? 50)} /></label>
        <label className={styles.field}>Defects period (months)<input name="defects_period_months" inputMode="numeric" defaultValue={t?.defects_period_months ?? 12} /></label>
      </div>
      <label className={styles.checkboxRow}><input type="checkbox" name="retention_on_materials" defaultChecked={t?.retention_on_materials ?? true} />Retention is taken on materials on site</label>
      <p className={styles.small}>The balance is released on the certificate of making good defects.</p>
    </fieldset>
    <label className={styles.checkboxRow}><input type="checkbox" name="materials_on_site" defaultChecked={t?.materials_on_site ?? false} />The contract allows materials on site to be valued</label>
    <fieldset className={styles.plainFieldset}><legend>Payment timing</legend>
      <label className={styles.checkboxRow}><input type="checkbox" name="construction_act" defaultChecked={t?.construction_act ?? true} />
        The Housing Grants, Construction and Regeneration Act applies (untick for a residential occupier)</label>
      <div className={styles.formGrid}>
        <label className={styles.field}>Due date: days after the later of the valuation date and the application<input name="due_days" inputMode="numeric" defaultValue={t?.due_days ?? 7} /></label>
        <label className={styles.field}>Final date for payment: days after the due date<input name="final_payment_days" inputMode="numeric" defaultValue={t?.final_payment_days ?? 17} /></label>
        <label className={styles.field}>Payer&apos;s payment notice: days after the due date<input name="payment_notice_days" inputMode="numeric" defaultValue={t?.payment_notice_days ?? 5} /></label>
        <label className={styles.field}>Pay less notice: days before the final date<input name="pay_less_notice_days" inputMode="numeric" defaultValue={t?.pay_less_notice_days ?? 7} /></label>
      </div>
    </fieldset>
    <fieldset className={styles.plainFieldset}><legend>VAT and CIS</legend>
      <div className={styles.formGrid}>
        <label className={styles.field}>VAT treatment<select name="vat_treatment" defaultValue={t?.vat_treatment ?? "standard"}>
          <option value="standard">Standard rate</option><option value="reduced">Reduced rate</option><option value="zero">Zero rated</option>
          <option value="reverse_charge">Domestic reverse charge</option><option value="exempt">Exempt</option><option value="outside_scope">Outside the scope of VAT</option></select>
          <small>VAT is charged only if TileSPEC&apos;s VAT registration is recorded in the business details.</small></label>
        <label className={styles.field}>VAT rate (%)<input name="vat_rate" inputMode="decimal" defaultValue={pct(t?.vat_rate ?? 20)} /></label>
      </div>
      <label className={styles.checkboxRow}><input type="checkbox" name="cis_applies" defaultChecked={t?.cis_applies ?? false} />The client deducts CIS from payments to TileSPEC</label>
      <label className={styles.field}>CIS deduction rate<select name="cis_rate" defaultValue={String(t?.cis_rate ?? 20)}><option value="0">0% (gross payment status)</option>
        <option value="20">20%</option><option value="30">30%</option></select></label>
    </fieldset>
    <fieldset className={styles.plainFieldset}><legend>Agreed daywork markups (on priced lines)</legend>
      <div className={styles.formGrid}>
        <label className={styles.field}>Labour (%)<input name="daywork_labour_markup" inputMode="decimal" defaultValue={pct(t?.daywork_labour_markup ?? 0)} /></label>
        <label className={styles.field}>Plant (%)<input name="daywork_plant_markup" inputMode="decimal" defaultValue={pct(t?.daywork_plant_markup ?? 0)} /></label>
        <label className={styles.field}>Materials (%)<input name="daywork_materials_markup" inputMode="decimal" defaultValue={pct(t?.daywork_materials_markup ?? 0)} /></label>
      </div>
    </fieldset>
    <fieldset className={styles.plainFieldset}><legend>Who documents are addressed to</legend>
      <div className={styles.formGrid}>
        <label className={styles.field}>Order or subcontract reference<input name="order_reference" maxLength={120} defaultValue={t?.order_reference ?? ""} /></label>
        <label className={styles.field}>Addressed to (blank: the principal contractor, else the client)<input name="bill_to_name" maxLength={160} defaultValue={t?.bill_to_name ?? ""} /></label>
        <label className={styles.field}>Address<textarea name="bill_to_address" maxLength={500} defaultValue={t?.bill_to_address ?? ""} /></label>
        <label className={styles.field}>Accounts email<input name="bill_to_email" type="email" maxLength={254} defaultValue={t?.bill_to_email ?? ""} /></label>
      </div>
    </fieldset>
    <label className={styles.field}>Payment terms as written in the contract (printed on applications)<textarea name="payment_terms" maxLength={4000} defaultValue={narrative} /></label>
  </>;
}
