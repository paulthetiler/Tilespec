import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireSite } from "@/app/admin/supervisor/site-access";
import { checkDatabase } from "@/lib/operations/data";
import { OperationsForm } from "@/components/operations/operations-form";
import { VerifyLine, WorkmanshipChoice } from "@/components/gang/verify-line";
import { ClaimPhotoForm } from "@/components/gang/invoice-form";
import { addClaimPhotoAction } from "@/app/admin/gang/actions";
import { gangStatusLabel, gangStatusTone, ledgerFor, quantityText, unitLabel, type LedgerRow } from "@/lib/operations/gang-invoices";
import { verifyGangInvoiceAction } from "../actions";
import styles from "@/app/admin/admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Operational information only. Row-level security gives a supervisor no rates, amounts, invoice
// document or payment records, whatever this page asks for.
export default async function VerifyGangInvoice({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  if (!uuidPattern.test(invoiceId)) notFound();
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  const invoice = await supabase.from("gang_invoices")
    .select("id,reference,team_id,status,workmanship,submitted_at,submitted_by_name,period_start,period_end,gang_note,verified_by_name,verified_at,supervisor_note,correction_note,version")
    .eq("id", invoiceId).eq("contract_id", id).maybeSingle();
  checkDatabase(invoice.error);
  if (!invoice.data) notFound();
  const inv = invoice.data;
  const [lines, ledger, team, photos, events, request, areas] = await Promise.all([
    supabase.from("gang_invoice_lines").select("id,line_no,work_area_id,unit,claimed_quantity,description,verified_quantity,line_quality,verification_note,approved_quantity").eq("invoice_id", inv.id).order("line_no"),
    supabase.rpc("gang_claim_ledger", { p_contract: id, p_team: inv.team_id }),
    supabase.from("teams").select("name").eq("id", inv.team_id).maybeSingle(),
    supabase.from("gang_invoice_files").select("id,kind,uploaded_at").eq("invoice_id", inv.id).neq("kind", "invoice").not("uploaded_at", "is", null),
    supabase.from("gang_invoice_events").select("id,action,actor_name,note,created_at,to_status").eq("invoice_id", inv.id).order("id"),
    supabase.from("gang_verification_requests").select("reason,office_note,routed_to").eq("invoice_id", inv.id).is("resolved_at", null).maybeSingle(),
    supabase.from("work_areas").select("id,name,path_ids").eq("contract_id", id),
  ]);
  [lines, ledger, photos, events, request, areas].forEach(r => checkDatabase(r.error));
  const areaById = new Map((areas.data ?? []).map(a => [a.id, a]));
  const areaName = (areaId: string) => (areaById.get(areaId)?.path_ids as string[] | undefined)?.map(p => areaById.get(p)?.name).filter(Boolean).join(" › ") || "Area";
  const rows = (ledger.data ?? []) as LedgerRow[];
  const waiting = inv.status === "awaiting_check" && !!request.data;
  const tone = gangStatusTone(inv.status, inv.workmanship);

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.reference} · {inv.reference}</p>
      <h1 className={styles.title}>{team.data?.name ?? "Gang"}</h1>
      <p className={styles.description}>Invoice sent {when(inv.submitted_at)} by {inv.submitted_by_name}{inv.period_start ? ` · work from ${inv.period_start}` : ""} to {inv.period_end}.</p></div>
      <Link href={`${base}/progress`}>Back to gang progress</Link></div>
    <p><span className={`${css.status} ${css[tone]}`}>{gangStatusLabel(inv.status, inv.workmanship)}</span></p>
    {request.data?.reason === "office_recheck" && <p className={styles.warning}><strong>The office asked you to check again:</strong> {request.data.office_note}</p>}
    {inv.gang_note && <p className={styles.panel}><strong>Gang&apos;s note:</strong> {inv.gang_note}</p>}

    {waiting ? <section className={styles.panel} aria-label="Check the work">
      <h2>Check the work</h2>
      <p className={styles.muted}>Use what you have already recorded this week before measuring again. Only add work that is not yet recorded. The gang&apos;s invoice is kept exactly as sent.</p>
      <OperationsForm action={verifyGangInvoiceAction} submitLabel="Send verification to the office">
        <input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="invoice_id" value={inv.id} />
        <input type="hidden" name="version" value={inv.version} />
        <input type="hidden" name="request_key" value={randomUUID()} />
        {(lines.data ?? []).map(l => {
          const row = ledgerFor(rows, l.work_area_id, l.unit);
          return <VerifyLine key={l.id} lineId={l.id} label={`${areaName(l.work_area_id)} — claimed ${quantityText(l.claimed_quantity, l.unit)}`}
            unit={l.unit} unitText={unitLabel(l.unit)} claimed={Number(l.claimed_quantity)} passed={row.passed} correction={row.correction}
            approved={row.approved} verifiedElsewhere={row.verified} available={row.available} />;
        })}
        <WorkmanshipChoice />
        <label className={styles.field}>Notes for the office (optional)<textarea name="note" rows={2} maxLength={2000} placeholder="Anything the office should know about the quantities" /></label>
      </OperationsForm>
    </section> : <section className={styles.panel} aria-label="Verification">
      <h2>Verification</h2>
      <table className={css.compare}><thead><tr><th>Work area</th><th className={css.num}>Gang claimed</th><th className={css.num}>Supervisor verified</th><th className={css.num}>Difference</th><th>Quality</th></tr></thead>
        <tbody>{(lines.data ?? []).map(l => <tr key={l.id}><td>{areaName(l.work_area_id)}{l.verification_note ? <><br /><small>{l.verification_note}</small></> : null}</td>
          <td className={css.num}>{quantityText(l.claimed_quantity, l.unit)}</td><td className={css.num}>{quantityText(l.verified_quantity, l.unit)}</td>
          <td className={`${css.num} ${css.difference}`}>{l.verified_quantity === null ? "—" : quantityText(Number(l.claimed_quantity) - Number(l.verified_quantity), l.unit)}</td>
          <td>{l.line_quality === "passed" ? "Checked and passed" : l.line_quality === "correction_required" ? "Correction needed" : "—"}</td></tr>)}</tbody></table>
      {inv.verified_at && <p className={styles.muted}>Checked by {inv.verified_by_name} on {when(inv.verified_at)}.</p>}
      {inv.correction_note && <p className={styles.warning}><strong>Correction needed:</strong> {inv.correction_note} <Link href={`${base}/progress`}>Record it as corrected and checked</Link> when it is done.</p>}
      {inv.supervisor_note && <p><strong>Notes:</strong> {inv.supervisor_note}</p>}
      {inv.status === "awaiting_check" && !request.data && <p className={styles.warning}>This invoice is waiting for a check but no request is open. Refresh, or contact the office.</p>}
    </section>}

    <section className={styles.panel} aria-label="Photos">
      <h2>Photos</h2>
      {(photos.data ?? []).length ? <div className={css.thumbs}>{(photos.data ?? []).map(p => <a key={p.id} href={`/admin/gang-invoices/files/${p.id}`} target="_blank" rel="noopener noreferrer"
        aria-label={p.kind === "gang_photo" ? "Gang's photo" : "Supervisor's photo"}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/gang-invoices/files/${p.id}`} alt="" /></a>)}</div>
        : <p className={styles.muted}>No photos yet.</p>}
      {!["paid", "rejected", "cancelled", "superseded"].includes(inv.status) && <ClaimPhotoForm action={addClaimPhotoAction} invoiceId={inv.id} label="Add your photo of the work" />}
      <p className={styles.muted}>Defective work that needs a formal snag? <Link href={`/admin/snags/new?contract=${id}`}>Report it as a snag</Link> as well.</p>
    </section>

    <details className={styles.panel}><summary><strong>History</strong></summary>
      <ul className={css.history}>{(events.data ?? []).map(e => <li key={e.id}><time>{when(e.created_at)} · {e.actor_name}</time>{e.note ?? gangStatusLabel(e.to_status ?? "")}</li>)}</ul>
    </details>
  </>;
}
