import Link from "next/link";
import { OperationsForm } from "@/components/operations/operations-form";
import { calendarDate } from "@/components/operations/format";
import { accreditationSummary, coverStatus, daysUntil, insuranceSummary, type CoverStatus } from "@/lib/operations/companies";
import { insuranceTypeLabels, insuranceTypes, type ActionState, type Company, type CompanyAccreditation, type CompanyInsurance, type Operative, type Team } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
export type CompanyActions = {
  createCompany: Action; updateCompany: Action; recordInsurance: Action; recordAccreditation: Action; voidInsurance: Action; voidAccreditation: Action;
};
type Props = {
  companies: Company[]; insurances: CompanyInsurance[]; accreditations: CompanyAccreditation[]; teams: Team[]; operatives: Operative[];
  selected: string | null; today: string; newKey: () => string; actions: CompanyActions; basePath: string;
};

const badgeFor: Record<CoverStatus, string> = { valid: styles.okBadge, expiring: styles.warningBadge, expired: styles.dangerBadge, none: styles.badge };
const pounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
function expiryText(label: string, expiresOn: string, today: string) {
  const status = coverStatus(expiresOn, today), days = daysUntil(expiresOn, today);
  if (status === "expired") return `${label} expired ${calendarDate(expiresOn)}`;
  if (status === "expiring") return `${label} expires ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`;
  return `${label} to ${calendarDate(expiresOn)}`;
}

function CompanyFields({ company }: { company?: Company }) {
  return <div className={styles.formGrid}>
    <label className={styles.field}>Company name *<input name="name" defaultValue={company?.name} required maxLength={160} placeholder="Smith Tiling Ltd" /></label>
    <label className={styles.field}>Contact name<input name="contact_name" defaultValue={company?.contact_name} maxLength={160} autoComplete="off" /></label>
    <label className={styles.field}>Contact phone<input name="contact_phone" type="tel" defaultValue={company?.contact_phone} maxLength={40} autoComplete="off" /></label>
    <label className={styles.field}>Contact email<input name="contact_email" type="email" defaultValue={company?.contact_email} maxLength={254} autoComplete="off" /></label>
    <label className={styles.field}>Company number<input name="company_number" defaultValue={company?.company_number} maxLength={40} placeholder="Companies House number" /></label>
    <label className={`${styles.field} ${styles.wide}`}>Address<textarea name="address" defaultValue={company?.address} rows={2} maxLength={1000} /></label>
    <label className={`${styles.field} ${styles.wide}`}>Notes<textarea name="notes" defaultValue={company?.notes} rows={2} maxLength={4000} placeholder="Anything the office should know" /></label>
  </div>;
}

function VoidForm({ action, recordId, placeholder }: { action: Action; recordId: string; placeholder: string }) {
  return <OperationsForm action={action} submitLabel="Entered in error" compact>
    <input type="hidden" name="record_id" value={recordId} />
    <label className={styles.field}>Reason *<input name="reason" required minLength={5} maxLength={2000} placeholder={placeholder} /></label>
  </OperationsForm>;
}

