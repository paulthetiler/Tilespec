import Link from "next/link";
import { Fragment } from "react";
import { randomUUID } from "node:crypto";
import { requireSite } from "@/app/admin/supervisor/site-access";
import { checkDatabase } from "@/lib/operations/data";
import { OperationsForm } from "@/components/operations/operations-form";
import { gangStatusLabel, gangStatusTone, quantityText } from "@/lib/operations/gang-invoices";
import { clearGangCorrectionAction, recordGangProgress, voidGangMeasurementAction } from "./actions";
import styles from "@/app/admin/admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));

export default async function GangProgress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  const [requests, invoices, teams, members, areas, checks] = await Promise.all([
    supabase.from("gang_verification_requests").select("invoice_id,reason,office_note,created_at").eq("contract_id", id).is("resolved_at", null).order("created_at"),
    supabase.from("gang_invoices").select("id,reference,team_id,status,workmanship,submitted_at,verified_at").eq("contract_id", id).order("submitted_at", { ascending: false }).limit(60),
    supabase.from("teams").select("id,name,active").order("name"),
    supabase.from("team_memberships").select("team_id,valid_from,valid_until,voided_at,operatives(display_name)").is("voided_at", null),
    supabase.from("work_areas").select("id,name,path_ids,archived_at,sort_order").eq("contract_id", id).order("sort_order"),
    supabase.from("gang_progress_checks").select("id,team_id,work_area_id,quantity,unit,quality_status,correction_status,correction_cleared_note,note,measured_on,period_start,checked_by_name,source_invoice_id,voided_at,void_reason")
      .eq("contract_id", id).order("checked_at", { ascending: false }).limit(150),
  ]);
  [requests, invoices, teams, areas].forEach(r => checkDatabase(r.error));
  const invoiceIds = (invoices.data ?? []).map(i => i.id);
  const lines = invoiceIds.length ? await supabase.from("gang_invoice_lines").select("invoice_id,work_area_id,unit,claimed_quantity,verified_quantity,line_no").in("invoice_id", invoiceIds).order("line_no") : { data: [], error: null };
  checkDatabase(lines.error);
  const areaById = new Map((areas.data ?? []).map(a => [a.id, a]));
  const areaName = (areaId: string) => (areaById.get(areaId)?.path_ids as string[] | undefined)?.map(p => areaById.get(p)?.name).filter(Boolean).join(" › ") || "Area";
  const teamName = new Map((teams.data ?? []).map(t => [t.id, t.name]));
  const today = new Date().toISOString().slice(0, 10);
  const people = (teamId: string) => (members.data ?? []).filter(m => m.team_id === teamId && m.valid_from <= today && (!m.valid_until || m.valid_until >= today))
    .map(m => (m.operatives as unknown as { display_name: string } | null)?.display_name).filter(Boolean).join(" & ");
  const gangLabel = (teamId: string) => { const name = teamName.get(teamId) ?? "Gang"; const who = people(teamId); return who && !name.includes(who.split(" ")[0]) ? `${name} — ${who}` : name; };
  const openIds = new Set((requests.data ?? []).map(r => r.invoice_id));
  const pending = (invoices.data ?? []).filter(i => openIds.has(i.id)).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const recent = (invoices.data ?? []).filter(i => !openIds.has(i.id) && i.verified_at).slice(0, 10);
  const linesFor = (invoiceId: string) => (lines.data ?? []).filter(l => l.invoice_id === invoiceId);
  const requestFor = (invoiceId: string) => (requests.data ?? []).find(r => r.invoice_id === invoiceId);
  const activeAreas = (areas.data ?? []).filter(a => !a.archived_at);
  const qualityText = (c: { quality_status: string; correction_status: string | null; voided_at: string | null }) =>
    c.voided_at ? "Voided" : c.quality_status === "passed" ? "Checked and passed" : c.correction_status === "cleared" ? "Corrected and checked" : "Correction needed";

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.reference}</p>
      <h1 className={styles.title}>Verify gang progress{pending.length > 0 && <span className={css.count} aria-label={`${pending.length} waiting`}>{pending.length}</span>}</h1>
      <p className={styles.description}>Check the quantity and quality of work gangs have invoiced. Quantities only: no rates or money.</p></div>
      <Link href={base}>Back to site</Link></div>

    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading" className={css.sectionTitle}>Awaiting check</h2>
      {pending.length === 0 ? <p className={styles.muted}>No gang invoices are waiting for you to check.</p>
        : <ul className={css.cards}>{pending.map(invoice => {
          const request = requestFor(invoice.id);
          return <li key={invoice.id}><Link className={css.card} href={`${base}/progress/${invoice.id}`}>
            <div className={css.cardHead}><h3>{gangLabel(invoice.team_id)}</h3><span className={`${css.status} ${css.wait}`}>Awaiting check</span></div>
            <dl className={css.facts}>
              <dt>Invoice submitted</dt><dd>{day(invoice.submitted_at)}</dd>
              {linesFor(invoice.id).map(l => <Fragment key={l.line_no}><dt>Work area</dt><dd>{areaName(l.work_area_id)}</dd>
                <dt>Quantity claimed</dt><dd>{quantityText(l.claimed_quantity, l.unit)}</dd></Fragment>)}
              <dt>Status</dt><dd>Awaiting verification</dd>
            </dl>
            {request?.reason === "office_recheck" && <p className={styles.warning}>The office asked you to check again: {request.office_note}</p>}
            <span className={styles.secondaryButton} style={{ marginTop: 10, display: "inline-flex" }}>Check this invoice</span>
          </Link></li>;
        })}</ul>}
    </section>

    {recent.length > 0 && <section aria-labelledby="recent-heading">
      <h2 id="recent-heading" className={css.sectionTitle}>Checked recently</h2>
      <ul className={css.cards}>{recent.map(invoice => <li key={invoice.id}><Link className={css.card} href={`${base}/progress/${invoice.id}`}>
        <div className={css.cardHead}><h3>{gangLabel(invoice.team_id)} · {invoice.reference}</h3>
          <span className={`${css.status} ${css[gangStatusTone(invoice.status, invoice.workmanship)]}`}>{gangStatusLabel(invoice.status, invoice.workmanship)}</span></div>
        <p className={styles.muted} style={{ margin: 0 }}>{linesFor(invoice.id).map(l => `${areaName(l.work_area_id)}: claimed ${quantityText(l.claimed_quantity, l.unit)}, verified ${quantityText(l.verified_quantity, l.unit)}`).join(" · ")}</p>
      </Link></li>)}</ul>
    </section>}

    <details className={styles.panel} open={pending.length === 0}>
      <summary><strong>Record a site measurement</strong></summary>
      <p className={styles.muted}>Record new work only: what was completed in this period, not a running total. Work needing correction is not passed for payment until you record it as corrected and checked.</p>
      <OperationsForm action={recordGangProgress} submitLabel="Save measurement">
        <input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="request_key" value={randomUUID()} />
        <label className={styles.field}>Gang<select name="team_id" required defaultValue=""><option value="">Choose gang</option>
          {(teams.data ?? []).filter(t => t.active).map(t => <option key={t.id} value={t.id}>{gangLabel(t.id)}</option>)}</select></label>
        <label className={styles.field}>Work area<select name="work_area_id" required defaultValue=""><option value="">Choose area</option>
          {activeAreas.map(a => <option key={a.id} value={a.id}>{areaName(a.id)}</option>)}</select></label>
        <div className={css.inputs}>
          <label className={styles.field}>New work measured<input name="quantity" inputMode="decimal" required autoComplete="off" /></label>
          <label className={styles.field}>Unit<select name="unit" defaultValue="m2"><option value="m2">m²</option><option value="lm">linear m</option><option value="item">items</option></select></label>
          <label className={styles.field}>Period from (optional)<input name="period_start" type="date" /></label>
        </div>
        <label className={styles.field}>Quality check<select name="quality_status" defaultValue="passed"><option value="passed">Checked and passed</option><option value="correction_required">Correction needed — not passed</option></select></label>
        <label className={styles.field}>Location details / notes<textarea name="note" maxLength={2000} rows={2} placeholder="Exact floor area, measurements or correction needed" /></label>
      </OperationsForm>
    </details>

    <section className={styles.panel} aria-labelledby="measurements-heading">
      <h2 id="measurements-heading">Site measurements</h2>
      <p className={styles.muted}>Each line is new work measured in its period. Records are never overwritten; a mistake is voided with a reason.</p>
      {checks.error ? <p className={styles.warning}>Measurements are unavailable: {checks.error.message}</p>
        : (checks.data ?? []).length === 0 ? <p>No gang measurements recorded yet.</p>
          : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Date</th><th>Gang</th><th>Area</th><th>New work</th><th>Quality</th><th>Notes</th><th></th></tr></thead>
            <tbody>{(checks.data ?? []).map(c => <tr key={c.id} style={c.voided_at ? { opacity: 0.6 } : undefined}>
              <td>{c.period_start ? `${c.period_start} – ` : ""}{c.measured_on}</td><td>{teamName.get(c.team_id) ?? "Gang"}</td><td>{areaName(c.work_area_id)}</td>
              <td>{quantityText(c.quantity, c.unit)}</td><td>{qualityText(c)}</td>
              <td>{[c.note, c.correction_cleared_note && `Corrected: ${c.correction_cleared_note}`, c.void_reason && `Voided: ${c.void_reason}`, c.source_invoice_id && "Recorded while checking an invoice", c.checked_by_name].filter(Boolean).join(" · ")}</td>
              <td>{!c.voided_at && <details><summary>Change</summary>
                {c.correction_status === "open" && <OperationsForm action={clearGangCorrectionAction} submitLabel="Corrected and checked" compact>
                  <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="check_id" value={c.id} />
                  <label className={styles.field}>What was corrected<input name="note" required minLength={3} maxLength={2000} /></label>
                </OperationsForm>}
                <OperationsForm action={voidGangMeasurementAction} submitLabel="Void measurement" compact>
                  <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="check_id" value={c.id} />
                  <label className={styles.field}>Reason<input name="reason" required minLength={5} maxLength={2000} /></label>
                </OperationsForm>
              </details>}</td>
            </tr>)}</tbody></table></div>}
    </section>
  </>;
}
