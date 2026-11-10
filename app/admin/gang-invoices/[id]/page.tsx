import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { OperationsForm } from "@/components/operations/operations-form";
import { gangStatusLabel, gangStatusTone, ledgerFor, paymentTermsText, quantityText, rateFor, unitLabel, type GangRate, type LedgerRow } from "@/lib/operations/gang-invoices";
import { londonDate } from "@/lib/operations/planning";
import { calendarDate, eventDate, money } from "@/components/operations/format";
import { decideGangInvoiceAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
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
    supabase.from("gang_subcontracts").select("payment_cycle,pay_weekday,payment_days,cycle_anchor,terms_note").eq("id", inv.subcontract_id).maybeSingle(),
    supabase.from("gang_rates").select("id,work_area_id,unit,rate,effective_from,created_at,voided_at").eq("subcontract_id", inv.subcontract_id),
    supabase.from("work_areas").select("id,name,path_ids").eq("contract_id", inv.contract_id),
    supabase.rpc("gang_claim_ledger", { p_contract: inv.contract_id, p_team: inv.team_id }),
  ]);
  [lines, commercial, files, events, request, contract, terms, rates, areas].forEach(r => checkDatabase(r.error));
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
      <p className={styles.description}>Sent {eventDate(inv.submitted_at)} by {inv.submitted_by_name}{inv.period_start ? ` · work from ${inv.period_start}` : ""} to {inv.period_end}.</p></div>
      <Link href="/admin/gang-invoices">All gang invoices</Link></div>
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
        <dt>Invoice total</dt><dd className={css.money}>{c?.invoice_total != null ? money(Number(c.invoice_total)) : "Not given — see the invoice"}</dd>
        {terms.data && <><dt>Terms</dt><dd>{paymentTermsText(terms.data)}{terms.data.terms_note ? ` ${terms.data.terms_note}` : ""}</dd></>}
        {due && <><dt>Payment due</dt><dd>{calendarDate(due)}{due < today && !["paid", "rejected", "cancelled", "superseded"].includes(inv.status) ? " — overdue" : ""}</dd></>}
        {c?.approved_amount != null && <><dt>Approved</dt><dd className={css.money}>{money(Number(c.approved_amount))}{Number(c.adjustment_amount) ? ` (includes adjustment ${money(Number(c.adjustment_amount))}: ${c.adjustment_reason})` : ""}</dd></>}
        {c?.approval_note && <><dt>Approval note</dt><dd>{c.approval_note}</dd></>}
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
        <div className={css.inputs}>
          <label className={styles.field}>Agreed adjustment £ (optional, minus for a deduction)<input name="adjustment_amount" inputMode="decimal" /></label>
          <label className={styles.field}>Adjustment reason<input name="adjustment_reason" maxLength={1000} /></label>
          <label className={styles.field}>Agreed payment date (only if different)<input name="agreed_payment_on" type="date" /></label>
        </div>
        <label className={styles.field}>Note{verifiedTotal < claimedTotal ? " (required: you are approving less than claimed)" : " (optional)"}<textarea name="note" rows={2} maxLength={2000} required={verifiedTotal < claimedTotal} /></label>
      </OperationsForm>
    </section>}
    {inv.status === "approved" && <section className={styles.panel} aria-label="Record payment">
      <h2>Record payment made</h2>
      <p className={styles.muted}>Record a payment once it has been made. Nothing is sent to the bank from TileSpec.</p>
      <OperationsForm action={decideGangInvoiceAction} submitLabel="Record payment">{hidden("mark_paid")}
        <div className={css.inputs}>
          <label className={styles.field}>Amount paid £<input name="paid_amount" inputMode="decimal" required defaultValue={c?.approved_amount != null ? String(c.approved_amount) : ""} /></label>
          <label className={styles.field}>Paid on<input name="paid_on" type="date" defaultValue={today} max={today} /></label>
          <label className={styles.field}>Payment reference<input name="payment_reference" maxLength={120} /></label>
        </div>
        <small>If CIS or other deductions apply, record the amount actually paid.</small>
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
