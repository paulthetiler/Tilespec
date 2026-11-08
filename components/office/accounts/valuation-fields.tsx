import { formatPounds } from "@/lib/operations/money";
import { londonDate } from "@/lib/operations/planning";
import type { ApplicationKind, Extra, Line, Stage, Terms } from "@/lib/operations/accounts";
import styles from "@/app/admin/admin.module.css";

// The office's valuation, cumulative to the period end. Only what the server says may be claimed is
// offered: agreed extras (approved, charge approved, authorised where required, not disputed, not in
// a variation), the contract's own stages, and materials on site where the contract allows them.
export function ValuationFields({ kind, terms, extras, stages, lines, periodEnd, cisMaterials, note }: {
  kind: ApplicationKind; terms: Terms; extras: Extra[]; stages: Stage[]; lines?: Line[]; periodEnd?: string; cisMaterials?: number; note?: string | null;
}) {
  const line = (k: Line["kind"]) => lines?.find(l => l.kind === k);
  const deductions = lines?.filter(l => l.kind === "deduction") ?? [];
  const claimable = extras.filter(e => e.claimable), live = stages.filter(s => !s.voided_at);
  const staged = terms.basis === "milestones" || terms.basis === "schedule";
  const works = line("contract_works"), materials = line("materials_on_site"), other = line("other");
  return <>
    <label className={styles.field}>Valuation runs to<input type="date" name="period_end" defaultValue={periodEnd ?? londonDate()} required /></label>
    {kind === "advance" ? <p className={styles.small}>An advance payment application claims the agreed advance of {formatPounds(terms.advance_payment)}. It has no valuation lines;
      later applications recover it as the payment terms say.</p> : <>
      {!staged && <>
        <label className={styles.field}>Value of contract works completed to date (£, gross, excluding VAT)
          <input name="contract_works" inputMode="decimal" defaultValue={works ? String(works.amount) : ""} /></label>
        <label className={styles.field}>Description (optional)<input name="contract_works_description" maxLength={300} defaultValue={works?.description ?? ""} /></label>
      </>}
      {live.length > 0 && <fieldset className={styles.plainFieldset}><legend>Stages reached</legend>
        <p className={styles.small}>Tick each stage reached. A stage stays in every later application, so it is never paid twice.</p>
        {live.map(stage => {
          const claimed = lines?.find(l => l.stage_id === stage.id);
          return <div key={stage.id} className={styles.card}>
            <label className={styles.checkboxRow}><input type="checkbox" name={`stage_${stage.id}`} defaultChecked={!!claimed} />{stage.label} ({formatPounds(stage.amount)})</label>
            <label className={styles.field}>Value to claim, up to {formatPounds(stage.amount)}<input name={`stage_amount_${stage.id}`} inputMode="decimal"
              defaultValue={String(claimed?.amount ?? stage.amount)} /></label>
          </div>;
        })}
      </fieldset>}
      <fieldset className={styles.plainFieldset}><legend>Agreed variations and dayworks</legend>
        {claimable.length ? claimable.map(extra => {
          const claimed = lines?.find(l => l.daywork_id === extra.daywork_id);
          return <div key={extra.daywork_id} className={styles.card}>
            <label className={styles.checkboxRow}><input type="checkbox" name={`claim_${extra.daywork_id}`} defaultChecked={lines ? !!claimed : true} />
              {extra.reference}: {extra.description.slice(0, 90)}</label>
            <label className={styles.field}>Value to claim, up to the agreed {formatPounds(extra.approved_total ?? 0)}
              <input name={`amount_${extra.daywork_id}`} inputMode="decimal" defaultValue={String(claimed?.amount ?? extra.approved_total ?? "")} /></label>
          </div>;
        }) : <p className={styles.small}>None agreed yet. An extra can be claimed once the office approves it, its charge is approved and, where the contract
          requires, the client authorises it. Disputed extras and dayworks included in a variation are never offered.</p>}
      </fieldset>
      {terms.materials_on_site ? <>
        <label className={styles.field}>Materials on site (£, optional)<input name="materials_on_site" inputMode="decimal" defaultValue={materials ? String(materials.amount) : ""} /></label>
        <label className={styles.field}>Materials description<input name="materials_description" maxLength={300} defaultValue={materials?.description ?? ""} /></label>
      </> : <p className={styles.small}>This contract does not provide for materials on site to be valued.</p>}
      <label className={styles.field}>Other addition (£, optional)<input name="other_amount" inputMode="decimal" defaultValue={other ? String(other.amount) : ""} /></label>
      <label className={styles.field}>What the other addition is for<input name="other_description" maxLength={300} defaultValue={other?.description ?? ""} /></label>
      <fieldset className={styles.plainFieldset}><legend>Agreed deductions (contra charges, set-off agreed with the client)</legend>
        {[1, 2, 3].map(n => <div key={n} className={styles.formGrid}>
          <label className={styles.field}>Amount (£)<input name={`deduction_${n}`} inputMode="decimal" defaultValue={deductions[n - 1] ? String(deductions[n - 1].amount) : ""} /></label>
          <label className={styles.field}>What it is for<input name={`deduction_${n}_description`} maxLength={300} defaultValue={deductions[n - 1]?.description ?? ""} /></label>
        </div>)}
      </fieldset>
    </>}
    {terms.cis_applies && <label className={styles.field}>Materials included in this payment, for CIS (£, optional)
      <input name="cis_materials" inputMode="decimal" defaultValue={cisMaterials ? String(cisMaterials) : ""} />
      <small>CIS is deducted from the labour element only. Enter the cost of materials in this period&apos;s sum.</small></label>}
    <label className={styles.field}>Note printed on the application (optional)<textarea name="note" maxLength={1000} defaultValue={note ?? ""} /></label>
    <p className={styles.small}>Values are cumulative to the valuation date. The database works out retention, advance recovery, the previous sums and VAT, and fixes
      them when you issue the application.</p>
  </>;
}
