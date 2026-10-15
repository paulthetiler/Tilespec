import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireSite } from "../../../site-access";
import { createInspectionTemplateAction, recordLocationInspectionAction, configureInspectionRequirementAction } from "../../../inspection-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { WorkmanshipForm } from "@/components/operations/workmanship-form";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { applicableChecks, everydayWorkmanshipChecks, inspectionHasBlockingFailure, currentTemplates, type InspectionTemplate, type LocationInspection, type InspectionRequirement, type RequirementStatus } from "@/lib/operations/inspections";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { installationStages, installationStageLabels, type InstallationStage } from "@/lib/operations/types";
import styles from "../../../../admin.module.css";
export const dynamic = "force-dynamic";

type WorkforceSnapshot = { team_name: string | null; company_name: string | null; allocation: { work_date: string; started_at: string; ended_at: string | null; lead_operative_id: string | null }; attendance: { id: string; operative_id: string; display_name: string; joined_at: string; left_at: string | null }[] };
type WorkPeriod = { actual_allocation_id: string; team_name: string | null; contractor_name: string | null; stage: string; work_date: string; started_at: string; ended_at: string | null; operative_names: string[]; location_relation: string };
export default async function LocationInspections({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ location?: string; area?: string; template?: string; page?: string; stage?: string; inspection?: string; package?: string; qa_request?: string; request_id?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const locations = await locationsFor(supabase, id);
  const index = indexLocations(locations);
  const location = locations.find(item => item.id === (query.location || query.area));
  const page = /^\d+$/.test(query.page || "") ? Math.min(Number(query.page), 10000) : 0;
  const selectedInspection = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.inspection || "") ? query.inspection : undefined;
  let historyQuery = supabase.from("location_inspections").select("*").eq("contract_id", id);
  if (location) historyQuery = historyQuery.eq("work_area_id", location.id);
  if (selectedInspection) historyQuery = historyQuery.eq("id", selectedInspection);
  const [templateResult, recordsResult, requirementResult, documentResult, packageResult] = await Promise.all([
    supabase.from("location_inspection_templates").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    historyQuery.order("created_at", { ascending: false }).order("id").range(selectedInspection ? 0 : page * 50, selectedInspection ? 0 : page * 50 + 50),
    supabase.from("location_inspection_requirements").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabase.from("document_revisions").select("id,title,document_reference,revision,work_area_id").eq("contract_id", id).eq("classification", "operational").not("uploaded_at", "is", null).order("created_at", { ascending: false }),
    supabase.from("work_packages").select("id,name,work_area_id").eq("contract_id", id),
  ]);
  // Fail closed on missing migration, rather than presenting fictitious records.
  [templateResult, recordsResult, requirementResult, documentResult, packageResult].forEach(result => checkDatabase(result.error));
  const templates = (templateResult.data || []) as InspectionTemplate[];
  const hasMore = (recordsResult.data || []).length > 50;
  const records = (recordsResult.data || []).slice(0, 50) as LocationInspection[];
  const activity = (installationStages as readonly string[]).includes(query.stage || "") ? query.stage : undefined;
  const available = location ? currentTemplates(templates, location.path_ids).filter(item => !activity || item.stage === activity) : [];
  const selected = available.find(item => item.id === query.template) || (available.length === 1 ? available[0] : undefined);
  const requirements = (requirementResult.data || []) as InspectionRequirement[];
  const revisedRequirements = new Set(requirements.map(item => item.supersedes_id));
  const currentRequirements = location ? requirements.filter(item => location.path_ids.includes(item.work_area_id) && !revisedRequirements.has(item.id)) : [];
  const documents = (documentResult.data || []).filter(doc => !doc.work_area_id || location?.path_ids.includes(doc.work_area_id));
  const packages = (packageResult.data || []).filter(item => location?.path_ids.includes(item.work_area_id));
  const selectedPackage = packages.find(item => item.id === query.package);
  const requestId = query.qa_request || query.request_id;
  const requestHref = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || "") ? `/admin/supervisor/sites/${id}/tasks/${requestId}` : undefined;
  const statusResult = location && selected ? await supabase.rpc("inspection_requirements", { p_contract: id, p_area: location.id, p_package: selectedPackage?.id || null, p_stage: selected.stage }) : { data: null, error: null };
  checkDatabase(statusResult.error);
  const requirementStatus = statusResult.data as RequirementStatus | null;
  const issuesResult = location && selected ? await supabase.from("supervisor_issues").select("id,repair_cycle").eq("contract_id", id).eq("work_area_id", location.id).eq("stage", selected.stage).not("snag_status", "is", null).not("snag_status", "in", "(draft,cancelled)") : { data: [], error: null };
  checkDatabase(issuesResult.error);
  const issueIds = (issuesResult.data || []).map(item => item.id);
  const photosResult = issueIds.length ? await supabase.from("supervisor_issue_photos").select("id,issue_id,purpose,created_at,repair_cycle").in("issue_id", issueIds).not("uploaded_at", "is", null).not("event_id", "is", null).order("created_at", { ascending: false }) : { data: [], error: null };
  checkDatabase(photosResult.error);
  const photos = (photosResult.data || []).filter(photo => photo.purpose === "original" || photo.repair_cycle === (issuesResult.data || []).find(issue => issue.id === photo.issue_id)?.repair_cycle);
  const workResult = location ? await supabase.rpc("location_work_history", { p_area: location.id }) : { data: [], error: null };
  checkDatabase(workResult.error);
  const periods = ((workResult.data || []) as WorkPeriod[]).filter(item => item.stage === selected?.stage && item.started_at <= new Date().toISOString());
  const recordIds = records.map(item => item.id);
  const links = recordIds.length ? await supabase.from("location_inspection_allocations").select("inspection_id,actual_allocation_id,workforce_snapshot").in("inspection_id", recordIds) : { data: [], error: null };
  checkDatabase(links.error);
  const base = `/admin/supervisor/sites/${id}/inspections`;
  return <>
    <h2>Check workmanship</h2>
    <p>Choose where you are checking, then record what you find.</p>
    <form className={styles.form} method="get"><label>Location<select name="location" defaultValue={location?.id || ""} required>
      <option value="">Choose location</option>{orderLocations(locations).map(item => <option key={item.id} value={item.id}>{locationPath(index, item.id)}{item.archived_at ? " (archived — history only)" : ""}</option>)}
    </select></label>{activity && <input type="hidden" name="stage" value={activity} />}{requestHref && <input type="hidden" name="qa_request" value={requestId} />}{selectedPackage && <input type="hidden" name="package" value={selectedPackage.id} />}<button className={styles.bigButton}>CHECK WORK</button></form>
    {location && <section className={styles.panel}><h3>{locationPath(index, location.id)}</h3>
      {available.length > 1 && <div className={styles.rowActions}>{available.map(template => <Link className={selected?.id === template.id ? styles.button : styles.secondaryButton} key={template.id} href={`${base}?location=${location.id}&template=${template.id}${activity ? `&stage=${activity}` : ""}${requestHref ? `&qa_request=${requestId}` : ""}${selectedPackage ? `&package=${selectedPackage.id}` : ""}`}>
        {template.title} · {installationStageLabels[template.stage as InstallationStage]}</Link>)}</div>}
      {!available.length && <p>The office has not published checks for this location{activity ? " and activity" : ""}. Ask the office for the correct checklist. You can still raise a snag or stop unsafe work.</p>}
      {requirementStatus && (requirementStatus.unknown || requirementStatus.failed || !requirementStatus.passed) && <p role="status"><strong>{requirementStatus.unknown ? "The office still needs to confirm the required checks." : requirementStatus.failed ? "A required check has failed. Affected work remains blocked." : "Required checks are still outstanding."}</strong></p>}
      {selected && !location.archived_at && <><h3>{selected.title}</h3><p>{installationStageLabels[selected.stage as InstallationStage]}. A saved result does not lift a stop on work.</p><WorkmanshipForm key={`${location.id}-${selected.id}-${selectedPackage?.id || ""}`} action={recordLocationInspectionAction} checks={applicableChecks(selected)} nextHref={requestHref} siteHref={`/admin/supervisor/sites/${id}`} evidence={applicableChecks(selected).map((_, i) => <fieldset key={i}><legend>Supporting evidence for check {i + 1}</legend>
            {documents.map(doc => <label className={styles.checkboxRow} key={doc.id}><input type="checkbox" name={`document_ids_${i}`} value={doc.id} />{doc.title} · <Link href={`/admin/documents/${doc.id}`}>View</Link></label>)}
            {photos.map(photo => <label className={styles.checkboxRow} key={photo.id}><input type="checkbox" name={`photo_ids_${i}`} value={photo.id} />Site photograph · <Link href={`/admin/snags/photos/${photo.id}`}>View</Link></label>)}
            {!documents.length && !photos.length && <p>No supporting evidence is available yet. Raise a photographed snag or ask the office to upload the relevant document. You can record an issue now.</p>}
          </fieldset>)}>
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="work_area_id" value={location.id} /><input type="hidden" name="template_id" value={selected.id} />
        <input type="hidden" name="check_count" value={applicableChecks(selected).length} />
        {packages.length > 0 && <label>Which work?<select name="work_package_id" defaultValue={selectedPackage?.id || ""}><option value="">All work at this location</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <details className={styles.details}><summary>Who did this work? (optional)</summary><p>Link the site&apos;s existing workforce record if known. This records who was present and does not assign blame.</p>
        {periods.map(period => <label className={styles.checkboxRow} key={period.actual_allocation_id}><input type="checkbox" name="allocation_ids" value={period.actual_allocation_id} />
          {period.team_name || "No team"} · {period.contractor_name || "Company not recorded"} · {period.work_date} · {period.started_at} to {period.ended_at || "open"} · {period.location_relation} · {period.operative_names.join(", ")}</label>)}
        {!periods.length && <p>No matching actual work recorded.</p>}
        </details><details className={styles.details}><summary>Approved checklist details</summary><p>{selected.specification_reference} · Revision {selected.specification_revision} · {selected.wet_area ? "Wet-area checks apply" : "Wet-area checks do not apply"}</p></details>
      </WorkmanshipForm></>}
      {(["owner", "contracts_manager"] as string[]).includes(member.role) && !location.archived_at && <details className={styles.details}><summary>Create or revise a location template</summary>
        <OperationsForm action={createInspectionTemplateAction} submitLabel="Save template revision">
          <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="work_area_id" value={location.id} />
          <label>Revision of (optional)<select name="supersedes_id" defaultValue=""><option value="">New template</option>{available.filter(t => t.work_area_id === location.id).map(t => <option key={t.id} value={t.id}>{t.title} · {t.stage} · rev {t.specification_revision}</option>)}</select></label>
          <label>Title<input name="title" required maxLength={160} /></label>
          <label>Stage<select name="stage" defaultValue="installation">{installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
          <label>Specification reference<input name="specification_reference" required maxLength={160} /></label>
          <label>Specification revision<input name="specification_revision" required maxLength={80} /></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="wet_area" />Specification requires wet-area checks at this location</label>
          <label>Checklist (one check per line; optional prefixes [wet], [mandatory], [hold], [evidence])<textarea name="checklist" required maxLength={26000} defaultValue={everydayWorkmanshipChecks.join("\n")} /></label>
          <p>The everyday workmanship starter is shown above. Tailor it to the selected location, activity and approved installation system before publishing. Hollow-sounding floor tiles need investigation; the checklist does not invent acceptance tolerances.</p>
          <p>Example: [hold] [evidence] Waterproofing test meets approved system requirements. Hold points require Pass; N/A does not release work. Use project requirements, without invented tolerances. This template applies here and to descendants. Configure and approve applicability separately below.</p>
        </OperationsForm></details>}
      {(["owner", "contracts_manager"] as string[]).includes(member.role) && !location.archived_at && <details className={styles.details}><summary>Configure mandatory inspection applicability</summary>
        <OperationsForm action={configureInspectionRequirementAction} submitLabel="Approve and save applicability revision">
          <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="work_area_id" value={location.id} />
          <label>Revision of<select name="supersedes_id" defaultValue=""><option value="">New applicability decision</option>{currentRequirements.filter(item => item.work_area_id === location.id).map(item => <option key={item.id} value={item.id}>{item.stage} · {item.applicability} · {item.created_at}</option>)}</select></label>
          <label>Affected activity<select name="stage" defaultValue={selected?.stage || "preparation"}>{installationStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></label>
          <label>Work package<select name="work_package_id" defaultValue=""><option value="">All work packages at this branch</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Applicability<select name="applicability"><option value="required">Mandatory inspection required</option><option value="not_required">No mandatory inspection required by the approved documents</option></select></label>
          <label>Current mandatory template (required when applicable)<select name="template_id" defaultValue={selected?.id || ""}><option value="">No template / not required</option>{available.map(item => <option key={item.id} value={item.id}>{item.title} · {item.stage} · rev {item.specification_revision}</option>)}</select></label>
          <fieldset><legend>Approve exact specification / manufacturer document revisions</legend>{documents.map(doc => <label className={styles.checkboxRow} key={doc.id}><input type="checkbox" name="approved_document_ids" value={doc.id} />{doc.title} · {doc.document_reference} rev {doc.revision} · <Link href={`/admin/documents/${doc.id}`}>View</Link></label>)}</fieldset>
          {!documents.length && <p>Upload a verified operational specification or manufacturer document through site documents before configuring applicability.</p>}
          <label>Approval basis and applicable evidence requirements<textarea name="basis" required minLength={5} maxLength={2000} /></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="approve_specification" required />I approve the selected revisions as the basis for this location branch and activity.</label>
          <p>Unknown applicability never grants release. Ancestor mandatory requirements remain in force; a narrower not-required decision cannot clear them. Revising a template requires a new applicability decision and new inspection.</p>
        </OperationsForm>
      </details>}
      {currentRequirements.length > 0 && <details className={styles.details}><summary>Current office applicability decisions</summary>{currentRequirements.map(item => <div key={item.id}><p><strong>{item.stage} · {item.applicability}</strong> · {locationPath(index, item.work_area_id)} · {item.work_package_id ? packages.find(p => p.id === item.work_package_id)?.name || "Specified work package" : "All work packages"}</p><p>{item.basis} · approved {item.created_at}</p>{item.approved_document_ids.map(doc => <Link key={doc} href={`/admin/documents/${doc}`}>Approved document revision · </Link>)}</div>)}</details>}
    </section>}
    <details className={styles.details} open={!!selectedInspection || page > 0}><summary>Saved inspection history</summary><section className={styles.panel}>
      {selectedInspection && <p><Link href={`${base}${location ? `?location=${location.id}` : ""}`}>View all inspection history for this location</Link></p>}
      {records.filter(record => !location || record.work_area_id === location.id).map(record => {
        const template = templates.find(item => item.id === record.template_id);
        const allocations = (links.data || []).filter(link => link.inspection_id === record.id);
        return <details className={styles.details} id={`inspection-${record.id}`} open={record.id === selectedInspection} key={record.id}><summary>{record.location_path.join(" › ")} · {template?.title} · {record.created_at} · {record.issues_count} issues</summary>
          <p>Record {record.id} · Recorded by {record.actor_name} · {template?.specification_reference} rev {template?.specification_revision}</p>
          <ul>{record.answers.map((answer, i) => <li key={i}>{answer.item}: {answer.status}{answer.hold_point ? " · mandatory hold point" : answer.mandatory ? " · mandatory" : ""}{answer.note && ` — ${answer.note}`}
            {answer.document_ids?.map(doc => <span key={doc}> · <Link href={`/admin/documents/${doc}`}>Recorded document evidence</Link></span>)}
            {answer.photo_ids?.map(photo => <span key={photo}> · <Link href={`/admin/snags/photos/${photo}`}>Recorded photograph evidence</Link></span>)}
          </li>)}</ul>
          <p>{allocations.length} linked actual work periods. These links record presence, not blame.</p>
          {allocations.map(link => {
            const snapshot = link.workforce_snapshot as WorkforceSnapshot;
            return <details className={styles.details} key={link.actual_allocation_id}><summary>{snapshot.team_name || "No team"} · {snapshot.company_name || "Company not recorded"} · {snapshot.allocation.work_date}</summary>
              <p>Work started {snapshot.allocation.started_at}; {snapshot.allocation.ended_at ? `finished ${snapshot.allocation.ended_at}` : "still open when inspected"}.</p>
              <ul>{snapshot.attendance.map(person => <li key={person.id}>{person.display_name}{snapshot.allocation.lead_operative_id === person.operative_id ? " (acting lead)" : ""} · arrived {person.joined_at}{person.left_at ? ` · left ${person.left_at}` : ""}</li>)}</ul>
              <p>Attendance known when this inspection was saved. Review workforce history for later departures or corrections.</p>
            </details>;
          })}
          {record.issues_count>0&&<p><Link className={styles.button} href={`/admin/snags/new?contract=${id}&inspection=${record.id}`}>Create linked snag</Link></p>}
          {inspectionHasBlockingFailure(record)&&<p><Link className={styles.button} href={`/admin/holds/new?contract=${id}&inspection=${record.id}`}>Stop affected work — linked hold</Link></p>}
          <Link href={`/admin/supervisor/sites/${id}/history`}>Review workforce history</Link>{" · "}<Link href={`/admin/snags?contract_id=${id}`}>Review site snags and evidence</Link>
        </details>;
      })}
      <div className={styles.rowActions}>
        {!selectedInspection && page > 0 && <Link className={styles.secondaryButton} href={`${base}?${location ? `location=${location.id}&` : ""}page=${page - 1}`}>Newer inspections</Link>}
        {hasMore && <Link className={styles.secondaryButton} href={`${base}?${location ? `location=${location.id}&` : ""}page=${page + 1}`}>Earlier inspections</Link>}
      </div>
      {!records.length && <p>No location inspections recorded. Earlier morning checks remain in the existing register.</p>}
    </section></details>
  </>;
}