// Subcontractors and labour agencies. Each is one record: gangs and operatives
// link to it, so its name is typed once. Insurance and accreditation entries
// are kept as history; a renewal is a new entry.
export function CompanyList({ companies, insurances, accreditations, teams, operatives, selected, today, newKey, actions, basePath }: Props) {
  // Active companies first; the list arrives sorted by name.
  const shown = [...(selected ? companies.filter(company => company.id === selected) : companies)].sort((a, b) => Number(b.active) - Number(a.active));
  return <section className={styles.panel} aria-labelledby="companies-heading">
    <div className={styles.panelHeader}><div><h2 id="companies-heading">Subcontractor companies</h2>
      <p className={styles.muted}>Each company is entered once. Its gangs and operatives are linked to it below.</p></div></div>
    <details className={`${styles.disclosure} ${styles.panelDisclosure}`}>
      <summary>+ Add a company</summary>
      <OperationsForm action={actions.createCompany} submitLabel="Add company">
        <input type="hidden" name="request_key" value={newKey()} />
        <CompanyFields />
      </OperationsForm>
    </details>
    <div className={styles.cardList}>{shown.map(company => {
      const insurance = insuranceSummary(insurances, company.id, today);
      const accredited = accreditationSummary(accreditations, company.id, today);
      const gangs = teams.filter(team => team.company_id === company.id && team.active).length;
      const people = operatives.filter(person => person.company_id === company.id && person.status !== "inactive").length;
      const contact = [company.contact_name, company.contact_phone, company.contact_email].filter(Boolean).join(" · ");
      const ownInsurance = insurances.filter(entry => entry.company_id === company.id);
      const ownAccreditations = accreditations.filter(entry => entry.company_id === company.id);
      return <article key={company.id} className={styles.card}>
        <div className={styles.cardTop}>
          <div><h3>{company.name}</h3><p className={styles.small}>{contact || "No contact details yet"}</p></div>
          {!company.active && <span className={styles.badge}>Inactive</span>}
        </div>
        <p className={styles.small}>{gangs} {gangs === 1 ? "active gang" : "active gangs"} · {people} {people === 1 ? "operative" : "operatives"}</p>
        <ul className={styles.badgeRow} aria-label={`${company.name} insurance and accreditations`}>
          <li className={badgeFor[insurance.status]}>{insurance.attention
            ? expiryText(insurance.status === "valid" ? "Insurance valid" : insuranceTypeLabels[insurance.attention.entry.insurance_type], insurance.attention.entry.expires_on, today)
            : "No insurance recorded"}</li>
          {accredited.schemes.map(({ entry, status }) => <li key={entry.id} className={badgeFor[status]}>
            {entry.expires_on ? expiryText(entry.scheme, entry.expires_on, today) : entry.scheme}</li>)}
        </ul>
        <div className={`${styles.rowActions} ${styles.cardActions}`}>
        {selected !== company.id && <Link className={styles.secondaryButton} href={`${basePath}?company=${company.id}`} aria-label={`Show ${company.name} gangs and people`}>Show gangs and people</Link>}
        <details className={styles.disclosure}>
          <summary aria-label={`Manage ${company.name}`}>Manage company</summary>
          <div className={styles.stack}>
            <details className={styles.details}>
              <summary>Company details</summary>
              <OperationsForm action={actions.updateCompany} submitLabel="Save company">
                <input type="hidden" name="company_id" value={company.id} />
                <input type="hidden" name="version" value={company.version} />
                <CompanyFields company={company} />
                <label className={styles.checkboxRow}><input type="checkbox" name="active" defaultChecked={company.active} />Active (gangs and operatives can be linked)</label>
              </OperationsForm>
            </details>
            <details className={styles.details}>
              <summary>Insurance ({ownInsurance.length})</summary>
              <div className={styles.stack}>
                {ownInsurance.map(entry => <details key={entry.id} className={styles.details}>
                  <summary>{insuranceTypeLabels[entry.insurance_type]}{entry.insurer ? ` · ${entry.insurer}` : ""} · expires {calendarDate(entry.expires_on)}</summary>
                  <p className={styles.small}>{[entry.policy_number && `Policy ${entry.policy_number}`, entry.cover_amount !== null && `Cover ${pounds.format(entry.cover_amount)}`,
                    entry.starts_on && `From ${calendarDate(entry.starts_on)}`, entry.notes].filter(Boolean).join(" · ") || "No further details."}</p>
                  <VoidForm action={actions.voidInsurance} recordId={entry.id} placeholder="Recorded against the wrong company" />
                </details>)}
                <OperationsForm action={actions.recordInsurance} submitLabel="Record insurance">
                  <input type="hidden" name="request_key" value={newKey()} />
                  <input type="hidden" name="company_id" value={company.id} />
                  <p className={styles.small}>Renewed a policy? Record the new one; the old entry stays as history.</p>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Type *<select name="insurance_type" defaultValue="public_liability">
                      {insuranceTypes.map(type => <option key={type} value={type}>{insuranceTypeLabels[type]}</option>)}</select></label>
                    <label className={styles.field}>Expiry date *<input type="date" name="expires_on" required /></label>
                    <label className={styles.field}>Insurer<input name="insurer" maxLength={160} /></label>
                    <label className={styles.field}>Policy number<input name="policy_number" maxLength={80} /></label>
                    <label className={styles.field}>Cover (£)<input name="cover_amount" inputMode="numeric" maxLength={25} placeholder="5000000" /></label>
                    <label className={styles.field}>Start date<input type="date" name="starts_on" /></label>
                  </div>
                </OperationsForm>
              </div>
            </details>
            <details className={styles.details}>
              <summary>Accreditations ({ownAccreditations.length})</summary>
              <div className={styles.stack}>
                {ownAccreditations.map(entry => <details key={entry.id} className={styles.details}>
                  <summary>{entry.scheme}{entry.reference ? ` · ${entry.reference}` : ""}{entry.expires_on ? ` · expires ${calendarDate(entry.expires_on)}` : ""}</summary>
                  {entry.notes && <p className={styles.small}>{entry.notes}</p>}
                  <VoidForm action={actions.voidAccreditation} recordId={entry.id} placeholder="Recorded against the wrong company" />
                </details>)}
                <OperationsForm action={actions.recordAccreditation} submitLabel="Record accreditation">
                  <input type="hidden" name="request_key" value={newKey()} />
                  <input type="hidden" name="company_id" value={company.id} />
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Scheme or competence *<input name="scheme" required maxLength={160} placeholder="CHAS, Constructionline, SafeContractor" /></label>
                    <label className={styles.field}>Reference<input name="reference" maxLength={80} /></label>
                    <label className={styles.field}>Expiry date<input type="date" name="expires_on" /><small>Leave blank if it does not expire.</small></label>
                  </div>
                </OperationsForm>
              </div>
            </details>
          </div>
        </details>
        </div>
      </article>;
    })}</div>
    {companies.length === 0 && <p className={styles.empty}>No companies yet. Add each subcontractor or labour agency once, then link its gangs and operatives to it.</p>}
  </section>;
}
