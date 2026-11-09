import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinancialActor } from "@/lib/auth";
import {
  addStageAction, createApplicationAction, disputeAction, includeDayworkAction, issueDocumentAction, recordCompletionAction, removeInclusionAction,
  resolveDisputeAction, revokeShareAction, savePaymentTermsAction, voidStageAction,
} from "@/app/admin/accounts-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { ExtraBadge, StatusBadge } from "@/components/office/accounts/status";
import { ShareDocument } from "@/components/office/accounts/share-document";
import { TermsFields } from "@/components/office/accounts/terms-fields";
import { ValuationFields } from "@/components/office/accounts/valuation-fields";
import { checkDatabase } from "@/lib/operations/data";
import { accountsFor, billingProfileFor } from "@/lib/operations/accounts-data";
import {
  basisLabels, documentKindLabels, frequencyLabels, kindLabels, nextStep, recoveryLabels, vatLabels, type ApplicationKind, type IssuedDocument,
} from "@/lib/operations/accounts";
import { formatPercent, formatPounds } from "@/lib/operations/money";
import { londonDate } from "@/lib/operations/planning";
import { longDate } from "@/lib/documents/model";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISABLE = new Set(["payment_application", "final_account", "variation_schedule", "daywork_summary", "statement"]);

// One job's accounts (money access only): its payment terms, applications and invoices, variations
// and dayworks, reports and every issued document. Every figure comes from the database.
export default async function JobAccounts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireFinancialActor();
  const contract = await supabase.from("contracts").select("id,reference,name,client,principal_contractor").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const [accounts, billing] = await Promise.all([accountsFor(supabase, id), billingProfileFor(supabase)]);
  const header = <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.data.reference} · Accounts</p>
    <h1 className={styles.title}>Accounts and invoicing</h1><p className={styles.description}>{contract.data.name}. Figures are worked out by the database; issued documents never change.</p></div>
    <div className={styles.inline}><Link className={styles.secondaryButton} href={`/admin/contracts/${id}`}>Back to the job</Link>
      <Link className={styles.secondaryButton} href={`/admin/contracts/${id}/money`}>Job money</Link></div></div>;
  if (!accounts || !billing.available) return <>{header}<p className={styles.warning}>Accounts and invoicing are not available until the office applies the database update.</p></>;
  const { account, terms, stages, documents, shares, inclusions, disputes, commercial } = accounts;
  const t = account.terms, profile = billing.profile;
  const job = <input type="hidden" name="contract_id" value={id} />;
  const key = () => <input type="hidden" name="request_key" value={randomUUID()} />;
  const draft = account.applications.find(a => a.status === "draft");
  const live = account.applications.filter(a => a.status !== "cancelled");
  const finalSubmitted = live.some(a => a.kind === "final" && a.status !== "draft");
  const kinds: ApplicationKind[] = finalSubmitted ? ["final"] : t.basis === "completion" ? ["final"] : ["interim", "final"];
  if (t.advance_payment > 0 && !live.length) kinds.unshift("advance");
  const variations = account.extras.filter(e => e.kind === "variation"), dayworks = account.extras.filter(e => e.kind === "daywork");
  const extraRef = (dayworkId: string | null) => account.extras.find(e => e.daywork_id === dayworkId)?.reference ?? "";
  const setup = [
    !profile?.legal_name && !profile?.trading_name ? "TileSPEC's business name is not recorded, so documents cannot be issued yet." : null,
    !profile?.vat_registered ? "No VAT registration is recorded: documents charge no VAT and print no VAT number. Record it in the business details if TileSPEC is registered." : null,
    !commercial ? "The contract value is not recorded. Record the original budget on the job page first." : null,
    !terms ? "This contract's payment terms are not set. Until they are, applications use the original budget's retention only." : null,
  ].filter((x): x is string => !!x);
  const docLink = (d: IssuedDocument, download = false) => `/admin/contracts/${id}/accounts/documents/${d.id}${download ? "?download=1" : ""}`;

  return <>
    {header}
    {setup.length > 0 && <section className={styles.warning} aria-label="Set-up"><h2>Before you issue documents</h2><ul>{setup.map(s => <li key={s}>{s}</li>)}</ul>
      {member.role === "owner" ? <p><Link href="/admin/accounts/settings">Business details</Link></p> : <p className={styles.small}>Only the owner can record TileSPEC&apos;s business details.</p>}</section>}

    <section className={styles.panel} aria-label="Invoice workflow">
      <h2>Raise an invoice — three steps</h2>
      <p className={styles.description}>Start with the contract settings, prepare the amount to claim, then preview and issue. You do not need to go back through site setup.</p>
      <div className={styles.inline}>
        <a className={styles.secondaryButton} href="#terms">1. Set payment terms</a>
        <a className={styles.secondaryButton} href="#applications">2. Prepare the claim</a>
        <a className={styles.secondaryButton} href="#documents">3. Issue and track</a>
      </div>
      {!commercial && <p className={styles.warning}>First record the original contract value on <Link href={`/admin/contracts/${id}#commercial-budget`}>this job's commercial budget</Link>. Until that is done, the payment terms form is unavailable. The figures shown below are system defaults, not agreed terms.</p>}
      {commercial && !terms && <p className={styles.warning}>These are starting defaults, not approved contract terms. Open “Set the payment terms” below and save the terms actually agreed with the client before creating a payment application.</p>}
      <p className={styles.small}>To practise without affecting real accounts, use a designated demo contract and do not issue or share a document.</p>
    </section>
    <section className={styles.panel} id="terms" aria-label="Contract and payment terms">
      <h2>1. Contract and payment terms</h2>
      <dl className={styles.detailGrid}>
        <div className={styles.detailItem}><dt>Original contract sum</dt><dd>{commercial ? formatPounds(commercial.contract_value) : "Not recorded"}</dd></div>
        <div className={styles.detailItem}><dt>Payment basis</dt><dd>{basisLabels[t.basis]}{t.basis === "interim" && t.valuation_frequency ? `, ${frequencyLabels[t.valuation_frequency].toLowerCase()}` : ""}
          {t.valuation_day ? ` to day ${t.valuation_day}` : ""}</dd></div>
        <div className={styles.detailItem}><dt>Retention</dt><dd>{formatPercent(t.retention_percent)}{t.retention_cap_percent !== null ? `, limited to ${formatPercent(t.retention_cap_percent)} of the contract sum` : ""}
          {t.retention_cap_amount !== null ? `, limited to ${formatPounds(t.retention_cap_amount)}` : ""}; {formatPercent(t.retention_pc_release_percent)} released at practical completion, the balance on making good ({t.defects_period_months} month defects period)</dd></div>
        <div className={styles.detailItem}><dt>Advance payment</dt><dd>{t.advance_payment > 0 ? `${formatPounds(t.advance_payment)}, recovered ${recoveryLabels[t.advance_recovery].toLowerCase()}` : "None"}</dd></div>
        <div className={styles.detailItem}><dt>Materials on site</dt><dd>{t.materials_on_site ? `Valued${t.retention_on_materials ? ", with retention" : ", without retention"}` : "Not valued"}</dd></div>
        <div className={styles.detailItem}><dt>Payment timing</dt><dd>Due {t.due_days} days after the application; final date {t.final_payment_days} days later; payment notice within {t.payment_notice_days} days of the due date;
          pay less notice {t.pay_less_notice_days} days before the final date{t.construction_act ? " (Construction Act applies)" : " (Construction Act does not apply)"}</dd></div>
        <div className={styles.detailItem}><dt>VAT</dt><dd>{vatLabels[t.vat_treatment]}{["standard", "reduced", "reverse_charge"].includes(t.vat_treatment) ? ` at ${formatPercent(t.vat_rate)}` : ""}</dd></div>
        <div className={styles.detailItem}><dt>CIS</dt><dd>{t.cis_applies ? `Deducted by the client at ${formatPercent(t.cis_rate)} of labour` : "Not deducted"}</dd></div>
        <div className={styles.detailItem}><dt>Completion</dt><dd>{t.practical_completion_on ? `Practical completion ${longDate(t.practical_completion_on)}` : "Not complete"}
          {t.making_good_on ? `; making good ${longDate(t.making_good_on)}` : ""}</dd></div>
        {terms && <div className={styles.detailItem}><dt>Daywork markups</dt><dd>Labour {formatPercent(terms.daywork_labour_markup)}, plant {formatPercent(terms.daywork_plant_markup)},
          materials {formatPercent(terms.daywork_materials_markup)}</dd></div>}
      </dl>
      {commercial && <details className={styles.details} open={!terms}><summary>{terms ? "Edit payment terms — click to change" : "Set the payment terms — start here"}</summary>
        <OperationsForm key={`terms-${terms?.version ?? 0}`} action={savePaymentTermsAction} submitLabel="Save payment terms">
          {job}<input type="hidden" name="version" value={terms?.version ?? 0} />
          <TermsFields terms={terms} retention={commercial.retention_percent} narrative={commercial.payment_terms} />
        </OperationsForm></details>}
      {terms && <details className={styles.details}><summary>Record practical completion or making good</summary>
        <OperationsForm key={`completion-${terms.version}`} action={recordCompletionAction} submitLabel="Record">
          {job}<input type="hidden" name="version" value={terms.version} />
          <label className={styles.field}>Practical completion<input type="date" name="practical_completion_on" max={londonDate()} defaultValue={terms.practical_completion_on ?? ""} /></label>
          <label className={styles.field}>Certificate of making good defects<input type="date" name="making_good_on" max={londonDate()} defaultValue={terms.making_good_on ?? ""} /></label>
          <p className={styles.small}>Retention is released on the next application valued to that date or later.</p>
        </OperationsForm></details>}
      {(t.basis === "milestones" || t.basis === "schedule" || stages.length > 0) && <div>
        <h3>Payment stages</h3>
        {stages.filter(s => !s.voided_at).length ? <ol className={styles.plainList}>{stages.filter(s => !s.voided_at).map(stage => <li key={stage.id}>
          <strong>{stage.label}</strong>: {formatPounds(stage.amount)}{stage.planned_on ? ` · planned ${longDate(stage.planned_on)}` : ""}
          <details className={styles.details}><summary>Remove</summary><OperationsForm action={voidStageAction} submitLabel="Remove this stage" compact>
            {job}<input type="hidden" name="stage_id" value={stage.id} /><label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
          </OperationsForm></details></li>)}</ol> : <p className={styles.small}>No stages yet.</p>}
        <details className={styles.details}><summary>Add a stage</summary><OperationsForm action={addStageAction} submitLabel="Add stage">
          {job}{key()}<label className={styles.field}>Stage or milestone<input name="label" required minLength={2} maxLength={200} /></label>
          <label className={styles.field}>Value (£)<input name="amount" inputMode="decimal" required /></label>
          <label className={styles.field}>Planned date (optional)<input type="date" name="planned_on" /></label>
          <label className={styles.field}>Note (optional)<input name="note" maxLength={500} /></label>
        </OperationsForm></details>
      </div>}
    </section>

    <section className={styles.panel} id="applications" aria-label="Applications and invoices">
      <h2>2. Applications and invoices</h2>
      {account.applications.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>No.</th><th>Valuation date</th><th>Status</th>
        <th>Applied this period</th><th>Sum due</th><th>Received</th><th>Outstanding</th><th>Next</th></tr></thead>
        <tbody>{account.applications.map(row => <tr key={row.application_id} data-application-number={row.number}>
          <td><Link href={`/admin/contracts/${id}/accounts/applications/${row.application_id}`}>{row.number} · {kindLabels[row.kind]}</Link></td>
          <td>{longDate(row.period_end)}</td><td><StatusBadge status={row.display_status} /></td>
          <td>{row.status === "cancelled" ? "" : formatPounds(row.applied_this_period)}</td><td>{row.status === "cancelled" ? "" : formatPounds(row.due_this_period)}</td>
          <td>{formatPounds(row.received)}</td><td>{row.status === "cancelled" || row.status === "draft" ? "" : formatPounds(row.outstanding)}</td>
          <td className={styles.small}>{nextStep(row, account.as_at)}</td></tr>)}</tbody></table></div>
        : <p>No applications yet.</p>}
      {draft ? <p className={styles.small}>Application {draft.number} is a draft. <Link href={`/admin/contracts/${id}/accounts/applications/${draft.application_id}`}>Check and issue it</Link> before starting another.</p>
        : commercial ? <details className={styles.details} open={!account.applications.length}><summary>New application</summary>
          <OperationsForm action={createApplicationAction} submitLabel="Save as draft">
            {job}{key()}
            <fieldset className={styles.plainFieldset}><legend>Kind</legend>{kinds.map((kind, i) => <label key={kind} className={styles.checkboxRow}>
              <input type="radio" name="kind" value={kind} defaultChecked={i === 0} />{kindLabels[kind]}{kind === "final" && !t.practical_completion_on ? " (record practical completion first)" : ""}</label>)}</fieldset>
            <ValuationFields kind={kinds[0] === "advance" ? "interim" : kinds[0]} terms={t} extras={account.extras} stages={stages}
              lines={(() => { const last = [...live].reverse().find(a => a.kind !== "advance"); return last ? accounts.lines.filter(l => l.application_id === last.application_id) : undefined; })()} />
            <p className={styles.small}>Figures from the last application are filled in as a starting point. An advance application ignores the valuation lines.</p>
          </OperationsForm></details> : null}
    </section>

    <section className={styles.panel} id="extras" aria-label="Variations and dayworks">
      <h2>3. Variations and dayworks</h2>
      <p className={styles.muted}>Only approved extras are in the revised contract sum and can be claimed. Approved means: office approval, the charge approved, and the client&apos;s
        authorisation where the contract requires it. Disputed and rejected extras are never claimed. Site records and pricing are on the <Link href={`/admin/supervisor/sites/${id}/commercial?kind=variations`}>variations</Link> and <Link href={`/admin/supervisor/sites/${id}/commercial?kind=dayworks`}>dayworks</Link> pages.</p>
      {account.extras.filter(e => e.state !== "draft").length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Ref.</th><th>Description</th><th>Status</th>
        <th>Value</th><th>Charged</th></tr></thead><tbody>{[...variations, ...dayworks].filter(e => e.state !== "draft").map(e => <tr key={e.daywork_id}>
          <td>{e.reference}</td><td>{e.description}</td><td><ExtraBadge state={e.state} /></td>
          <td>{e.approved_total !== null ? formatPounds(e.approved_total) : e.latest_total !== null ? `${formatPounds(e.latest_total)} (not agreed)` : "Not priced"}</td>
          <td className={styles.small}>{e.included_in ? `Within ${extraRef(e.included_in)}` : e.claimable ? "Can be claimed" : e.state === "approved" ? "" : "No"}</td></tr>)}</tbody></table></div>
        : <p>No variations or dayworks have been sent to the office yet.</p>}
      {variations.some(v => v.state !== "rejected") && dayworks.some(d => !d.included_in && d.state !== "rejected") && <details className={styles.details}>
        <summary>A daywork is valued within a variation</summary>
        <OperationsForm action={includeDayworkAction} submitLabel="Include it in the variation">
          {job}{key()}
          <label className={styles.field}>Daywork<select name="daywork_id" required defaultValue=""><option value="">Choose</option>
            {dayworks.filter(d => !d.included_in && d.state !== "rejected").map(d => <option key={d.daywork_id} value={d.daywork_id}>{d.reference}: {d.description.slice(0, 60)}</option>)}</select></label>
          <label className={styles.field}>Variation<select name="variation_id" required defaultValue=""><option value="">Choose</option>
            {variations.filter(v => v.state !== "rejected").map(v => <option key={v.daywork_id} value={v.daywork_id}>{v.reference}: {v.description.slice(0, 60)}</option>)}</select></label>
          <label className={styles.field}>Note (optional)<input name="note" maxLength={500} /></label>
          <p className={styles.small}>The daywork is then never charged on its own. Not possible once either has been applied for.</p>
        </OperationsForm></details>}
      {inclusions.filter(i => !i.voided_at).map(i => <details key={i.id} className={styles.details}><summary>{extraRef(i.daywork_id)} is within {extraRef(i.variation_id)}: undo</summary>
        <OperationsForm action={removeInclusionAction} submitLabel="Charge it separately again" compact>{job}<input type="hidden" name="inclusion_id" value={i.id} />
          <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>)}
      {disputes.filter(d => d.daywork_id && !d.resolved_on).map(d => <div key={d.id} className={styles.card}>
        <p><strong>{extraRef(d.daywork_id)} disputed</strong> since {longDate(d.raised_on)}: {d.summary}</p>
        <OperationsForm action={resolveDisputeAction} submitLabel="Record the resolution" compact>{job}<input type="hidden" name="dispute_id" value={d.id} />
          <label className={styles.field}>How it was resolved<input name="resolution" required minLength={3} maxLength={1000} /></label></OperationsForm></div>)}
      {account.extras.some(e => e.state === "approved" || e.state === "submitted") && <details className={styles.details}><summary>Record a dispute about a variation or daywork</summary>
        <OperationsForm action={disputeAction} submitLabel="Record dispute">{job}{key()}
          <label className={styles.field}>Variation or daywork<select name="daywork_id" required defaultValue=""><option value="">Choose</option>
            {account.extras.filter(e => e.state === "approved" || e.state === "submitted").map(e => <option key={e.daywork_id} value={e.daywork_id}>{e.reference}: {e.description.slice(0, 60)}</option>)}</select></label>
          <fieldset className={styles.plainFieldset}><legend>Raised by</legend>
            <label className={styles.checkboxRow}><input type="radio" name="raised_by_party" value="client" defaultChecked />The client</label>
            <label className={styles.checkboxRow}><input type="radio" name="raised_by_party" value="tilespec" />TileSPEC</label></fieldset>
          <label className={styles.field}>What is in dispute<textarea name="summary" required minLength={5} maxLength={1000} /></label>
          <label className={styles.field}>Amount in dispute (£, optional)<input name="amount_disputed" inputMode="decimal" /></label>
          <p className={styles.small}>While disputed it is not in the revised contract sum and cannot be claimed.</p>
        </OperationsForm></details>}
    </section>

    <section className={styles.panel} id="reports" aria-label="Schedules and statements">
      <h2>4. Schedules and statements</h2>
      <div className={styles.cardList}>{(["variation_schedule", "daywork_summary", "statement"] as const).map(kind => <div key={kind} className={styles.card}>
        <h3>{documentKindLabels[kind]}</h3>
        <p className={styles.inline}><a className={styles.secondaryButton} href={`/admin/contracts/${id}/accounts/preview?kind=${kind}`} target="_blank" rel="noopener">Preview</a></p>
        <OperationsForm action={issueDocumentAction} submitLabel={`Issue ${documentKindLabels[kind].toLowerCase()}`} compact>
          {job}{key()}<input type="hidden" name="kind" value={kind} />
          <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />I have checked the preview</label>
        </OperationsForm></div>)}</div>
    </section>

    <section className={styles.panel} id="documents" aria-label="Issued documents">
      <h2>5. Issued documents</h2>
      <p className={styles.muted}>Each document is fixed when issued and kept with a fingerprint of its content. A correction is a revision naming the reason, or for an
        invoice a credit note. Nothing is overwritten.</p>
      {documents.length ? <ul className={styles.documentList}>{documents.map(d => {
        const links = shares.filter(s => s.document_id === d.id);
        return <li key={d.id} className={styles.documentRow} data-document-reference={d.reference}>
          <div><strong>{d.reference}</strong> · {d.title}{d.superseded_at ? <span className={styles.badge}> Superseded</span> : null}
            <div className={styles.small}>{documentKindLabels[d.kind]} · issued {longDate(d.issued_on)} by {d.issued_by_name}
              {d.total !== null ? ` · ${formatPounds(d.total)}` : ""}{d.revision_reason ? ` · revised: ${d.revision_reason}` : ""}</div></div>
          <div className={styles.inline}>
            <a className={styles.secondaryButton} href={docLink(d)} target="_blank" rel="noopener">Open PDF</a>
            <a className={styles.secondaryButton} href={docLink(d, true)}>Download</a>
            {d.application_id && <Link className={styles.linkButton} href={`/admin/contracts/${id}/accounts/applications/${d.application_id}`}>Application</Link>}
          </div>
          <div style={{ flexBasis: "100%" }}>
          {!d.superseded_at && <details className={styles.details}><summary>Share a link</summary>
            <ShareDocument contractId={id} documentId={d.id} reference={d.reference} />
            {links.length > 0 && <ul className={styles.plainList}>{links.map(s => <li key={s.id} className={styles.small}>
              {s.recipient ?? "Link"} · made {longDate(s.created_at.slice(0, 10))} by {s.created_by_name} · opened {s.view_count} time{s.view_count === 1 ? "" : "s"}
              {s.revoked_at ? " · revoked" : ` · works until ${longDate(s.expires_at.slice(0, 10))}`}
              {!s.revoked_at && <OperationsForm action={revokeShareAction} submitLabel="Revoke link" compact>{job}<input type="hidden" name="share_id" value={s.id} /></OperationsForm>}
            </li>)}</ul>}
          </details>}
          {!d.superseded_at && REVISABLE.has(d.kind) && <details className={styles.details}><summary>Issue a revision</summary>
            <OperationsForm action={issueDocumentAction} submitLabel="Issue revision">
              {job}{key()}<input type="hidden" name="kind" value={d.kind} /><input type="hidden" name="supersedes_id" value={d.id} />
              {d.application_id && <input type="hidden" name="application_id" value={d.application_id} />}
              <label className={styles.field}>Why is it revised?<input name="reason" required minLength={3} maxLength={1000} /></label>
              <label className={styles.checkboxRow}><input type="checkbox" name="confirm" required />Issue it as the next revision; the earlier one stays on record as superseded</label>
            </OperationsForm></details>}
          </div>
        </li>;
      })}</ul> : <p>No documents issued yet.</p>}
    </section>
  </>;
}
