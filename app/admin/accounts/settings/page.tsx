import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { saveBillingProfileAction } from "@/app/admin/accounts-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { billingProfileFor } from "@/lib/operations/accounts-data";
import { cisStatusLabels } from "@/lib/operations/accounts";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

// TileSPEC's own details for commercial documents. Recorded by the owner; nothing is assumed or
// invented. Documents print only what is recorded here, and keep what they printed when issued.
export default async function BusinessDetails() {
  const { supabase, member } = await requireFinancialActor();
  const { profile, available } = await billingProfileFor(supabase);
  const owner = member.role === "owner", p = profile;
  const header = <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Accounts</p><h1 className={styles.title}>Business details on documents</h1>
    <p className={styles.description}>What TileSPEC&apos;s applications, invoices and statements print about TileSPEC. Leave anything blank that is not confirmed.</p></div>
    <Link className={styles.secondaryButton} href="/admin/contracts">Contracts</Link></div>;
  if (!available) return <>{header}<p className={styles.warning}>Business details are not available until the office applies the database update.</p></>;
  const field = (name: keyof NonNullable<typeof p>, label: string, extra: Record<string, unknown> = {}) =>
    <label className={styles.field}>{label}<input name={name} defaultValue={(p?.[name] as string | null) ?? ""} disabled={!owner} {...extra} /></label>;
  return <>
    {header}
    {!p?.vat_registered && <p className={styles.warning}>No VAT registration is recorded. Documents charge no VAT and print no VAT number until it is.</p>}
    <section className={styles.panel} aria-label="Business details">
      <h2>Details</h2>
      {!owner && <p className={styles.small}>Only the owner can change these details.</p>}
      <OperationsForm key={`profile-${p?.version ?? 0}`} action={saveBillingProfileAction} submitLabel="Save business details">
        <input type="hidden" name="version" value={p?.version ?? 0} />
        <div className={styles.formGrid}>
          {field("legal_name", "Registered company or legal name", { maxLength: 160 })}
          {field("trading_name", "Trading name, if different", { maxLength: 160 })}
          <label className={styles.field}>Registered or business address<textarea name="registered_address" maxLength={500} defaultValue={p?.registered_address ?? ""} disabled={!owner} /></label>
          {field("company_number", "Companies House number (optional)", { maxLength: 12 })}
          {field("email", "Accounts email", { type: "email", maxLength: 254 })}
          {field("phone", "Telephone", { maxLength: 40 })}
          {field("website", "Website", { maxLength: 200 })}
        </div>
        <fieldset className={styles.plainFieldset}><legend>VAT</legend>
          <label className={styles.checkboxRow}><input type="checkbox" name="vat_registered" defaultChecked={p?.vat_registered ?? false} disabled={!owner} />TileSPEC is registered for VAT</label>
          {field("vat_number", "VAT registration number", { maxLength: 20 })}
        </fieldset>
        <label className={styles.field}>CIS status (for reference)<select name="cis_status" defaultValue={p?.cis_status ?? "not_registered"} disabled={!owner}>
          {Object.entries(cisStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <small>The rate a client deducts is set on each contract&apos;s payment terms.</small></label>
        <fieldset className={styles.plainFieldset}><legend>Payment details printed on documents</legend>
          <div className={styles.formGrid}>
            {field("bank_account_name", "Account name", { maxLength: 120 })}
            {field("bank_sort_code", "Sort code", { maxLength: 10, inputMode: "numeric" })}
            {field("bank_account_number", "Account number", { maxLength: 12, inputMode: "numeric" })}
          </div>
          <label className={styles.field}>Payment instructions (optional)<input name="payment_instructions" maxLength={500} defaultValue={p?.payment_instructions ?? ""} disabled={!owner} /></label>
        </fieldset>
        <label className={styles.field}>Footer line on every document (optional)<input name="document_footer" maxLength={500} defaultValue={p?.document_footer ?? ""} disabled={!owner} /></label>
        <p className={styles.small}>Changes apply to documents issued from now on. Documents already issued keep exactly what they printed.</p>
      </OperationsForm>
      {p && <p className={styles.small}>Last changed by {p.updated_by_name ?? "the owner"}.</p>}
    </section>
  </>;
}
