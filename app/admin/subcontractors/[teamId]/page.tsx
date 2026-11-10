import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { OperationsForm } from "@/components/operations/operations-form";
import { IssueLink } from "@/components/subcontractors/issue-link";
import { gangStatusLabel, gangStatusTone, paymentTermsText, quantityText, unitLabel, type LedgerRow } from "@/lib/operations/gang-invoices";
import { cisLabels } from "@/lib/subcontractors/claim";
import { calendarDate, eventDate, money } from "@/components/operations/format";
import { issueAgreementAction, issueLinkAction, releaseRetentionAction, revokeLinkAction, saveBankAction, saveProfileAction, saveVariationAction,
  voidRetentionReleaseAction, withdrawAgreementAction, withdrawVariationAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateUnit = (unit: string) => unit === "day" ? "day" : unit === "hour" ? "hour" : unitLabel(unit);

// Everything about one subcontractor: onboarding, agreement, access, jobs and rates, what was
// claimed against what was verified and approved, CIS and retention, payments, disputes and defects.
export default async function SubcontractorDetail({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!uuidPattern.test(teamId)) notFound();
  const { supabase } = await requireFinancialActor();
  const team = await supabase.from("teams").select("id,name,kind,active,company_id").eq("id", teamId).maybeSingle();
  checkDatabase(team.error);
  if (!team.data || team.data.kind === "direct_team") notFound();
  const today = londonDate(), now = new Date().toISOString();
  const [profile, bank, agreements, versions, links, subcontracts, rates, variations, invoices, releases, corrections, contracts, areas] = await Promise.all([
    supabase.from("subcontractor_tax_profiles").select("*").eq("team_id", teamId).maybeSingle(),
    supabase.from("subcontractor_bank_details").select("account_name,sort_code,account_number,verified_note,updated_at,updated_by_name").eq("team_id", teamId).maybeSingle(),
    supabase.from("subcontractor_agreements").select("id,reference,status,version_label,title,issued_at,issued_by_name,signed_at,signer_name,signer_position,signer_ip,evidence_sha256,withdrawn_at,withdraw_reason")
      .eq("team_id", teamId).order("issued_at", { ascending: false }),
    supabase.from("subcontractor_agreement_versions").select("id,version_label,title,status").eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("subcontractor_portal_links").select("id,issued_to,expires_at,created_at,created_by_name,revoked_at,last_used_at,use_count").eq("team_id", teamId).order("created_at", { ascending: false }),
    supabase.from("gang_subcontracts").select("*").eq("team_id", teamId).order("created_at"),
    supabase.from("gang_rates").select("id,subcontract_id,work_area_id,unit,rate,description,effective_from,voided_at").eq("team_id", teamId).is("voided_at", null).order("effective_from", { ascending: false }),
    supabase.from("gang_variations").select("*").eq("team_id", teamId).order("created_at"),
    supabase.from("gang_invoices").select("id,reference,contract_id,status,workmanship,submitted_at,submitted_by_name,source,portal_link_id").eq("team_id", teamId).order("submitted_at", { ascending: false }).limit(200),
    supabase.from("gang_retention_releases").select("*").eq("team_id", teamId).order("recorded_at", { ascending: false }),
    supabase.from("gang_progress_checks").select("id,contract_id,work_area_id,quantity,unit,note,measured_on,correction_status,correction_cleared_at,correction_cleared_note,checked_by_name,voided_at")
      .eq("team_id", teamId).not("correction_status", "is", null).is("voided_at", null).order("checked_at", { ascending: false }).limit(50),
    supabase.from("contracts").select("id,reference,name"),
    supabase.from("work_areas").select("id,contract_id,name,path_ids"),
  ]);
  [profile, bank, agreements, versions, links, subcontracts, rates, variations, invoices, releases, corrections, contracts, areas].forEach(r => checkDatabase(r.error));
  const invoiceIds = (invoices.data ?? []).map(i => i.id);
  const [commercials, lines, extras, ledgers] = await Promise.all([
    invoiceIds.length ? supabase.from("gang_invoice_commercials").select("*").in("invoice_id", invoiceIds) : Promise.resolve({ data: [], error: null }),
    invoiceIds.length ? supabase.from("gang_invoice_lines").select("invoice_id,unit,claimed_quantity,verified_quantity,approved_quantity").in("invoice_id", invoiceIds) : Promise.resolve({ data: [], error: null }),
    invoiceIds.length ? supabase.from("gang_invoice_extras").select("invoice_id,variation_id,kind,claimed_amount,approved_amount,confirmed_quantity,claimed_quantity").in("invoice_id", invoiceIds) : Promise.resolve({ data: [], error: null }),
    Promise.all((subcontracts.data ?? []).map(async s => [s.id, ((await supabase.rpc("gang_claim_ledger", { p_contract: s.contract_id, p_team: teamId })).data ?? []) as LedgerRow[]] as const)),
  ]);
  [commercials, lines, extras].forEach(r => checkDatabase(r.error));

  const p = profile.data, b = bank.data;
  const job = new Map((contracts.data ?? []).map(c => [c.id, c]));
  const areaById = new Map((areas.data ?? []).map(a => [a.id, a]));
  const areaName = (id: string | null) => !id ? "Every area" : (areaById.get(id)?.path_ids as string[] | undefined)?.map(x => areaById.get(x)?.name).filter(Boolean).join(" › ") || "Area";
  const moneyFor = new Map((commercials.data ?? []).map(c => [c.invoice_id, c]));
  const ledgerFor = new Map(ledgers);
  const allAgreements = agreements.data ?? [];
  const signed = allAgreements.find(a => a.status === "signed"), pending = allAgreements.find(a => a.status === "issued");
  const liveLinks = (links.data ?? []).filter(l => !l.revoked_at && l.expires_at > now);
  const activeJobs = (subcontracts.data ?? []).filter(s => s.active);
  const list = invoices.data ?? [];
  const linesOf = (id: string) => (lines.data ?? []).filter(l => l.invoice_id === id);
  const extrasOf = (id: string) => (extras.data ?? []).filter(e => e.invoice_id === id);
  const short = (id: string) => linesOf(id).some(l => l.verified_quantity !== null && Number(l.verified_quantity) < Number(l.claimed_quantity))
    || extrasOf(id).some(e => e.confirmed_quantity !== null && Number(e.confirmed_quantity) < Number(e.claimed_quantity));
  const disputed = list.filter(i => ["query_gang", "returned"].includes(i.status) || (["with_office", "approved", "paid"].includes(i.status) && short(i.id)));
  const toPay = list.filter(i => i.status === "approved");
  const outstanding = toPay.reduce((t, i) => t + Number(moneyFor.get(i.id)?.net_payable ?? moneyFor.get(i.id)?.approved_amount ?? 0), 0);
  const settled = list.filter(i => ["approved", "paid"].includes(i.status));
  const totals = { approved: settled.reduce((t, i) => t + Number(moneyFor.get(i.id)?.approved_amount ?? 0), 0), cis: settled.reduce((t, i) => t + Number(moneyFor.get(i.id)?.cis_amount ?? 0), 0),
    paid: list.filter(i => i.status === "paid").reduce((t, i) => t + Number(moneyFor.get(i.id)?.paid_amount ?? 0), 0) };
  const heldFor = (subcontractId: string, contractId: string) => settled.filter(i => i.contract_id === contractId).reduce((t, i) => t + Number(moneyFor.get(i.id)?.retention_amount ?? 0), 0)
    - (releases.data ?? []).filter(r => r.subcontract_id === subcontractId && !r.voided_at).reduce((t, r) => t + Number(r.amount), 0);
  const variationUsed = (id: string) => (extras.data ?? []).filter(e => e.variation_id === id).reduce((t, e) => {
    const status = list.find(i => i.id === e.invoice_id)?.status ?? "";
    return t + (["approved", "paid"].includes(status) ? Number(e.approved_amount ?? 0) : ["uploading", "awaiting_check", "with_office", "query_gang"].includes(status) ? Number(e.claimed_amount ?? 0) : 0);
  }, 0);

  const steps: [string, boolean, string][] = [
    ["Business and tax details recorded", !!p, "Record them below."],
    ["CIS status verified with HMRC", !!p && p.cis_status !== "unverified", "Verify with HMRC, then record the result. Payment cannot be approved until this is done."],
    ["Bank details recorded", !!b, "Record them after confirming with the subcontractor directly."],
    ["Agreement issued", !!signed || !!pending, versions.data?.length ? "Issue it below." : "Publish an agreement version first."],
    ["Agreement signed by the subcontractor", !!signed, "They sign from their personal link. Until then they cannot invoice through the portal."],
    ["On a job with agreed rates", activeJobs.some(s => (rates.data ?? []).some(r => r.subcontract_id === s.id)), "Add them to a job and record rates in Gangs on jobs."],
    ["Personal portal link live", liveLinks.length > 0, "Create a link below and send it to them."],
  ];
  const hiddenTeam = <input type="hidden" name="team_id" value={teamId} />;

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Subcontractor</p><h1 className={styles.title}>{p?.legal_name ?? team.data.name}</h1>
      <p className={styles.description}>{team.data.name}{p?.trading_name && p.trading_name !== team.data.name ? ` · trading as ${p.trading_name}` : ""}{team.data.active ? "" : " · inactive"}</p></div>
      <Link href="/admin/subcontractors">All subcontractors</Link></div>

    <section className={styles.panel} aria-label="Onboarding">
      <h2>Onboarding</h2>
      <ul className={styles.plainList}>{steps.map(([label, done, todo]) => <li key={label}>
        <span className={`${css.status} ${done ? css.good : css.attention}`}>{done ? "Done" : "To do"}</span> <strong>{label}</strong>{!done && <span className={styles.muted}> — {todo}</span>}</li>)}</ul>
    </section>

    <section className={styles.panel} aria-label="Money summary">
      <h2>Money</h2>
      <dl className={css.facts}>
        <dt>Approved to date (before deductions)</dt><dd className={css.money}>{money(totals.approved)}</dd>
        <dt>CIS deducted to date</dt><dd className={css.money}>{money(totals.cis)}</dd>
        <dt>Paid to date</dt><dd className={css.money}>{money(totals.paid)}</dd>
        <dt>Approved, waiting to be paid</dt><dd className={css.money}>{money(outstanding)}{toPay.length ? ` on ${toPay.length} invoice${toPay.length === 1 ? "" : "s"}` : ""}</dd>
        <dt>Retention held</dt><dd className={css.money}>{money((subcontracts.data ?? []).reduce((t, s) => t + heldFor(s.id, s.contract_id), 0))}</dd>
        <dt>Queried, returned or verified short</dt><dd>{disputed.length || "None"}</dd>
      </dl>
    </section>

    <section className={styles.panel} aria-label="Business and tax details">
      <h2>Business and tax details</h2>
      <p className={styles.muted}>Printed on invoices created in the portal and used to work out CIS and VAT at approval. Seen only by office users with money access.</p>
      <OperationsForm action={saveProfileAction} submitLabel="Save details">
        {hiddenTeam}<input type="hidden" name="version" value={p?.version ?? ""} />
        <div className={css.inputs}>
          <label className={styles.field}>Business type<select name="business_type" defaultValue={p?.business_type ?? "sole_trader"}><option value="sole_trader">Sole trader</option><option value="partnership">Partnership</option><option value="limited_company">Limited company</option></select></label>
          <label className={styles.field}>Legal name (as on invoices)<input name="legal_name" required minLength={2} maxLength={160} defaultValue={p?.legal_name ?? ""} /></label>
          <label className={styles.field}>Trading name (optional)<input name="trading_name" maxLength={160} defaultValue={p?.trading_name ?? ""} /></label>
        </div>
        <label className={styles.field}>Business address<textarea name="address" rows={2} required minLength={5} maxLength={500} defaultValue={p?.address ?? ""} /></label>
        <div className={css.inputs}>
          <label className={styles.field}>Email<input name="email" type="email" maxLength={254} defaultValue={p?.email ?? ""} /></label>
          <label className={styles.field}>Mobile<input name="phone" maxLength={40} defaultValue={p?.phone ?? ""} /></label>
          <label className={styles.field}>Company number (if a company)<input name="company_number" maxLength={12} defaultValue={p?.company_number ?? ""} /></label>
          <label className={styles.field}>UTR (10 digits)<input name="utr" inputMode="numeric" maxLength={20} defaultValue={p?.utr ?? ""} /></label>
        </div>
        <h3>Construction Industry Scheme</h3>
        <div className={css.inputs}>
          <label className={styles.field}>CIS status from HMRC verification<select name="cis_status" defaultValue={p?.cis_status ?? "unverified"}>
            {Object.entries(cisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={styles.field}>Verification number<input name="cis_verification_number" maxLength={40} defaultValue={p?.cis_verification_number ?? ""} /></label>
          <label className={styles.field}>Date verified<input name="cis_verified_on" type="date" max={today} defaultValue={p?.cis_verified_on ?? ""} /></label>
        </div>
        <small>Verify every subcontractor with HMRC before the first payment. No CIS is deducted, and no payment can be approved, on an unverified status.</small>
        <h3>VAT</h3>
        <label className={styles.checkboxRow}><input type="checkbox" name="vat_registered" defaultChecked={p?.vat_registered ?? false} /> Registered for VAT</label>
        <div className={css.inputs}>
          <label className={styles.field}>VAT number<input name="vat_number" maxLength={20} defaultValue={p?.vat_number ?? ""} placeholder="GB123456789" /></label>
          <label className={styles.field}>Self-billing agreement from<input name="self_billing_from" type="date" defaultValue={p?.self_billing_from ?? ""} /></label>
          <label className={styles.field}>Self-billing agreement until<input name="self_billing_until" type="date" defaultValue={p?.self_billing_until ?? ""} /></label>
        </div>
        <label className={styles.checkboxRow}><input type="checkbox" name="vat_reverse_charge" defaultChecked={p?.vat_reverse_charge ?? true} /> Domestic reverse charge applies (usual for construction services to TileSPEC): no VAT is charged</label>
        <small>A VAT-registered subcontractor can only create invoices in the portal while a self-billing agreement is in force (HMRC VAT Notice 700/62; at most twelve months, then renewed). Without one they upload their own invoices. Subcontractors not registered for VAT are unaffected.</small>
      </OperationsForm>
    </section>

    <section className={styles.panel} aria-label="Bank details">
      <h2>Bank details</h2>
      {b ? <dl className={css.facts}><dt>Account name</dt><dd>{b.account_name}</dd><dt>Sort code</dt><dd>{b.sort_code}</dd><dt>Account number</dt><dd>{b.account_number}</dd>
        <dt>Last changed</dt><dd>{eventDate(b.updated_at)} by {b.updated_by_name}{b.verified_note ? ` · ${b.verified_note}` : ""}</dd></dl>
        : <p className={styles.muted}>Not recorded.</p>}
      <p className={styles.muted}>Never shown in the portal beyond the last four digits, never changeable from a link, and never copied into the audit log. Confirm any change by calling the subcontractor on a number you already hold.</p>
      <details><summary>{b ? "Change bank details" : "Record bank details"}</summary>
        <OperationsForm action={saveBankAction} submitLabel="Save bank details" compact>
          {hiddenTeam}
          <div className={css.inputs}>
            <label className={styles.field}>Account name<input name="account_name" required minLength={2} maxLength={120} autoComplete="off" /></label>
            <label className={styles.field}>Sort code<input name="sort_code" required inputMode="numeric" maxLength={12} placeholder="12-34-56" autoComplete="off" /></label>
            <label className={styles.field}>Account number<input name="account_number" required inputMode="numeric" maxLength={12} autoComplete="off" /></label>
          </div>
          <label className={styles.field}>How it was confirmed<input name="verified_note" maxLength={500} placeholder="For example: confirmed by phone with Dave, 10 Nov" /></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="confirmed" required /> I have confirmed these details with the subcontractor directly</label>
        </OperationsForm></details>
    </section>

    <section className={styles.panel} aria-label="Agreement">
      <div className={styles.panelHeader}><h2>Subcontractor agreement</h2><Link href="/admin/subcontractors/agreement">Agreement versions</Link></div>
      {signed ? <p className={styles.success}>Signed by {signed.signer_name}{signed.signer_position ? ` (${signed.signer_position})` : ""} on {eventDate(signed.signed_at!)} · version {signed.version_label} · {signed.reference}</p>
        : pending ? <p className={styles.warning}>Issued {eventDate(pending.issued_at)} (version {pending.version_label}) and <strong>not signed</strong>. It has no effect until the subcontractor signs it from their link.</p>
          : <p className={styles.warning}>No agreement has been issued. The subcontractor cannot invoice through the portal until one is issued and signed.</p>}
      {(versions.data ?? []).length === 0 ? <p className={styles.muted}>No agreement version is published. The owner records the legal review and publishes it in Agreement versions.</p>
        : !p ? <p className={styles.muted}>Record the business details above before issuing the agreement.</p>
          : <details open={!signed && !pending}><summary>{signed || pending ? "Issue a new agreement" : "Issue the agreement"}</summary>
            <OperationsForm action={issueAgreementAction} submitLabel="Issue for signature" compact>
              {hiddenTeam}
              <label className={styles.field}>Version<select name="version_id" required>{(versions.data ?? []).map(v => <option key={v.id} value={v.id}>{v.title} · version {v.version_label}</option>)}</select></label>
              {pending && <small>The copy already waiting for signature will be withdrawn and replaced.</small>}
            </OperationsForm></details>}
      {allAgreements.length > 0 && <table className={css.compare}><thead><tr><th>Reference</th><th>Version</th><th>Status</th><th>Record</th><th /></tr></thead><tbody>
        {allAgreements.map(a => <tr key={a.id}><td>{a.reference}</td><td>{a.version_label}</td>
          <td>{a.status === "signed" ? "Signed" : a.status === "issued" ? "Waiting for signature" : `Withdrawn${a.signed_at ? " (was signed)" : ""}`}</td>
          <td>{a.signed_at ? <>Signed {eventDate(a.signed_at)} by {a.signer_name}{a.signer_ip ? ` from ${a.signer_ip}` : ""}<br /><small>Evidence {a.evidence_sha256?.slice(0, 16)}…</small></> : <>Issued {eventDate(a.issued_at)} by {a.issued_by_name}</>}
            {a.withdraw_reason ? <><br /><small>{a.withdraw_reason}</small></> : null}</td>
          <td><a href={`/admin/subcontractors/agreements/${a.id}/pdf`} target="_blank" rel="noopener noreferrer">PDF</a>
            {a.status !== "withdrawn" && <details><summary>Withdraw</summary><OperationsForm action={withdrawAgreementAction} submitLabel="Withdraw agreement" compact>
              {hiddenTeam}<input type="hidden" name="agreement_id" value={a.id} /><label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>}</td></tr>)}
      </tbody></table>}
    </section>

    <section className={styles.panel} aria-label="Portal access">
      <h2>Portal access</h2>
      <p className={styles.muted}>The subcontractor needs no account or password. They open a personal link, which you can withdraw at any time and which expires by itself. Only a fingerprint of the link is stored, so it is shown once when created.</p>
      <IssueLink action={issueLinkAction} teamId={teamId} defaultName={p?.legal_name ?? ""} email={p?.email ?? null} phone={p?.phone ?? null} />
      {(links.data ?? []).length > 0 && <table className={css.compare}><thead><tr><th>Issued to</th><th>Created</th><th>Expires</th><th>Last used</th><th>Status</th></tr></thead><tbody>
        {(links.data ?? []).map(l => { const live = !l.revoked_at && l.expires_at > now; return <tr key={l.id} style={live ? undefined : { opacity: 0.6 }}>
          <td>{l.issued_to}</td><td>{calendarDate(l.created_at)} by {l.created_by_name}</td><td>{calendarDate(l.expires_at)}</td>
          <td>{l.last_used_at ? `${eventDate(l.last_used_at)} (${l.use_count} visit${l.use_count === 1 ? "" : "s"})` : "Never"}</td>
          <td>{l.revoked_at ? `Withdrawn ${calendarDate(l.revoked_at)}` : live ? <OperationsForm action={revokeLinkAction} submitLabel="Withdraw link" compact>{hiddenTeam}<input type="hidden" name="link_id" value={l.id} /></OperationsForm> : "Expired"}</td></tr>; })}
      </tbody></table>}
    </section>

    <section className={styles.panel} aria-label="Jobs">
      <div className={styles.panelHeader}><h2>Assigned contracts, rates and variations</h2><Link className={styles.secondaryButton} href="/admin/gang-invoices/setup">Gangs on jobs, terms and rates</Link></div>
      {(subcontracts.data ?? []).length === 0 ? <p className={styles.muted}>Not on a job yet. Add this subcontractor to a job, with payment terms and agreed rates, in Gangs on jobs.</p>
        : (subcontracts.data ?? []).map(s => {
          const c = job.get(s.contract_id), held = heldFor(s.id, s.contract_id), ledger = ledgerFor.get(s.id) ?? [];
          const jobRates = (rates.data ?? []).filter(r => r.subcontract_id === s.id), jobVariations = (variations.data ?? []).filter(v => v.subcontract_id === s.id);
          const jobReleases = (releases.data ?? []).filter(r => r.subcontract_id === s.id);
          return <div className={css.lineBox} key={s.id}>
            <div className={css.cardHead}><h3>{c?.name ?? "Job"} ({c?.reference})</h3><span className={`${css.status} ${s.active ? css.good : css.closed}`}>{s.active ? "Can invoice" : "Stopped"}</span></div>
            <p style={{ margin: "4px 0" }}>{paymentTermsText(s)} Retention {Number(s.retention_percent)}%.{s.terms_note ? ` ${s.terms_note}` : ""}</p>
            <h4 style={{ margin: "10px 0 2px" }}>Agreed rates</h4>
            {jobRates.length ? <table className={css.compare}><tbody>{jobRates.map(r => <tr key={r.id}><td>{["day", "hour"].includes(r.unit) ? (r.description || (r.unit === "day" ? "Day rate" : "Hourly rate")) : `${areaName(r.work_area_id)}${r.description ? ` · ${r.description}` : ""}`}</td>
              <td className={css.num}>{money(Number(r.rate))} per {rateUnit(r.unit)}</td><td>from {calendarDate(r.effective_from)}</td></tr>)}</tbody></table>
              : <p className={styles.warning}>No rates recorded. The subcontractor cannot create invoices in the portal for this job until rates are agreed and recorded.</p>}
            <h4 style={{ margin: "10px 0 2px" }}>Measured work: claimed, verified and approved</h4>
            {ledger.length ? <div className={styles.tableWrap}><table className={css.compare}><thead><tr><th>Area</th><th className={css.num}>Measured and passed</th><th className={css.num}>Needs correction</th><th className={css.num}>Claimed, awaiting check</th><th className={css.num}>Verified, with office</th><th className={css.num}>Approved</th></tr></thead>
              <tbody>{ledger.map(l => <tr key={l.work_area_id + l.unit}><td>{l.area}</td><td className={css.num}>{quantityText(l.passed, l.unit)}</td><td className={css.num}>{quantityText(l.correction, l.unit)}</td>
                <td className={css.num}>{quantityText(l.claimed, l.unit)}</td><td className={css.num}>{quantityText(l.verified, l.unit)}</td><td className={css.num}>{quantityText(l.approved, l.unit)}</td></tr>)}</tbody></table></div>
              : <p className={styles.muted}>Nothing measured or claimed yet.</p>}
            <h4 style={{ margin: "10px 0 2px" }}>Approved variations</h4>
            {jobVariations.length ? <table className={css.compare}><thead><tr><th>Ref.</th><th>Description</th><th className={css.num}>Agreed</th><th className={css.num}>Claimed</th><th /></tr></thead><tbody>
              {jobVariations.map(v => <tr key={v.id} style={v.withdrawn_at ? { opacity: 0.55 } : undefined}><td>{v.reference}</td><td>{v.description}<br /><small>Instructed {calendarDate(v.instructed_on)} · recorded by {v.created_by_name}{v.withdrawn_at ? ` · withdrawn: ${v.withdraw_reason}` : ""}</small></td>
                <td className={css.num}>{money(Number(v.amount))}</td><td className={css.num}>{money(variationUsed(v.id))}</td>
                <td>{!v.withdrawn_at && variationUsed(v.id) === 0 && <details><summary>Withdraw</summary><OperationsForm action={withdrawVariationAction} submitLabel="Withdraw variation" compact>
                  {hiddenTeam}<input type="hidden" name="variation_id" value={v.id} /><label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>}</td></tr>)}
            </tbody></table> : <p className={styles.muted}>None. Additional work a subcontractor claims without an approved variation is shown separately on their invoice for you to decide.</p>}
            <details><summary>Approve a variation</summary>
              <OperationsForm action={saveVariationAction} submitLabel="Approve variation" compact>
                {hiddenTeam}<input type="hidden" name="subcontract_id" value={s.id} /><input type="hidden" name="request_key" value={randomUUID()} />
                <label className={styles.field}>What is the extra or changed work?<input name="description" required minLength={3} maxLength={500} /></label>
                <div className={css.inputs}>
                  <label className={styles.field}>Agreed sum £<input name="amount" inputMode="decimal" required /></label>
                  <label className={styles.field}>Instructed on<input name="instructed_on" type="date" max={today} defaultValue={today} /></label>
                </div>
              </OperationsForm></details>
            <h4 style={{ margin: "10px 0 2px" }}>Retention</h4>
            <p style={{ margin: "4px 0" }}>Held now: <strong>{money(held)}</strong></p>
            {jobReleases.length > 0 && <table className={css.compare}><tbody>{jobReleases.map(r => <tr key={r.id} style={r.voided_at ? { opacity: 0.55 } : undefined}>
              <td>Released {calendarDate(r.released_on)}{r.payment_reference ? ` · ${r.payment_reference}` : ""}{r.voided_at ? ` · voided: ${r.void_reason}` : ""}</td>
              <td className={css.num}>{money(Number(r.amount))} less CIS {money(Number(r.cis_amount))} = {money(Number(r.net_paid))}</td>
              <td>{!r.voided_at && <details><summary>Void</summary><OperationsForm action={voidRetentionReleaseAction} submitLabel="Void release" compact>
                {hiddenTeam}<input type="hidden" name="release_id" value={r.id} /><label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={1000} /></label></OperationsForm></details>}</td></tr>)}</tbody></table>}
            {held > 0 && <details><summary>Record retention released</summary>
              <OperationsForm action={releaseRetentionAction} submitLabel="Record release" compact>
                {hiddenTeam}<input type="hidden" name="subcontract_id" value={s.id} /><input type="hidden" name="request_key" value={randomUUID()} />
                <div className={css.inputs}>
                  <label className={styles.field}>Amount released £ (before CIS)<input name="amount" inputMode="decimal" required defaultValue={held.toFixed(2)} /></label>
                  <label className={styles.field}>Paid on<input name="released_on" type="date" max={today} defaultValue={today} /></label>
                  <label className={styles.field}>Payment reference<input name="payment_reference" maxLength={120} /></label>
                </div>
                <label className={styles.field}>Note (optional)<input name="note" maxLength={1000} /></label>
                <small>CIS is deducted at the subcontractor&apos;s verified rate. Record a release once it has been paid.</small>
              </OperationsForm></details>}
          </div>;
        })}
    </section>

    <section className={styles.panel} aria-label="Invoices">
      <div className={styles.panelHeader}><h2>Invoice and payment history</h2><Link href="/admin/gang-invoices">Invoice approvals</Link></div>
      {list.length === 0 ? <p className={styles.muted}>No invoices yet.</p>
        : <div className={styles.tableWrap}><table className={css.compare}><thead><tr><th>Invoice</th><th>Job</th><th>Status</th><th className={css.num}>Claimed</th><th className={css.num}>Approved</th><th className={css.num}>Retention</th><th className={css.num}>CIS</th><th className={css.num}>Payable</th><th>Due / paid</th></tr></thead>
          <tbody>{list.map(i => { const m = moneyFor.get(i.id); const due = m?.agreed_payment_on ?? m?.payment_due_on; return <tr key={i.id}>
            <td><Link href={`/admin/gang-invoices/${i.id}`}>{i.reference}</Link>{m?.invoice_number ? <><br /><small>No. {m.invoice_number}</small></> : null}<br /><small>{i.source === "generated" ? "Created in portal" : "Uploaded"}{i.portal_link_id ? " · by link" : " · by login"}</small></td>
            <td>{job.get(i.contract_id)?.name}</td>
            <td><span className={`${css.status} ${css[gangStatusTone(i.status, i.workmanship)]}`}>{gangStatusLabel(i.status, i.workmanship)}</span>{disputed.some(d => d.id === i.id) && !["query_gang", "returned"].includes(i.status) ? <><br /><small className={css.difference}>Verified short of claim</small></> : null}</td>
            <td className={css.num}>{m?.invoice_total != null ? money(Number(m.invoice_total)) : "—"}</td><td className={css.num}>{m?.approved_amount != null ? money(Number(m.approved_amount)) : "—"}</td>
            <td className={css.num}>{m?.retention_amount != null ? money(Number(m.retention_amount)) : "—"}</td><td className={css.num}>{m?.cis_amount != null ? money(Number(m.cis_amount)) : "—"}</td>
            <td className={css.num}>{m?.net_payable != null ? money(Number(m.net_payable)) : "—"}</td>
            <td>{m?.paid_on ? `Paid ${money(Number(m.paid_amount))} on ${calendarDate(m.paid_on)}` : due && !["rejected", "cancelled", "superseded"].includes(i.status) ? `Due ${calendarDate(due)}${due < today && i.status === "approved" ? " — overdue" : ""}` : "—"}</td></tr>; })}</tbody></table></div>}
      <p className={styles.muted}>Every invoice is checked on site, then approved by an office user with money access. Disputed quantities are never deducted automatically: approving less than claimed needs a written reason, and a pay less notice may be needed before the final date for payment.</p>
    </section>

    <section className={styles.panel} aria-label="Defects and rectification">
      <div className={styles.panelHeader}><h2>Defects and rectification</h2><Link href="/admin/snags">Snag register</Link></div>
      {(corrections.data ?? []).length === 0 ? <p className={styles.muted}>No work has been recorded as needing correction.</p>
        : <table className={css.compare}><thead><tr><th>Where</th><th className={css.num}>Quantity</th><th>Recorded</th><th>Status</th></tr></thead><tbody>
          {(corrections.data ?? []).map(g => <tr key={g.id}><td>{job.get(g.contract_id)?.name} · {areaName(g.work_area_id)}<br /><small>{g.note}</small></td><td className={css.num}>{quantityText(g.quantity, g.unit)}</td>
            <td>{calendarDate(g.measured_on)} by {g.checked_by_name}</td>
            <td>{g.correction_status === "cleared" ? <>Corrected and checked {g.correction_cleared_at ? calendarDate(g.correction_cleared_at) : ""}<br /><small>{g.correction_cleared_note}</small></> : <span className={css.difference}>Open: not payable until corrected and checked</span>}</td></tr>)}
        </tbody></table>}
      <p className={styles.muted}>Work needing correction is excluded from payment until the supervisor records it as corrected and checked. Rectification costs are recovered only as an office adjustment with a written reason and evidence, under the agreement&apos;s notice and opportunity-to-rectify terms.</p>
    </section>
  </>;
}
