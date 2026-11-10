import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { OperationsForm } from "@/components/operations/operations-form";
import { gangStatusLabel, gangStatusTone, ledgerFor, paymentTermsText, quantityText, rateFor, unitLabel, type GangRate, type LedgerRow } from "@/lib/operations/gang-invoices";
import { londonDate } from "@/lib/operations/planning";
import { calendarDate, eventDate, money } from "@/components/operations/format";
import { cisLabels } from "@/lib/subcontractors/claim";
import { decideGangInvoiceAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
const extraKind: Record<string, string> = { day_rate: "Day rate work", variation: "Approved variation", additional: "Additional work — not approved" };
const extraQuantity = (quantity: number | null, unit: string, kind: string) => quantity === null ? "—" : kind === "day_rate" ? `${Number(quantity)} ${unit}${Number(quantity) === 1 ? "" : "s"}` : Number(quantity) > 0 ? "Carried out" : "Not confirmed";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function GangInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireFinancialActor();
  const invoice = await supabase.from("gang_invoices").select("*").eq("id", id).maybeSingle();
  checkDatabase(invoice.error);
  if (!invoice.data) notFound();
  const inv = invoice.data;
  const [lines, commercial, files, events, request, team, contract, terms, rates, areas, ledger] = await Promise.all([
    supabase.from("gang_invoice_lines").select("*").eq("invoice_id", id).order("line_no"),
    supabase.from("gang_invoice_commercials").select("*").eq("invoice_id", id).maybeSingle(),
    supabase.from("gang_invoice_files").select("id,kind,mime_type,uploaded_at").eq("invoice_id", id).not("uploaded_at", "is", null),
    supabase.from("gang_invoice_events").select("id,action,actor_name,note,visibility,details,created_at,to_status").eq("invoice_id", id).order("id"),
    supabase.from("gang_verification_requests").select("routed_to,reason,office_note,created_at").eq("invoice_id", id).is("resolved_at", null).maybeSingle(),
    supabase.from("teams").select("name").eq("id", inv.team_id).maybeSingle(),
    supabase.from("contracts").select("id,reference,name").eq("id", inv.contract_id).maybeSingle(),
    supabase.from("gang_subcontracts").select("payment_cycle,pay_weekday,payment_days,cycle_anchor,terms_note,retention_percent").eq("id", inv.subcontract_id).maybeSingle(),
    supabase.from("gang_rates").select("id,work_area_id,unit,rate,effective_from,created_at,voided_at").eq("subcontract_id", inv.subcontract_id),
    supabase.from("work_areas").select("id,name,path_ids").eq("contract_id", inv.contract_id),
    supabase.rpc("gang_claim_ledger", { p_contract: inv.contract_id, p_team: inv.team_id }),
  ]);
  [lines, commercial, files, events, request, contract, terms, rates, areas].forEach(r => checkDatabase(r.error));
  const [extraRows, taxProfile] = await Promise.all([
    supabase.from("gang_invoice_extras").select("*").eq("invoice_id", id).order("line_no"),
    supabase.from("subcontractor_tax_profiles").select("legal_name,cis_status,vat_registered,vat_reverse_charge").eq("team_id", inv.team_id).maybeSingle(),
  ]);
  checkDatabase(extraRows.error); checkDatabase(taxProfile.error);
  const xs = extraRows.data ?? [], tax = taxProfile.data;
  const extraLimit = (e: { claimed_amount: number | null; confirmed_quantity: number | null; claimed_quantity: number }) =>
    Math.round(Number(e.claimed_amount ?? 0) * Number(e.confirmed_quantity ?? 0) / Number(e.claimed_quantity) * 100) / 100;
  const extrasShort = xs.some(e => e.confirmed_quantity !== null && Number(e.confirmed_quantity) < Number(e.claimed_quantity));
  const breakdown = (commercial.data?.claim_breakdown ?? null) as { totals?: { measured: number; day_rates: number; variations: number; additional: number; priced: number } } | null;
  const areaById = new Map((areas.data ?? []).map(a => [a.id, a]));
  const pathOf = (areaId: string) => (areaById.get(areaId)?.path_ids as string[] | undefined) ?? [areaId];
  const areaName = (areaId: string) => pathOf(areaId).map(p => areaById.get(p)?.name).filter(Boolean).join(" › ") || "Area";
  const ledgerRows = (ledger.data ?? []) as LedgerRow[];
  const c = commercial.data;
  const due = c?.agreed_payment_on ?? c?.payment_due_on ?? null;
  const today = londonDate();
  const document = (files.data ?? []).find(f => f.kind === "invoice");
  const photos = (files.data ?? []).filter(f => f.kind !== "invoice");
  const ls = lines.data ?? [];
  const claimedTotal = ls.reduce((t, l) => t + Number(l.claimed_quantity), 0);
  const verifiedTotal = ls.reduce((t, l) => t + Number(l.verified_quantity ?? 0), 0);
  const base = { invoice_id: id, version: inv.version };
  const hidden = (action: string) => <>
    <input type="hidden" name="invoice_id" value={base.invoice_id} /><input type="hidden" name="version" value={base.version} />
    <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="action" value={action} />
  </>;
  const canCheckYourself = member.role === "owner" || member.role === "contracts_manager";
  const noteForm = (action: string, label: string, submit: string, prompt: string) => <details className={styles.panel}><summary><strong>{label}</strong></summary>
    <OperationsForm action={decideGangInvoiceAction} submitLabel={submit} compact>{hidden(action)}
      <label className={styles.field}>{prompt}<textarea name="note" rows={2} maxLength={2000} required minLength={3} /></label>
    </OperationsForm></details>;

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.data?.name} · {contract.data?.reference}</p>
      <h1 className={styles.title}>{team.data?.name ?? "Gang"} · {inv.reference}</h1>
      <p className={styles.description}>Sent {eventDate(inv.submitted_at)} by {inv.submitted_by_name}{inv.period_start ? ` · work from ${inv.period_start}` : ""} to {inv.period_end}.
        {inv.portal_link_id ? (inv.source === "generated" ? " Created in the subcontractor portal from agreed rates." : " Uploaded through the subcontractor portal.") : ""}</p></div>
      <div className={styles.actions}><Link href={`/admin/subcontractors/${inv.team_id}`}>Subcontractor record</Link><Link href="/admin/gang-invoices">All gang invoices</Link></div></div>
    <p><span className={`${css.status} ${css[gangStatusTone(inv.status, inv.workmanship)]}`}>{gangStatusLabel(inv.status, inv.workmanship)}</span></p>
    {request.data && request.data.routed_to === "office" && <p className={styles.warning}>No supervisor was assigned to this job when it arrived. Assign one on the job and it appears on their site dashboard{canCheckYourself ? <>, or <Link href={`/admin/supervisor/sites/${inv.contract_id}/progress/${inv.id}`}>check it yourself</Link></> : null}.</p>}
    {inv.status === "awaiting_check" && request.data?.routed_to === "supervisor" && <p className={styles.muted}>Waiting for the site supervisor&apos;s check. It is on their site dashboard.</p>}

    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Claim and verification</h2>{document && <a className={styles.secondaryButton} href={`/admin/gang-invoices/files/${document.id}`} target="_blank" rel="noopener noreferrer">Open original invoice ({document.mime_type === "application/pdf" ? "PDF" : "photo"})</a>}</div>
      <div className={styles.tableWrap}><table className={css.compare}><thead><tr><th>Work area</th><th className={css.num}>Gang claimed</th><th className={css.num}>Supervisor verified</th><th className={css.num}>Difference</th><th>Quality</th><th className={css.num}>Previously approved</th><th className={css.num}>Approved</th></tr></thead>
        <tbody>{ls.map(l => {
          const row = ledgerFor(ledgerRows, l.work_area_id, l.unit);
          const previous = row.approved - Number(l.approved_quantity ?? 0);
          return <tr key={l.id}><td>{areaName(l.work_area_id)}{l.verification_note ? <><br /><small>{l.verification_note}</small></> : null}</td>
            <td className={css.num}>{quantityText(l.claimed_quantity, l.unit)}</td><td className={css.num}>{quantityText(l.verified_quantity, l.unit)}</td>
            <td className={`${css.num} ${css.difference}`}>{l.verified_quantity === null ? "—" : quantityText(Number(l.claimed_quantity) - Number(l.verified_quantity), l.unit)}</td>
            <td>{l.line_quality === "passed" ? "Checked and passed" : l.line_quality === "correction_required" ? "Correction needed" : "Awaiting check"}</td>
            <td className={css.num}>{quantityText(Math.max(previous, 0), l.unit)}</td><td className={css.num}>{quantityText(l.approved_quantity, l.unit)}</td></tr>;
        })}</tbody></table></div>
      {xs.length > 0 && <div className={styles.tableWrap}><table className={css.compare}><thead><tr><th>Extra item</th><th className={css.num}>Claimed</th><th className={css.num}>Rate</th><th className={css.num}>Amount claimed</th><th>Supervisor confirmed</th><th className={css.num}>Approved</th></tr></thead>
        <tbody>{xs.map(e => <tr key={e.id}><td><strong className={e.kind === "additional" ? css.difference : undefined}>{extraKind[e.kind]}</strong><br />{e.description}{e.confirmation_note ? <><br /><small>Supervisor: {e.confirmation_note}</small></> : null}</td>
          <td className={css.num}>{e.kind === "day_rate" ? extraQuantity(e.claimed_quantity, e.unit, e.kind) : "—"}</td><td className={css.num}>{e.rate != null ? `${money(Number(e.rate))} per ${e.unit}` : "—"}</td>
          <td className={css.num}>{e.claimed_amount != null ? money(Number(e.claimed_amount)) : "—"}</td>
          <td className={e.confirmed_quantity !== null && Number(e.confirmed_quantity) < Number(e.claimed_quantity) ? css.difference : undefined}>{e.confirmed_quantity === null ? "Awaiting check" : extraQuantity(e.confirmed_quantity, e.unit, e.kind)}</td>
          <td className={css.num}>{e.approved_amount != null ? money(Number(e.approved_amount)) : "—"}</td></tr>)}</tbody></table></div>}
      {xs.some(e => e.kind === "additional") && <p className={styles.warning}>This invoice includes <strong>additional work that was not an approved variation</strong>. It is shown apart from approved variations. Approve only what TileSpec instructed or accepted; enter 0 and give the reason otherwise.</p>}
      <dl className={css.facts}>
        {inv.verified_at && <><dt>Checked by</dt><dd>{inv.verified_by_name} on {eventDate(inv.verified_at)}</dd></>}
        {inv.workmanship && <><dt>Workmanship</dt><dd>{inv.workmanship === "satisfactory" ? "Checked and passed" : `Correction needed: ${inv.correction_note}`}</dd></>}
        {inv.supervisor_note && <><dt>Supervisor&apos;s notes</dt><dd>{inv.supervisor_note}</dd></>}
        {inv.gang_note && <><dt>Gang&apos;s note</dt><dd>{inv.gang_note}</dd></>}
      </dl>
      {photos.length > 0 && <div className={css.thumbs}>{photos.map(p => <a key={p.id} href={`/admin/gang-invoices/files/${p.id}`} target="_blank" rel="noopener noreferrer" aria-label="Photo of the work">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/gang-invoices/files/${p.id}`} alt="" /></a>)}</div>}
    </section>

    <section className={styles.panel}>
      <h2>Money</h2>
      <dl className={css.facts}>
        <dt>Invoice number</dt><dd>{c?.invoice_number ?? "Not given"}</dd>
        <dt>Invoice total (before VAT)</dt><dd className={css.money}>{c?.invoice_total != null ? money(Number(c.invoice_total)) : "Not given — see the invoice"}</dd>
        {breakdown?.totals && <><dt>At agreed rates</dt><dd className={css.money}>{money(Number(breakdown.totals.priced))}
          {` (measured ${money(Number(breakdown.totals.measured))}, day rates ${money(Number(breakdown.totals.day_rates))}, variations ${money(Number(breakdown.totals.variations))}, additional ${money(Number(breakdown.totals.additional))})`}
          {c?.invoice_total != null && Number(c.invoice_total) !== Number(breakdown.totals.priced) ? <span className={css.difference}> — differs from the invoice total</span> : null}</dd></>}
        <dt>CIS and VAT</dt><dd>{tax ? `${cisLabels[tax.cis_status]} · ${tax.vat_registered ? (tax.vat_reverse_charge ? "VAT registered, reverse charge" : "VAT registered, 20% charged") : "not VAT registered"}`
          : <>No tax details recorded: no CIS, retention or VAT is worked out. <Link href={`/admin/subcontractors/${inv.team_id}`}>Record them</Link></>}</dd>
        {terms.data && <><dt>Terms</dt><dd>{paymentTermsText(terms.data)}{terms.data.terms_note ? ` ${terms.data.terms_note}` : ""}</dd></>}
        {due && <><dt>Payment due</dt><dd>{calendarDate(due)}{due < today && !["paid", "rejected", "cancelled", "superseded"].includes(inv.status) ? " — overdue" : ""}</dd></>}
        {c?.approved_amount != null && <><dt>Approved</dt><dd className={css.money}>{money(Number(c.approved_amount))}{Number(c.adjustment_amount) ? ` (includes adjustment ${money(Number(c.adjustment_amount))}: ${c.adjustment_reason})` : ""}</dd></>}
        {c?.approval_note && <><dt>Approval note</dt><dd>{c.approval_note}</dd></>}
        {c?.net_payable != null && <>
          <dt>Less retention ({Number(c.retention_percent)}%)</dt><dd className={css.money}>{money(Number(c.retention_amount))}</dd>
          <dt>VAT</dt><dd className={css.money}>{c.vat_treatment === "standard" ? money(Number(c.vat_amount)) : c.vat_treatment === "reverse_charge" ? "Reverse charge: none charged" : "Not registered: none"}</dd>
          <dt>Less CIS ({Number(c.cis_rate)}%{Number(c.cis_materials) ? `, after materials of ${money(Number(c.cis_materials))}` : ""})</dt><dd className={css.money}>{money(Number(c.cis_amount))}</dd>
          <dt>Payable</dt><dd className={css.money}><strong>{money(Number(c.net_payable))}</strong></dd></>}
        {c?.paid_on && <><dt>Payment recorded</dt><dd>{money(Number(c.paid_amount))} on {calendarDate(c.paid_on)}{c.payment_reference ? ` · ${c.payment_reference}` : ""}</dd></>}
      </dl>
    </section>

    {inv.status === "with_office" && <section className={styles.panel} aria-label="Approve">
      <h2>Approve for payment</h2>
      <p className={styles.muted}>Approve up to what the supervisor verified. If you approve less than the gang claimed, write the reason: it is kept with the invoice. A pay less notice may be needed under the agreed terms.</p>
      <OperationsForm action={decideGangInvoiceAction} submitLabel="Approve for payment">{hidden("approve")}
        {ls.map(l => {
          const suggested = rateFor((rates.data ?? []) as GangRate[], pathOf(l.work_area_id), l.unit, inv.period_end);
          return <div className={css.lineBox} key={l.id}>
            <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name={`label_${l.id}`} value={areaName(l.work_area_id)} />
            <h3>{areaName(l.work_area_id)}: claimed {quantityText(l.claimed_quantity, l.unit)}, verified {quantityText(l.verified_quantity, l.unit)}</h3>
            <div className={css.inputs}>
              <label className={styles.field}>Approved quantity ({unitLabel(l.unit)})<input name={`approved_${l.id}`} inputMode="decimal" defaultValue={String(l.verified_quantity ?? 0)} required /></label>
              <label className={styles.field}>Rate £ per {unitLabel(l.unit)}<input name={`rate_${l.id}`} inputMode="decimal" defaultValue={suggested ? String(suggested.rate) : ""} placeholder="Agreed rate" /></label>
            </div>
            {!suggested && <small>No agreed rate is recorded for this area and unit. Enter the rate agreed with the gang.</small>}
          </div>;
        })}
        {xs.map(e => <div className={css.lineBox} key={e.id}>
          <input type="hidden" name="extra_id" value={e.id} /><input type="hidden" name={`extra_label_${e.id}`} value={e.description.slice(0, 190)} />
          <h3>{extraKind[e.kind]}: {e.description}</h3>
          <p className={styles.muted} style={{ margin: "0 0 8px" }}>Claimed {e.claimed_amount != null ? money(Number(e.claimed_amount)) : "no amount"}{e.kind === "day_rate" ? ` (${extraQuantity(e.claimed_quantity, e.unit, e.kind)} at ${money(Number(e.rate))})` : ""} · supervisor: {extraQuantity(e.confirmed_quantity, e.unit, e.kind)}{e.confirmation_note ? ` — ${e.confirmation_note}` : ""}</p>
          <label className={styles.field}>Approved amount £ (at most {money(extraLimit(e))})<input name={`extra_approved_${e.id}`} inputMode="decimal" required defaultValue={e.kind === "additional" ? "" : extraLimit(e).toFixed(2)} placeholder={e.kind === "additional" ? "Your decision: 0 to approve nothing" : undefined} /></label>
        </div>)}
        {tax ? <div className={css.lineBox}>
          <h3>Payment deductions</h3>
          <p className={styles.muted} style={{ margin: "0 0 8px" }}>Worked out when you approve and kept apart from the invoice value: retention {Number(terms.data?.retention_percent ?? 0)}% (agreed for this job), then CIS at {cisLabels[tax.cis_status].toLowerCase()} on the labour paid{tax.vat_registered ? (tax.vat_reverse_charge ? "; reverse charge, so no VAT is paid" : "; VAT at 20% is added") : ""}.</p>
          <label className={styles.field}>Materials supplied by the subcontractor £ (excluded from CIS; leave blank for labour only)<input name="cis_materials" inputMode="decimal" /></label>
          {tax.cis_status === "unverified" && <p className={styles.warning}>CIS status is not verified with HMRC. <Link href={`/admin/subcontractors/${inv.team_id}`}>Record the verification</Link> before approving: the approval will be refused until then.</p>}
        </div> : <p className={styles.muted}>No tax details are recorded for this subcontractor, so no CIS, retention or VAT is worked out: record the amount actually paid. <Link href={`/admin/subcontractors/${inv.team_id}`}>Record tax details</Link> first to have them calculated.</p>}
        <div className={css.inputs}>
          <label className={styles.field}>Agreed adjustment £ (optional, minus for a deduction)<input name="adjustment_amount" inputMode="decimal" /></label>
          <label className={styles.field}>Adjustment reason<input name="adjustment_reason" maxLength={1000} /></label>
          <label className={styles.field}>Agreed payment date (only if different)<input name="agreed_payment_on" type="date" /></label>
        </div>
        <label className={styles.field}>Note{verifiedTotal < claimedTotal || extrasShort ? " (required: you are approving less than claimed)" : " (optional; required if you approve less than claimed)"}<textarea name="note" rows={2} maxLength={2000} required={verifiedTotal < claimedTotal || extrasShort} /></label>
        <small>A deduction for defective work or damage goes in the adjustment with its reason and evidence, after the subcontractor has been notified and given the chance to put it right. A pay less notice may be needed before the final date for payment.</small>
      </OperationsForm>
    </section>}
    {inv.status === "approved" && <section className={styles.panel} aria-label="Record payment">
      <h2>Record payment made</h2>
      <p className={styles.muted}>Record a payment once it has been made. Nothing is sent to the bank from TileSpec.</p>
      <OperationsForm action={decideGangInvoiceAction} submitLabel="Record payment">{hidden("mark_paid")}
        <div className={css.inputs}>
          <label className={styles.field}>Amount paid £<input name="paid_amount" inputMode="decimal" required defaultValue={c?.net_payable != null ? String(c.net_payable) : c?.approved_amount != null ? String(c.approved_amount) : ""} /></label>
          <label className={styles.field}>Paid on<input name="paid_on" type="date" defaultValue={today} max={today} /></label>
          <label className={styles.field}>Payment reference<input name="payment_reference" maxLength={120} /></label>
        </div>
        <small>{c?.net_payable != null ? "The amount payable after retention, VAT and CIS is filled in. Record what was actually paid." : "If CIS or other deductions apply, record the amount actually paid."}</small>
      </OperationsForm>
    </section>}
    {inv.status === "with_office" && noteForm("query_gang", "Ask the gang a question", "Send question", "Question for the gang")}
    {["with_office", "query_gang"].includes(inv.status) && noteForm("recheck", "Ask the supervisor to check again", "Send back for re-check", "What should the supervisor check?")}
    {["awaiting_check", "with_office", "query_gang"].includes(inv.status) && noteForm("return", "Return to the gang for correction", "Return invoice", "What must the gang correct?")}
    {["awaiting_check", "with_office", "query_gang", "returned"].includes(inv.status) && noteForm("reject", "Reject this invoice", "Reject invoice", "Reason for rejecting it (the gang will see this)")}

    <details className={styles.panel} open><summary><strong>History</strong></summary>
      <ul className={css.history}>{(events.data ?? []).map(e => <li key={e.id}><time>{eventDate(e.created_at)} · {e.actor_name}{e.visibility === "office" ? " · office only" : ""}</time>
        {e.note ?? gangStatusLabel(e.to_status ?? "")}
        {e.action === "approved_money" && <> — approved {money(Number((e.details as { approved_amount?: number }).approved_amount ?? 0))}</>}
        {e.action === "verified" && Array.isArray((e.details as { lines?: unknown[] }).lines) && <> — {((e.details as { lines: { area: string; unit: string; claimed: number; verified: number }[] }).lines)
          .map(x => `${x.area}: claimed ${quantityText(x.claimed, x.unit)}, verified ${quantityText(x.verified, x.unit)}`).join("; ")}</>}
      </li>)}</ul>
    </details>
  </>;
}
