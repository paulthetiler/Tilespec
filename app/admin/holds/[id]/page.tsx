import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { holdContextFor, type HoldDocument, type HoldInspection, type HoldRequirementReview } from "@/lib/operations/holds-data";
import { holdPhotoIdsFor, holdScope, holdTypes, holdStatusLabels, type Hold, type HoldEvent, type HoldPhoto } from "@/lib/operations/holds";
import { qualityStatusLabel } from "@/lib/operations/quality";
import { londonDate } from "@/lib/operations/planning";
import { HoldForm } from "@/components/holds/hold-form";
import { HoldPhotoUploader } from "@/components/holds/photo-upload";
import { ConnectionStatus } from "@/components/site/connection-status";
import { transitionHoldAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/snags/snags.module.css";
export const dynamic = "force-dynamic";

function recordedTime(value: unknown) {
  if (typeof value !== "string" || !value) return "Time not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-GB", { timeZone: "Europe/London" }) : value;
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function inspectionLink(contract: string, id: string) {
  return `/admin/supervisor/sites/${contract}/inspections?inspection=${id}#inspection-${id}`;
}
function DocumentLinks({ ids, documents }: { ids: string[]; documents: HoldDocument[] }) {
  return <ul>{[...new Set(ids)].map(id => {
    const document = documents.find(item => item.id === id);
    return <li key={id}><Link href={`/admin/documents/${id}`} target="_blank" rel="noopener noreferrer">{document ? `${document.title} · ${document.document_reference} · revision ${document.revision}` : "Recorded document revision (access checked)"}</Link></li>;
  })}</ul>;
}
function SafetyAcknowledgement({ value }: { value: unknown }) {
  const acknowledgement = object(value);
  if (!acknowledgement) return null;
  return <div><p><strong>Safety authority acknowledgement:</strong> {[acknowledgement.name, acknowledgement.role].filter(item => typeof item === "string" && item).join(" · ")}</p>
    {typeof acknowledgement.reference === "string" && <p>{acknowledgement.reference}</p>}
    <p>Acknowledged {recordedTime(acknowledgement.acknowledged_at)}{acknowledgement.recorded_at ? ` · Recorded ${recordedTime(acknowledgement.recorded_at)}` : ""}</p></div>;
}
function ActionPanel({ hold, action, label, user, photos, purpose, documents, children }: { hold: Hold; action: string; label: string; user: string; photos: HoldPhoto[]; purpose?: HoldPhoto["purpose"]; documents: HoldDocument[]; children?: React.ReactNode }) {
  const ids = purpose ? holdPhotoIdsFor(photos, purpose, hold.correction_cycle, user) : [];
  return <details className={styles.disclosure}><summary>{label}</summary><HoldForm action={transitionHoldAction} label={label} contract={hold.contract_id}>
    <input name="hold_id" type="hidden" value={hold.id} /><input name="request_key" type="hidden" value={randomUUID()} /><input name="version" type="hidden" value={hold.version} /><input name="action" type="hidden" value={action} />{children}<label>Notes / reason<textarea name="note" required minLength={5} maxLength={2000} /></label>
    {purpose && <><h4>Verified {purpose} evidence</h4>{ids.length ? ids.map((id, index) => <label key={id} className={styles.checkboxRow}><input name="photo_ids" type="checkbox" value={id} defaultChecked />Verified photograph {index + 1}</label>) : <p>No new verified photographs for this action. Upload above or attach an appropriate saved document.</p>}<label>Evidence unavailable — documented explanation<textarea name="evidence_explanation" maxLength={2000} /></label>{documents.length > 0 && <details className={styles.details}><summary>Attach saved supporting documents</summary>{documents.map(d => <label key={d.id} className={styles.checkboxRow}><input type="checkbox" name="document_ids" value={d.id} />{d.title} · revision {d.revision}</label>)}</details>}</>}
    {["release", "supersede", "entered_in_error"].includes(action) && <label className={styles.checkboxRow}><input type="checkbox" name="confirm_decision" required />I confirm this decision and its recorded scope. Other restrictions remain applicable.</label>}
  </HoldForm></details>;
}
function RequirementRows({ requirements, contract, documents }: { requirements: HoldRequirementReview; contract: string; documents: HoldDocument[] }) {
  return <>{requirements.requirements?.length > 0 && <ul>{requirements.requirements.map(row => <li key={row.id}><strong>{row.title || "Saved applicability decision"}</strong> · {row.stage} · {row.status.replaceAll("_", " ")}
    <p>{row.basis}</p><p>Applicability record {row.id} · approved {recordedTime(row.created_at)}</p>
    {!!row.approved_document_ids?.length && <><p>Approved specification / manufacturer revisions:</p><DocumentLinks ids={row.approved_document_ids} documents={documents} /></>}
    {row.inspection_id && <p><Link href={inspectionLink(contract, row.inspection_id)}>Review exact saved inspection and evidence</Link>{row.inspection_at ? ` · ${recordedTime(row.inspection_at)}` : ""}</p>}
  </li>)}</ul>}</>;
}
function RequirementReview({ requirements, contract, documents }: { requirements: HoldRequirementReview; contract: string; documents: HoldDocument[] }) {
  return <><p>{requirements.configured === false || requirements.unknown ? "Applicability is not confirmed. This work cannot be represented as released." : requirements.passed === true ? "Applicable mandatory requirements passed in saved records." : "Mandatory requirements must be satisfied before authorised release."}</p>
    {requirements.scopes?.length ? requirements.scopes.map(scope => <details className={styles.details} key={`${scope.work_area_id}:${scope.stage}`}><summary>{scope.location_path.join(" › ")} · {scope.stage}</summary><RequirementRows requirements={scope.requirements} contract={contract} documents={documents} /></details>) : <RequirementRows requirements={requirements} contract={contract} documents={documents} />}
    {!!requirements.blockers?.length && <ul>{requirements.blockers.map((blocker, index) => <li key={index}>{typeof blocker === "string" ? blocker.replaceAll("_", " ") : blocker.status.replaceAll("_", " ")}</li>)}</ul>}</>;
}
function SavedInspections({ inspections, hold, documents }: { inspections: HoldInspection[]; hold: Hold; documents: HoldDocument[] }) {
  return <><h3>Saved inspection results and evidence</h3><p>Review the exact saved result, applicable specification and evidence. Earlier failures remain in the history.</p>
    {inspections.length ? inspections.map(inspection => <details key={inspection.id} className={styles.details}><summary>{inspection.location_path.join(" › ")} · {inspection.title} · {recordedTime(inspection.created_at)} · {inspection.issues_count} issues</summary>
      <p>{inspection.stage} · {inspection.specification_reference} · revision {inspection.specification_revision} · Recorded by {inspection.actor_name}</p>
      {hold.corrected_at && <p>{new Date(inspection.created_at) >= new Date(hold.corrected_at) ? "Saved after the latest recorded corrective work." : "Saved before the latest recorded corrective work."}</p>}
      <ul>{inspection.answers.map((answer, index) => <li key={index}><strong>{answer.item}: {answer.status}</strong>{answer.hold_point ? " · mandatory hold point" : answer.mandatory ? " · mandatory" : ""}{answer.note && <p>{answer.note}</p>}
        {!!answer.document_ids?.length && <DocumentLinks ids={answer.document_ids} documents={documents} />}
        {!!answer.photo_ids?.length && <ul>{answer.photo_ids.map(photo => <li key={photo}><Link href={`/admin/snags/photos/${photo}`} target="_blank" rel="noopener noreferrer">Recorded verified inspection photograph</Link></li>)}</ul>}
      </li>)}</ul><Link href={inspectionLink(hold.contract_id, inspection.id)}>Open this inspection record and linked workforce history</Link>
    </details>) : <p>No saved location inspection results are available in this scope.</p>}</>;
}
function EventEvidence({ event, photos, documents }: { event: HoldEvent; photos: HoldPhoto[]; documents: HoldDocument[] }) {
  const snapshot = object(event.snapshot) || {}, savedHold = object(snapshot.hold) || snapshot;
  const documentsAttached = strings(snapshot.document_ids);
  const attachedPhotos = photos.filter(photo => photo.event_id === event.id && photo.uploaded_at);
  const completedAt = snapshot.completed_at || savedHold.corrected_at;
  const explanation = snapshot.evidence_explanation;
  return <>
    {event.action === "assign" && <><p>Assigned to: {String(savedHold.assigned_team_name || savedHold.assigned_operative_name || "Recorded corrective party")}</p>{typeof savedHold.assignment_action === "string" && <p>Assigned corrective instructions: {savedHold.assignment_action}</p>}{typeof savedHold.target_date === "string" && <p>Recorded target: {savedHold.target_date}</p>}</>}
    {event.action === "submit_correction" && completedAt ? <p>Correction completed: {recordedTime(completedAt)} · submitted by {event.actor_name || "Recorded actor"}{snapshot.submitted_at ? ` at ${recordedTime(snapshot.submitted_at)}` : ""}</p> : null}
    {event.action === "release" && <SafetyAcknowledgement value={savedHold.authority_acknowledgement || snapshot.authority_acknowledgement} />}
    {typeof explanation === "string" && explanation && <p>Evidence explanation: {explanation}</p>}
    {!!documentsAttached.length && <><p>Document revisions attached to this {event.action.replaceAll("_", " ")} decision:</p><DocumentLinks ids={documentsAttached} documents={documents} /></>}
    {!!attachedPhotos.length && <><p>{attachedPhotos.length} verified photographs attached to this decision.</p><ul>{attachedPhotos.map((photo, index) => <li key={photo.id}><Link href={`/admin/holds/photos/${photo.id}`} target="_blank" rel="noopener noreferrer">{photo.purpose} photograph {index + 1} · correction cycle {photo.correction_cycle}</Link></li>)}</ul></>}
  </>;
}
export default async function HoldDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, member } = await requireActor(), context = await holdContextFor(supabase, id);
  if (!context) notFound();
  const { hold, permissions, events, photos, documents } = context;
  const open = ["active", "correction_submitted", "awaiting_release"].includes(hold.status), staff = permissions.supervise || permissions.office;
  const [teams, operatives] = await Promise.all([
    staff && hold.status === "active" ? supabase.from("teams").select("id,name").eq("active", true).order("name") : Promise.resolve({ data: [], error: null }),
    staff && hold.status === "active" ? supabase.from("operatives").select("id,display_name").eq("status", "active").order("display_name") : Promise.resolve({ data: [], error: null }),
  ]);
  [teams, operatives].forEach(result => checkRpc(result.error));
  const panel = (action: string, label: string, children?: React.ReactNode, purpose?: HoldPhoto["purpose"]) => <ActionPanel hold={hold} action={action} label={label} user={member.user_id} photos={photos} documents={documents || []} purpose={purpose}>{children}</ActionPanel>;
  const overlaps = context.overlapping_holds || [], related = context.related_snags || [];
  const snags = related.filter(snag => !["closed", "cancelled", "draft"].includes(snag.snag_status));
  const pastSnags = related.filter(snag => ["closed", "cancelled"].includes(snag.snag_status));
  const requirements = context.requirements, currentStatus = context.release_status;
  const hasAssignment = !!(hold.assigned_team_id || hold.assigned_operative_id);
  const releaseEvent = events.findLast(event => event.action === "release");
  return <><ConnectionStatus /><p><Link href={`/admin/holds?contract_id=${hold.contract_id}`}>← Work holds and releases</Link> · <Link href={`/admin/supervisor/sites/${hold.contract_id}`}>Site dashboard</Link></p><h1 className={styles.title}>{holdTypes[hold.hold_type]}</h1>
    {currentStatus && <section className={!currentStatus.authorised && currentStatus.status === "stopped_safety" ? css.critical : styles.panel} aria-label="Current work status"><h2>Current work status across this recorded scope</h2><p><strong>{qualityStatusLabel(currentStatus.status)}</strong></p>{currentStatus.reason && <p>{currentStatus.reason}</p>}{!currentStatus.authorised && <p>This scope has no current permission to proceed.</p>}</section>}
    <section className={hold.hold_type === "safety" && open ? css.critical : styles.panel} aria-label="Hold scope"><h2>{holdStatusLabels[hold.status]}</h2><strong>{holdScope(hold)}</strong><p>{hold.contract_reference} · {hold.contract_name}</p><p>Category: {hold.category} · Severity: {hold.severity}</p><p>{hold.reason}</p><p><strong>Original required action:</strong> {hold.required_action}</p><p>Raised {recordedTime(hold.created_at)} by {hold.raised_name || events.find(event => event.action === "raise")?.actor_name || "Recorded raiser"}</p>
      {hold.evidence_explanation && <p>Original evidence explanation: {hold.evidence_explanation}</p>}
      {!!hold.original_document_ids?.length && <><h3>Original attached document revisions</h3><DocumentLinks ids={hold.original_document_ids} documents={documents || []} /></>}
      {hold.source_snag_id && <Link className={styles.secondaryButton} href={`/admin/snags/${hold.source_snag_id}`}>Original snag</Link>}
      {hold.source_inspection_id && <Link className={styles.secondaryButton} href={inspectionLink(hold.contract_id, hold.source_inspection_id)}>Original location inspection</Link>}
      {hold.source_morning_inspection_id && <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${hold.contract_id}/checks?inspection=${hold.source_morning_inspection_id}#morning-${hold.source_morning_inspection_id}`}>Original morning readiness history</Link>}
    </section>
    {hold.hold_type === "safety" && <p>Follow the principal contractor’s statutory safety procedures and designated site-safety authority. An internal TileSPEC decision does not override their controls. Release requires their acknowledgement or authorisation to be recorded.</p>}
    <section className={styles.panel} aria-label="Corrective assignment"><h2>Corrective action assignment</h2>{hasAssignment ? <><p><strong>{hold.assigned_team_name || hold.assigned_operative_name || "Recorded corrective party"}</strong></p><p>{hold.assignment_action || "Review the recorded assignment event for corrective instructions."}</p>{hold.target_date && <p>Target: {hold.target_date}</p>}{hold.corrected_at && <p>Latest correction completed: {recordedTime(hold.corrected_at)}</p>}</> : <p>No corrective team or operative has been assigned. Assign corrective work before submitting completion evidence.</p>}</section>
    {staff && open && <><HoldPhotoUploader hold={id} purpose="original" />{panel("add_original_evidence", "Attach original evidence", undefined, "original")}</>}
    {staff && hold.status === "active" && panel("assign", "Assign corrective action", <><label>Correction team<select name="team_id" defaultValue=""><option value="">No team — choose named operative below</option>{teams.data?.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Named operative (instead of team)<select name="operative_id" defaultValue=""><option value="">No named operative</option>{operatives.data?.map(operative => <option key={operative.id} value={operative.id}>{operative.display_name}</option>)}</select></label><label>Corrective instructions<textarea name="required_action" required maxLength={2000} defaultValue={hold.assignment_action || hold.required_action} /></label><label>Target date<input type="date" name="target_date" required defaultValue={hold.target_date || londonDate()} /></label></>)}
    {permissions.correct && hasAssignment && hold.status === "active" && <><HoldPhotoUploader key={`correction-${hold.correction_cycle}`} hold={id} purpose="correction" />{panel("submit_correction", "Submit corrective action", <label>Work completed at (ISO date and time)<input name="completed_at" required defaultValue={new Date().toISOString()} /><small>Change this to the actual completion time. The submission time is recorded separately.</small></label>, "correction")}</>}
    {permissions.correct && hold.status === "correction_submitted" && panel("request_release", "Request release review")}
    <section className={styles.panel} aria-label="Release review"><h2>Before authorising release</h2>

      <RequirementReview requirements={requirements} contract={hold.contract_id} documents={documents || []} />
      <p><Link className={styles.button} href={`/admin/supervisor/sites/${hold.contract_id}/inspections${hold.work_area_id ? `?location=${hold.work_area_id}` : ""}`}>Review saved inspections</Link></p>
      {staff && <SavedInspections inspections={context.inspections || []} hold={hold} documents={documents || []} />}
      <h3>Other holds covering this work</h3>{overlaps.length ? overlaps.map(other => <p key={other.id}><Link href={`/admin/holds/${other.id}`}>{holdTypes[other.hold_type]} · {holdScope(other)}</Link> · {holdStatusLabels[other.status]} · {other.reason}</p>) : <p>No other saved active holds cover this scope.</p>}
      <h3>Remaining related snags</h3>{snags.length ? snags.map(snag => <p key={snag.id}><Link href={`/admin/snags/${snag.id}`}>{snag.description}</Link> · {snag.severity} · {snag.snag_status}</p>) : <p>No remaining related saved snags.</p>}
      {!!pastSnags.length && <details className={styles.details}><summary>Resolved related snag history</summary>{pastSnags.map(snag => <p key={snag.id}><Link href={`/admin/snags/${snag.id}`}>{snag.description}</Link> · {snag.snag_status}</p>)}</details>}
      <details className={styles.details}><summary>Available operational specification and supporting documents</summary><p>These verified documents are available for this scope. A document is attached to a decision only when listed in that saved event or its original evidence.</p>{documents?.length ? <DocumentLinks ids={documents.map(document => document.id)} documents={documents} /> : <p>No verified operational documents are available in this scope.</p>}</details>
      {hold.status === "awaiting_release" && permissions.office && <><HoldPhotoUploader hold={id} purpose="release" />{permissions.release ? panel("release", "RELEASE AFFECTED WORK", hold.hold_type === "safety" ? <><label>Principal contractor / safety authority name<input name="authority_name" required maxLength={160} /></label><label>Authority role<input name="authority_role" required maxLength={160} /></label><label>Acknowledgement / authorisation reference<textarea name="authority_reference" required maxLength={2000} /></label><label>Acknowledged at (ISO date and time)<input name="authority_acknowledged_at" required defaultValue={new Date().toISOString()} /></label><p>Record the authority’s actual acknowledgement, including its conditions. Confirm that their external safety controls permit the specified activity.</p></> : undefined, "release") : <p>Release is unavailable to this actor. A different authorised office reviewer must independently check the correction and mandatory requirements.</p>}{panel("reject_release", "REJECT RELEASE — MORE WORK REQUIRED", undefined, "release")}</>}
      {hold.status === "awaiting_release" && !permissions.office && <p>The hold remains active until an independently authorised office reviewer records the release decision.</p>}
      {hold.status === "released" && <><p>This hold has a saved release decision by {releaseEvent?.actor_name || "the recorded office reviewer"} at {recordedTime(hold.released_at)}. Current work status above accounts for other restrictions and current mandatory requirements.</p><SafetyAcknowledgement value={hold.authority_acknowledgement} /></>}
    </section>
    {staff && open && <section className={styles.panel}><h2>Escalation and record corrections</h2>{panel("escalate", "Escalate to office")}{permissions.office && <>{panel("supersede", "Supersede with another hold", <label>Saved successor hold ID<input name="successor_id" required placeholder="The successor must cover this hold’s full scope" /></label>)}{panel("entered_in_error", "Entered in error — preserve record")}</>}</section>}
    <section className={styles.panel}><h2>Saved hold evidence</h2><div className={css.photoGrid}>{photos.map(photo => <figure key={photo.id}>{photo.uploaded_at ? <><img src={`/admin/holds/photos/${photo.id}`} alt={`${photo.purpose} hold evidence`} /><a href={`/admin/holds/photos/${photo.id}`} target="_blank" rel="noopener noreferrer">Review full-size photograph</a></> : <p>Pending reservation — photograph not verified.</p>}<figcaption>{photo.purpose} · correction cycle {photo.correction_cycle}{photo.uploaded_at ? " · Verified in private storage" : " · Not saved evidence"}{photo.uploaded_at && photo.event_id === null && " · Awaiting attachment to a decision"}</figcaption></figure>)}</div>{!photos.length && <p>No saved photographs yet. Photographs alone do not change the recorded hold or work status.</p>}</section>
    <section className={styles.panel}><h2>Permanent hold history</h2><ol className={css.history}>{events.map(event => <li key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {recordedTime(event.created_at)} · {event.actor_name || "Recorded actor"}<p>{event.previous_status ? `${holdStatusLabels[event.previous_status]} → ` : ""}{holdStatusLabels[event.new_status]}</p><p>{event.note}</p><EventEvidence event={event} photos={photos} documents={documents || []} /></li>)}</ol></section>
  </>;
}
