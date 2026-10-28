import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, canReadFinancial } from "@/lib/auth";
import {
  approveChargeAction, clientAuthorisationAction, decideDayworkAction, priceDayworkAction, recordSignoffAction, saveDayworkLinesAction, sendDayworkAction,
} from "@/app/admin/supervisor/daywork-actions";
import { DailyForm } from "@/components/site/daily-form";
import { DayworkLines } from "@/components/site/daywork-lines";
import { DayworkPhotoUploader } from "@/components/site/daywork-photos";
import { checkDatabase } from "@/lib/operations/data";
import { conversationsAvailable } from "@/lib/operations/daily-data";
import { isRecordId } from "@/lib/operations/daily-input";
import { dayworkMoneyFor, dayworksFor, rateItemsFor } from "@/lib/operations/daywork-data";
import {
  categoryLabels, currentLines, currentRates, dayworkReference, dayworkStatuses, dayworkWarning, eventLine, lineCategory, lineSummary, pounds, suggestRates, unitLabels,
} from "@/lib/operations/dayworks";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { requireSite } from "../../../../site-access";
import styles from "@/app/admin/admin.module.css";

export const dynamic = "force-dynamic";
const when = (iso: string) => `${londonClock(iso)}, ${dayLabel(londonDate(new Date(iso)))}`;

