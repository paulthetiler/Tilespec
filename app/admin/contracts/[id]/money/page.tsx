import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinancialActor } from "@/lib/auth";
import {
  matchMaterialAction, recordJobCostAction, saveLabourRateAction, unmatchMaterialAction, voidJobCostAction, voidLabourRateAction,
} from "@/app/admin/money-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { dayworkLabelsForContract } from "@/lib/operations/daywork-data";
import { dayworkReference, pounds } from "@/lib/operations/dayworks";
import { costCategories, costCategoryLabels, labourSummary, materialUnitLabels } from "@/lib/operations/job-costs";
import { jobMoneyFor, materialsFor } from "@/lib/operations/job-costs-data";
import { claimableExtrasFor, paymentsFor } from "@/lib/operations/payments-data";
import { positionsFor } from "@/lib/operations/financial-position-data";
import { FinancialPositionView } from "@/components/office/financial-position";
import { PaymentApplications } from "@/components/office/payment-applications";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { dayLabel, londonDate } from "@/lib/operations/planning";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Job money (money access only): labour costed from attendance, purchases and invoices, and the
// materials site recorded, matched to what was bought. Every figure comes from saved records.
export default async function JobMoney({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase } = await requireFinancialActor();
  const contract = await supabase.from("contracts").select("id,reference,name").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const [money, materials, operatives, teams, companies, locations, extras, documents, payments, claimable, positions] = await Promise.all([
    jobMoneyFor(supabase, id), materialsFor(supabase, id), supabase.from("operatives").select("id,display_name,company_id").order("display_name"),
    supabase.from("teams").select("id,name,company_id").order("name"), supabase.from("subcontractor_companies").select("id,name").order("name"),
    locationsFor(supabase, id), dayworkLabelsForContract(supabase, id),
    supabase.from("document_revisions").select("id,title,document_reference,revision").eq("contract_id", id).not("uploaded_at", "is", null).order("document_reference"),
    paymentsFor(supabase, id), claimableExtrasFor(supabase, id), positionsFor(supabase, [id]),
  ]);
  for (const result of [operatives, teams, companies, documents]) checkDatabase(result.error);
  const header = <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.data.reference}</p><h1 className={styles.title}>Job money</h1>
    <p className={styles.description}>{contract.data.name}. Costs from saved records only.</p></div>
    <Link className={styles.secondaryButton} href={`/admin/contracts/${id}`}>Back to the job</Link></div>;
  if (!money || !materials) return <>{header}<p className={styles.warning}>Job costs are not available until the office applies the database update.</p></>;
  const people = (operatives.data ?? []) as { id: string; display_name: string; company_id: string | null }[];
  const gangs = (teams.data ?? []) as { id: string; name: string; company_id: string | null }[];
  const firms = (companies.data ?? []) as { id: string; name: string }[];
  const name = (rate: { operative_id: string | null; company_id: string | null; team_id: string | null }) => rate.operative_id
    ? people.find(p => p.id === rate.operative_id)?.display_name ?? "Operative" : rate.team_id ? `${gangs.find(g => g.id === rate.team_id)?.name ?? "Gang"} (gang)`
      : `${firms.find(f => f.id === rate.company_id)?.name ?? "Company"} (per operative)`;
  const labour = labourSummary(money.labour), index = indexLocations(locations), today = londonDate();
  const costs = money.costs.filter(cost => !cost.voided_at), rates = money.rates.filter(rate => !rate.voided_at);
  const currentMatch = (record: string) => money.matches.find(match => match.material_record_id === record && !match.voided_at);
  const key = () => <input type="hidden" name="request_key" value={randomUUID()} />;
  const job = <input type="hidden" name="contract_id" value={id} />;
  return <>
    {header}
    {positions?.get(id) && <section className={styles.panel} id="position" aria-label="Financial position">
      <h2>Financial position</h2><FinancialPositionView position={positions.get(id)!} /></section>}
    {payments ? <PaymentApplications contractId={id} payments={payments} extras={claimable} />
      : <p className={styles.warning}>Payment applications are not available until the office applies the database update.</p>}
    <section className={styles.panel} id="labour" aria-label="Labour">
      <h2>Labour from attendance</h2>
      <div className={styles.metrics}>
        <div className={styles.metric}><span className={styles.metricLabel}>Labour cost</span><strong className={styles.metricValue}>{pounds(labour.cost)}</strong>
          <span className={styles.small}>{labour.costedHours} hours costed</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Hours without a rate</span><strong className={styles.metricValue}>{labour.noRateHours}</strong>
          <span className={styles.small}>Add a rate below to cost them</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Still on site</span><strong className={styles.metricValue}>{labour.open}</strong>
          <span className={styles.small}>Costed once the day is finished</span></div>
      </div>
      {money.labour.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Day</th><th>Who</th><th>Hours</th><th>Rate</th><th>Cost</th></tr></thead>
        <tbody>{money.labour.map(line => <tr key={`${line.work_date}-${line.subject}-${line.subject_id}`} data-labour-status={line.status}>
          <td>{dayLabel(line.work_date)}</td><td>{line.name}{line.subject === "team" ? " (gang)" : ""}</td><td>{line.hours}</td>
          <td>{line.rate === null ? "No rate" : `${pounds(line.rate)} per ${line.basis}`}</td>
          <td>{line.status === "costed" ? pounds(line.cost ?? 0) : line.status === "open" ? "Still on site" : "Not costed"}</td></tr>)}</tbody></table></div>
        : <p>No attendance has been recorded on this job yet.</p>}
    </section>

    <section className={styles.panel} id="labour-rates" aria-label="Labour cost rates">
      <h2>Labour cost rates</h2>
      <p className={styles.muted}>What labour costs TileSPEC: an operative&apos;s hourly or day rate, a subcontractor&apos;s agreed rate per operative, or a gang&apos;s agreed day rate. A rate for this job comes before a rate for every job.</p>
      {rates.length ? <ul className={styles.plainList}>{rates.map(rate => <li key={rate.id}>{name(rate)}: <strong>{pounds(rate.rate)} per {rate.basis}</strong>
        {" "}from {dayLabel(rate.effective_from)} · {rate.contract_id ? "this job" : "every job"}{rate.note ? ` · ${rate.note}` : ""}
        <details className={styles.details}><summary>Void</summary><OperationsForm action={voidLabourRateAction} submitLabel="Void this rate" compact>
          {job}<input type="hidden" name="rate_id" value={rate.id} /><label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
        </OperationsForm></details></li>)}</ul> : <p>No labour cost rates yet.</p>}
      <details className={styles.details}><summary>Add a rate</summary>
        <OperationsForm action={saveLabourRateAction} submitLabel="Save rate">
          {job}{key()}
          <fieldset className={styles.plainFieldset}><legend>For</legend>
            <label className={styles.checkboxRow}><input type="radio" name="subject" value="operative" defaultChecked />An operative</label>
            <label className={styles.checkboxRow}><input type="radio" name="subject" value="company" />A subcontractor, per operative</label>
            <label className={styles.checkboxRow}><input type="radio" name="subject" value="team" />A gang, per gang day</label>
          </fieldset>
          <label className={styles.field}>Operative<select name="operative_id" defaultValue=""><option value="">Choose</option>{people.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <label className={styles.field}>Subcontractor<select name="company_id" defaultValue=""><option value="">Choose</option>{firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className={styles.field}>Gang<select name="team_id" defaultValue=""><option value="">Choose</option>{gangs.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label className={styles.field}>Per<select name="basis" defaultValue="hour"><option value="hour">Hour</option><option value="day">Day</option></select></label>
          <label className={styles.field}>Rate (£, net)<input name="rate" inputMode="decimal" required /></label>
          <label className={styles.field}>From<input type="date" name="effective_from" defaultValue={today} required /></label>
          <fieldset className={styles.plainFieldset}><legend>Applies to</legend>
            <label className={styles.checkboxRow}><input type="radio" name="scope" value="all" defaultChecked />Every job</label>
            <label className={styles.checkboxRow}><input type="radio" name="scope" value="job" />This job only</label>
          </fieldset>
          <label className={styles.field}>Note (optional)<input name="note" maxLength={500} /></label>
          <p className={styles.small}>A gang rate is always per gang day. Labour already worked is costed at the rate in force on each day.</p>
        </OperationsForm>
      </details>
    </section>

    <section className={styles.panel} id="costs" aria-label="Purchases and invoices">
      <h2>Purchases and invoices</h2>
      {costs.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Date</th><th>What</th><th>From</th><th>Net</th><th></th></tr></thead>
        <tbody>{costs.map(cost => <tr key={cost.id}><td>{dayLabel(cost.cost_date)}</td>
          <td>{costCategoryLabels[cost.category]}: {cost.description}{cost.reference ? ` (${cost.reference})` : ""}{cost.daywork_id ? ` · ${(() => { const e = extras.find(x => x.id === cost.daywork_id); return e ? dayworkReference(e) : "extra work"; })()}` : ""}</td>
          <td>{cost.company_id ? firms.find(f => f.id === cost.company_id)?.name : cost.supplier}</td><td>{pounds(cost.net_amount)}</td>
          <td><details className={styles.details}><summary>Void</summary><OperationsForm action={voidJobCostAction} submitLabel="Void this cost" compact>
            {job}<input type="hidden" name="entry_id" value={cost.id} /><label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
          </OperationsForm></details></td></tr>)}</tbody></table></div> : <p>No purchases or invoices recorded yet.</p>}
      <details className={styles.details}><summary>Record a purchase or invoice</summary>
        <OperationsForm action={recordJobCostAction} submitLabel="Record cost">
          {job}{key()}
          <label className={styles.field}>Kind<select name="category" defaultValue="materials">{costCategories.map(c => <option key={c} value={c}>{costCategoryLabels[c]}</option>)}</select></label>
          <label className={styles.field}>Subcontractor (if one)<select name="company_id" defaultValue=""><option value="">None</option>{firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className={styles.field}>Or supplier<input name="supplier" maxLength={160} /></label>
          <label className={styles.field}>What for<input name="description" required minLength={3} maxLength={500} /></label>
          <label className={styles.field}>Invoice or delivery reference<input name="reference" maxLength={120} /></label>
          <label className={styles.field}>Date<input type="date" name="cost_date" defaultValue={today} /></label>
          <label className={styles.field}>Net amount (£, excluding VAT; a credit is negative)<input name="net_amount" inputMode="decimal" required /></label>
          <label className={styles.field}>Location (optional)<select name="work_area_id" defaultValue=""><option value="">Whole job</option>
            {locations.filter(l => !l.archived_at).map(l => <option key={l.id} value={l.id}>{locationPath(index, l.id)}</option>)}</select></label>
          <label className={styles.field}>For a daywork or variation (optional)<select name="daywork_id" defaultValue=""><option value="">No</option>
            {extras.map(e => <option key={e.id} value={e.id}>{dayworkReference(e)}: {e.description.slice(0, 60)}</option>)}</select></label>
          <label className={styles.field}>Document (optional)<select name="document_id" defaultValue=""><option value="">None</option>
            {((documents.data ?? []) as { id: string; title: string; document_reference: string; revision: number }[]).map(d =>
              <option key={d.id} value={d.id}>{d.document_reference} rev {d.revision}: {d.title}</option>)}</select></label>
          <p className={styles.small}>Subcontractors costed from attendance at an agreed rate should not also have their invoices entered here, or they are counted twice.</p>
        </OperationsForm>
      </details>
    </section>

    <section className={styles.panel} id="materials" aria-label="Materials used on site">
      <h2>Materials used on site</h2>
      <p className={styles.muted}>Recorded by site with quantities only. Match each to the purchase or invoice it came from.</p>
      {materials.filter(m => !m.voided_at).length ? <ul className={styles.plainList}>{materials.filter(m => !m.voided_at).map(record => {
        const match = currentMatch(record.id), cost = match ? money.costs.find(c => c.id === match.cost_entry_id) : null;
        return <li key={record.id} data-material-id={record.id}><strong>{record.item}</strong> · {record.quantity} {materialUnitLabels[record.unit]}
          {record.location_path.length ? ` · ${record.location_path.join(" › ")}` : ""}<span className={styles.small}> · {dayLabel(record.work_date)} · {record.recorded_by_name}</span>
          {match && cost ? <div className={styles.small}>Matched to {cost.description}{cost.reference ? ` (${cost.reference})` : ""} by {match.matched_by_name}
            <details className={styles.details}><summary>Unmatch</summary><OperationsForm action={unmatchMaterialAction} submitLabel="Unmatch" compact>
              {job}<input type="hidden" name="match_id" value={match.id} /><label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
            </OperationsForm></details></div>
            : costs.length ? <OperationsForm action={matchMaterialAction} submitLabel="Match" compact>
              {job}{key()}<input type="hidden" name="material_record_id" value={record.id} />
              <label className={styles.field}>Purchase or invoice<select name="cost_entry_id" required defaultValue="">
                <option value="">Choose</option>{costs.map(c => <option key={c.id} value={c.id}>{dayLabel(c.cost_date)} · {c.description}{c.reference ? ` (${c.reference})` : ""}</option>)}</select></label>
            </OperationsForm> : <p className={styles.small}>Not matched. Record the purchase or invoice above first.</p>}
        </li>;
      })}</ul> : <p>Site has not recorded any materials used yet.</p>}
    </section>
  </>;
}