// One daywork. The site, office, charge and client statuses are shown separately. Rates,
// prices and totals are read and shown only for people with money access.
export default async function DayworkRecord({ params }: { params: Promise<{ id: string; dayworkId: string }> }) {
  const { id, dayworkId } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  if (!isRecordId(dayworkId)) notFound();
  const records = await dayworksFor(supabase, id, dayworkId);
  const daywork = records?.dayworks[0];
  if (!records || !daywork) notFound();
  const office = canManageContracts(member), money = canReadFinancial(member), owner = member.role === "owner";
  const base = `/admin/supervisor/sites/${id}`, reference = dayworkReference(daywork);
  const [moneyRecords, items, documents, ask] = await Promise.all([
    money ? dayworkMoneyFor(supabase, id) : Promise.resolve(null),
    daywork.site_status === "recorded" && daywork.office_status !== "rejected" ? rateItemsFor(supabase, id) : Promise.resolve([]),
    office ? supabase.from("document_revisions").select("id,title,document_reference,revision").eq("contract_id", id).not("uploaded_at", "is", null).order("document_reference")
      : Promise.resolve({ data: [], error: null }),
    member.role === "supervisor" ? conversationsAvailable(supabase) : Promise.resolve(false),
  ]);
  checkDatabase(documents.error);
  const lines = currentLines(daywork, records.lines), statuses = dayworkStatuses(daywork), warning = dayworkWarning(daywork);
  const events = records.events.filter(event => event.daywork_id === daywork.id);
  const submitted = events.some(event => event.actor_id === member.user_id && ["record", "update_lines", "send"].includes(event.action));
  const officeNote = [...events].reverse().find(event => event.action === "request_detail" || event.action === "reject");
  const photos = records.photos.filter(photo => photo.uploaded_at);
  const pricing = moneyRecords?.pricings.find(row => row.daywork_id === daywork.id);
  const pricedLines = pricing && pricing.lines_version === daywork.lines_version ? moneyRecords!.pricingLines.filter(line => line.pricing_id === pricing.id) : [];
  const approval = moneyRecords?.approvals.find(row => row.daywork_id === daywork.id);
  const rates = moneyRecords ? currentRates(moneyRecords.rates) : [];
  const suggestions = suggestRates(lines, rates);
  const rejected = daywork.office_status === "rejected";
  const key = () => <input type="hidden" name="request_key" value={randomUUID()} />;
  const ids = <><input type="hidden" name="daywork_id" value={daywork.id} /><input type="hidden" name="contract_id" value={id} /></>;
  const versioned = <>{ids}<input type="hidden" name="version" value={daywork.version} /></>;
  return <>
    <p className={styles.eyebrow}>Daywork</p>
    <h1 className={styles.title}>{reference}</h1>
    <p>{daywork.description}</p>
    {warning && <p className={styles.warning} role="status" data-daywork-warning="">{warning}</p>}
    <section className={styles.panel} aria-label="Statuses">
      <h2>Where it stands</h2>
      <dl data-daywork-statuses="">
        <dt>Site</dt><dd data-status="site">{statuses.site}</dd>
        <dt>Signature</dt><dd data-status="signature">{statuses.signature}</dd>
        <dt>Office</dt><dd data-status="office">{statuses.office}</dd>
        <dt>Charge</dt><dd data-status="charge">{statuses.charge}</dd>
        <dt>Client</dt><dd data-status="client">{statuses.client}</dd>
      </dl>
      {officeNote && <p><strong>{officeNote.action === "reject" ? "Why the office rejected it" : "The office asked"}:</strong> {officeNote.note}</p>}
    </section>
    <section className={styles.panel} aria-label="Details">
      <h2>Details</h2>
      <p>Where: {daywork.location_path.length ? daywork.location_path.join(" › ") : "Not one location"}</p>
      <p>Asked for by {daywork.instructed_by_name}{daywork.instructed_by_company ? `, ${daywork.instructed_by_company}` : ""}, {dayLabel(daywork.instructed_on)}</p>
      <p className={styles.small}>Recorded by {daywork.created_by_name} at {when(daywork.created_at)}</p>
    </section>
    <section className={styles.panel} aria-label="People, plant and materials">
      <h2>People, plant and materials</h2>
      {lines.length ? <ul className={styles.plainList}>{lines.map(line => {
        const priced = pricedLines.find(row => row.line_id === line.id);
        return <li key={line.id} data-line-id={line.id}>{lineSummary(line)}
          {priced && <span className={styles.small}> · {pounds(priced.rate)} per {priced.unit === "m2" ? "m²" : priced.unit} = <strong>{pounds(priced.amount)}</strong></span>}</li>;
      })}</ul> : <p>No lines yet. Add the people, plant and materials before sending it.</p>}
      {pricing && pricedLines.length > 0 && <p data-daywork-total=""><strong>Total {pounds(pricing.total)}</strong> · priced by {pricing.priced_by_name} at {when(pricing.priced_at)}</p>}
    </section>

    {!rejected && daywork.site_status === "recorded" && <section className={styles.panel} aria-label="Correct and send">
      <h2>{daywork.office_status === "more_detail" ? "Add the detail and send it again" : "Check and send"}</h2>
      {lines.length > 0 && daywork.office_status !== "more_detail" && <DailyForm action={sendDayworkAction} label="Send to the office">{versioned}{key()}</DailyForm>}
      <details className={styles.details} open={daywork.office_status === "more_detail" || !lines.length}><summary>Correct the people, plant and materials</summary>
        <DailyForm action={saveDayworkLinesAction} label="Save the lines">
          {versioned}{key()}<input type="hidden" name="send_key" value={randomUUID()} />
          <DayworkLines today={londonDate()} initial={lines} items={items} />
          <label className={styles.checkboxRow}><input type="checkbox" name="send_now" defaultChecked={daywork.office_status === "more_detail"} />Send to the office now</label>
        </DailyForm>
      </details>
    </section>}

    <section className={styles.panel} aria-label="Client signature">
      <h2>Client&apos;s signature</h2>
      <p className={styles.small}>The client&apos;s site representative signs to confirm the work, hours and materials only. It is not authorisation to pay.</p>
      {records.signoffs.length > 0 && <ul className={styles.plainList}>{records.signoffs.map(row => <li key={row.id}>
        {row.outcome === "signed" ? `Signed by ${row.signer_name}${row.signer_position ? `, ${row.signer_position}` : ""}${row.signer_company ? `, ${row.signer_company}` : ""}`
          : row.outcome === "refused" ? `Refused${row.signer_name ? ` by ${row.signer_name}` : ""}: ${row.reason}` : `Nobody available to sign: ${row.reason}`}
        <span className={styles.small}> · {when(row.signed_at)} · recorded by {row.recorded_by_name}</span></li>)}</ul>}
      {!rejected && <details className={styles.details} open={daywork.signoff_status === "none"}><summary>{daywork.signoff_status === "none" ? "Record the signature" : "Record another signature"}</summary>
        <DailyForm action={recordSignoffAction} label="Save">
          {ids}{key()}
          <fieldset className={styles.plainFieldset}><legend>What happened?</legend>
            <label className={styles.checkboxRow}><input type="radio" name="outcome" value="signed" defaultChecked />Signed</label>
            <label className={styles.checkboxRow}><input type="radio" name="outcome" value="refused" />Refused to sign</label>
            <label className={styles.checkboxRow}><input type="radio" name="outcome" value="unavailable" />Nobody available to sign</label>
          </fieldset>
          <label className={styles.field}>Name<input name="signer_name" maxLength={120} /></label>
          <label className={styles.field}>Position (optional)<input name="signer_position" maxLength={120} /></label>
          <label className={styles.field}>Company (optional)<input name="signer_company" maxLength={120} /></label>
          <label className={styles.field}>Time (optional, today)<input type="time" name="signed_time" /></label>
          <label className={styles.field}>Reason, if not signed<textarea name="reason" maxLength={1000} rows={2} /></label>
        </DailyForm>
      </details>}
    </section>

    <section className={styles.panel} aria-label="Photographs">
      <h2>Photographs</h2>
      {photos.length ? <div className={styles.cardList}>{photos.map(photo => <figure key={photo.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/dayworks/photos/${photo.id}`} alt={photo.purpose === "signed_sheet" ? "Signed daywork sheet" : "Daywork photograph"} />
        <figcaption>{photo.purpose === "signed_sheet" ? "Signed sheet" : "The work"} · verified in private storage</figcaption></figure>)}</div>
        : <p>No photographs. They are optional; the daywork is saved without them.</p>}
      {!rejected && <DayworkPhotoUploader daywork={daywork.id} />}
    </section>

    {office && daywork.office_status === "awaiting_review" && <section className={styles.panel} aria-label="Office decision">
      <h2>Office decision</h2>
      {submitted && !owner && <p>You recorded or sent this daywork, so another office user must approve it. You can still ask for more detail or reject it.</p>}
      <DailyForm action={decideDayworkAction} label="Save decision">
        {versioned}{key()}
        <fieldset className={styles.plainFieldset}><legend>Decision</legend>
          {(!submitted || owner) && <label className={styles.checkboxRow}><input type="radio" name="decision" value="approve" defaultChecked />Approve the work</label>}
          <label className={styles.checkboxRow}><input type="radio" name="decision" value="request_detail" defaultChecked={submitted && !owner} />Ask for more detail</label>
          <label className={styles.checkboxRow}><input type="radio" name="decision" value="reject" />Reject</label>
        </fieldset>
        <label className={styles.field}>Note for the supervisor (needed to ask for detail or reject)<textarea name="note" maxLength={1000} rows={2} /></label>
        {submitted && owner && <label className={styles.field}>You submitted this daywork. To approve it yourself, say why (this is logged)<textarea name="override_reason" maxLength={1000} rows={2} /></label>}
        <p className={styles.small}>Approving confirms the work. The client&apos;s authorisation of the cost and the internal charge are recorded separately.</p>
      </DailyForm>
    </section>}

    {(office || records.clientAuthorisations.length > 0) && <section className={styles.panel} aria-label="Client authorisation">
      <h2>Client&apos;s authorisation of the cost</h2>
      {records.clientAuthorisations.length > 0 ? <ul className={styles.plainList}>{records.clientAuthorisations.map(row => <li key={row.id}>
        {row.outcome === "authorised" ? `Authorised by ${row.client_name}` : `Declined by ${row.client_name}: ${row.note}`}{row.reference ? ` · reference ${row.reference}` : ""}
        {row.document_id ? <> · <Link href={`/admin/documents/${row.document_id}`} target="_blank" rel="noopener noreferrer">evidence</Link></> : null}
        <span className={styles.small}> · {dayLabel(row.decided_on)} · recorded by {row.recorded_by_name}</span></li>)}</ul> : <p>Not recorded yet.</p>}
      {office && !rejected && <details className={styles.details}><summary>Record the client&apos;s decision</summary>
        <DailyForm action={clientAuthorisationAction} label="Save the client's decision">
          {ids}{key()}
          <fieldset className={styles.plainFieldset}><legend>The client</legend>
            <label className={styles.checkboxRow}><input type="radio" name="outcome" value="authorised" defaultChecked />Authorised the cost</label>
            <label className={styles.checkboxRow}><input type="radio" name="outcome" value="declined" />Declined the cost</label>
          </fieldset>
          <label className={styles.field}>Who decided for the client<input name="client_name" required maxLength={120} /></label>
          <label className={styles.field}>Date<input type="date" name="decided_on" defaultValue={londonDate()} max={londonDate()} /></label>
          <label className={styles.field}>Instruction reference<input name="reference" maxLength={120} /></label>
          <label className={styles.field}>Document as evidence (optional)<select name="document_id" defaultValue=""><option value="">None</option>
            {((documents.data ?? []) as { id: string; title: string; document_reference: string; revision: number }[]).map(doc =>
              <option key={doc.id} value={doc.id}>{doc.document_reference} rev {doc.revision}: {doc.title}</option>)}</select></label>
          <label className={styles.field}>Note (needed if declined)<textarea name="note" maxLength={1000} rows={2} /></label>
        </DailyForm>
      </details>}
    </section>}

    {money && moneyRecords && <section className={styles.panel} aria-label="Charge">
      <h2>Charge (money access only)</h2>
      {approval ? <p data-charge-approved="">Charge approved internally by {approval.approved_by_name} at {when(approval.approved_at)}
        {approval.owner_override ? ` (owner override: ${approval.override_reason})` : ""}{approval.note ? `. ${approval.note}` : ""}. This is not the client&apos;s acceptance or agreement to pay.</p> : null}
      {!approval && daywork.site_status === "sent" && !rejected && <details className={styles.details} open={daywork.commercial_status === "awaiting_pricing"}>
        <summary>{pricing && pricedLines.length ? "Price it again" : "Price it from the job's rates"}</summary>
        {!rates.length && <p>This job has no daywork rates yet. <Link href={`/admin/contracts/${id}#daywork-rates`}>Add them on the job</Link>.</p>}
        <DailyForm action={priceDayworkAction} label="Price it">
          {versioned}{key()}<input type="hidden" name="line_ids" value={lines.map(line => line.id).join(",")} />
          {lines.map(line => {
            const options = rates.filter(rate => rate.category === lineCategory(line) && rate.unit === line.unit);
            return <label key={line.id} className={styles.field}>{lineSummary(line)}
              <select name={`rate_${line.id}`} defaultValue={suggestions.get(line.id) ?? ""}>
                <option value="">{options.length ? "Choose a rate" : `No ${categoryLabels[lineCategory(line)].toLowerCase()} rate per ${unitLabels[line.unit]} yet`}</option>
                {options.map(rate => <option key={rate.id} value={rate.id}>{rate.item}: {pounds(rate.rate)} per {rate.unit === "m2" ? "m²" : rate.unit}</option>)}
              </select></label>;
          })}
          <p className={styles.small}>Each line keeps the rate it is priced at. Changing a rate later never changes this price.</p>
        </DailyForm>
      </details>}
      {!approval && daywork.office_status === "approved" && daywork.commercial_status === "priced" && <div aria-label="Approve the charge">
        <h3>Approve the charge</h3>
        {submitted && !owner ? <p>You recorded or sent this daywork, so another person with money access must approve its charge.</p>
          : <DailyForm action={approveChargeAction} label="Approve the charge internally">
            {versioned}{key()}
            <label className={styles.field}>Note (optional)<textarea name="note" maxLength={1000} rows={2} /></label>
            {submitted && owner && <label className={styles.field}>You submitted this daywork. Say why you are approving its charge yourself (this is logged)<textarea name="override_reason" maxLength={1000} rows={2} /></label>}
            <p className={styles.small}>This is TileSPEC&apos;s internal approval. It is not the client&apos;s acceptance or agreement to pay.</p>
          </DailyForm>}
      </div>}
      {daywork.commercial_status === "awaiting_pricing" && daywork.office_status === "approved" && <p>Awaiting pricing: the charge can be approved once every line is priced.</p>}
      <p className={styles.small}><Link href={`/admin/contracts/${id}#daywork-rates`}>Daywork rates for this job</Link></p>
    </section>}

    <section className={styles.panel} aria-label="History">
      <h2>History</h2>
      <ol className={styles.plainList}>{events.map(event => <li key={event.id}>
        <strong>{event.actor_id === member.user_id ? "You" : event.actor_name}</strong> {eventLine(event, reference)}
        {(event.action === "request_detail" || event.action === "reject" || event.owner_override) && event.note ? `: ${event.note}` : ""}
        <span className={styles.small}> · {when(event.created_at)}</span></li>)}</ol>
    </section>
    {ask && <Link className={styles.secondaryButton} href={`${base}/messages?about=daywork:${daywork.id}#ask`}>Ask the office about this</Link>}
    <Link className={styles.secondaryButton} href={`${base}/commercial?kind=dayworks`}>All dayworks on this job</Link>
  </>;
}
