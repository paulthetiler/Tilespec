import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireSite } from "../../../site-access";
import { createInspectionTemplateAction, recordLocationInspectionAction } from "../../../inspection-actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { applicableChecks, currentTemplates, type InspectionTemplate, type LocationInspection } from "@/lib/operations/inspections";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { installationStages } from "@/lib/operations/types";
import styles from "../../../../admin.module.css";
export const dynamic = "force-dynamic";

type WorkforceSnapshot = { team_name: string | null; company_name: string | null; allocation: { work_date: string; started_at: string; ended_at: string | null; lead_operative_id: string | null }; attendance: { id: string; operative_id: string; display_name: string; joined_at: string; left_at: string | null }[] };
type WorkPeriod = { actual_allocation_id: string; team_name: string | null; contractor_name: string | null; stage: string; work_date: string; started_at: string; ended_at: string | null; operative_names: string[]; location_relation: string };
export default async function LocationInspections({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ location?: string; template?: string; page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const locations = await locationsFor(supabase, id);
  const index = indexLocations(locations);
  const location = locations.find(item => item.id === query.location);
  const page = /^\d+$/.test(query.page || "") ? Math.min(Number(query.page), 10000) : 0;
  let historyQuery = supabase.from("location_inspections").select("*").eq("contract_id", id);
  if (location) historyQuery = historyQuery.eq("work_area_id", location.id);
  const [templateResult, recordsResult] = await Promise.all([
    supabase.from("location_inspection_templates").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    historyQuery.order("created_at", { ascending: false }).order("id").range(page * 50, page * 50 + 50),
  ]);
  // Fail closed on missing migration, rather than presenting fictitious records.
  checkDatabase(templateResult.error); checkDatabase(recordsResult.error);
  const templates = (templateResult.data || []) as InspectionTemplate[];
  const hasMore = (recordsResult.data || []).length > 50;
  const records = (recordsResult.data || []).slice(0, 50) as LocationInspection[];
  const available = location ? currentTemplates(templates, location.path_ids) : [];
  const selected = available.find(item => item.id === query.template);
  const workResult = location ? await supabase.rpc("location_work_history", { p_area: location.id }) : { data: [], error: null };
  checkDatabase(workResult.error);
  const periods = ((workResult.data || []) as WorkPeriod[]).filter(item => item.stage === selected?.stage && item.started_at <= new Date().toISOString());
  const recordIds = records.map(item => item.id);
  const links = recordIds.length ? await supabase.from("location_inspection_allocations").select("inspection_id,actual_allocation_id,workforce_snapshot").in("inspection_id", recordIds) : { data: [], error: null };
  checkDatabase(links.error);
  const base = `/admin/supervisor/sites/${id}/inspections`;
  return <>
    <h2>Location inspections</h2>
    <p>Choose the location and the office&apos;s specification checklist. Saved answers and work-period links are permanent observations. They do not grant work release or establish responsibility for a defect. Issue answers remain in this history. Choose Create linked snag to record a defect explicitly; formal QA holds are Phase 3C.</p>
    <form className={styles.form} method="get"><label>Location<select name="location" defaultValue={location?.id || ""} required>
      <option value="">Choose location</option>{orderLocations(locations).map(item => <option key={item.id} value={item.id}>{locationPath(index, item.id)}{item.archived_at ? " (archived — history only)" : ""}</option>)}
    </select></label><button className={styles.button}>Open location</button></form>
    {location && <section className={styles.panel}><h3>{locationPath(index, location.id)}</h3>
      <ul>{available.map(template => <li key={template.id}><Link href={`${base}?location=${location.id}&template=${template.id}`}>
        {template.title} · {template.stage} · {template.specification_reference} rev {template.specification_revision}</Link></li>)}</ul>
      {!available.length && <p>No current template applies. Ask the office to record the specification and checklist.</p>}
      {selected && !location.archived_at && <OperationsForm key={`${location.id}-${selected.id}`} action={recordLocationInspectionAction} submitLabel="Save inspection">
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="work_area_id" value={location.id} /><input type="hidden" name="template_id" value={selected.id} />
        <input type="hidden" name="check_count" value={applicableChecks(selected).length} />
        <h3>{selected.title}</h3><p>{selected.specification_reference} · Revision {selected.specification_revision} · {selected.wet_area ? "Wet-area checks apply" : "Wet-area checks do not apply"}</p>
        {applicableChecks(selected).map((check, i) => <div key={i}><label>{check.label}<select name={`status_${i}`} required defaultValue=""><option value="">Choose answer</option><option value="pass">Pass</option><option value="issue">Issue</option><option value="na">N/A</option></select></label>
          <label>Reason / observation for check {i + 1} (required for Issue or N/A)<textarea name={`note_${i}`} maxLength={2000} /></label></div>)}
        <h4>Actual work to link</h4><p>Recorded attendance at this location, within it or in a containing location, for this stage. Plans do not prove attendance. Leave empty if attribution is unknown.</p>
        {periods.map(period => <label className={styles.checkboxRow} key={period.actual_allocation_id}><input type="checkbox" name="allocation_ids" value={period.actual_allocation_id} />
          {period.team_name || "No team"} · {period.contractor_name || "Company not recorded"} · {period.work_date} · {period.started_at} to {period.ended_at || "open"} · {period.location_relation} · {period.operative_names.join(", ")}</label>)}
        {!periods.length && <p>No matching actual work recorded.</p>}
      </OperationsForm>}
      {(["owner", "contracts_manager"] as string[]).includes(member.role) && !location.archived_at && <details className={styles.details}><summary>Create or revise a location template</summary>
        <OperationsForm action={createInspectionTemplateAction} submitLabel="Save template revision">
          <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="work_area_id" value={location.id} />
          <label>Revision of (optional)<select name="supersedes_id" defaultValue=""><option value="">New template</option>{available.filter(t => t.work_area_id === location.id).map(t => <option key={t.id} value={t.id}>{t.title} · {t.stage} · rev {t.specification_revision}</option>)}</select></label>
          <label>Title<input name="title" required maxLength={160} /></label>
          <label>Stage<select name="stage">{installationStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></label>
          <label>Specification reference<input name="specification_reference" required maxLength={160} /></label>
          <label>Specification revision<input name="specification_revision" required maxLength={80} /></label>
          <label className={styles.checkboxRow}><input type="checkbox" name="wet_area" />Specification requires wet-area checks at this location</label>
          <label>Checklist (one check per line; prefix conditional checks with [wet])<textarea name="checklist" required maxLength={26000} /></label>
          <p>This template applies here and to descendant locations. Recording a specification reference does not approve it.</p>
        </OperationsForm></details>}
    </section>}
    <section className={styles.panel}><h3>Saved inspection history</h3>
      {records.filter(record => !location || record.work_area_id === location.id).map(record => {
        const template = templates.find(item => item.id === record.template_id);
        const allocations = (links.data || []).filter(link => link.inspection_id === record.id);
        return <details className={styles.details} key={record.id}><summary>{record.location_path.join(" › ")} · {template?.title} · {record.created_at} · {record.issues_count} issues</summary>
          <p>Record {record.id} · Recorded by {record.actor_name} · {template?.specification_reference} rev {template?.specification_revision}</p>
          <ul>{record.answers.map((answer, i) => <li key={i}>{answer.item}: {answer.status}{answer.note && ` — ${answer.note}`}</li>)}</ul>
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
          <Link href={`/admin/supervisor/sites/${id}/history`}>Review workforce history</Link>{" · "}<Link href={`/admin/snags?contract_id=${id}`}>Review site snags and evidence</Link>
        </details>;
      })}
      <div className={styles.rowActions}>
        {page > 0 && <Link className={styles.secondaryButton} href={`${base}?${location ? `location=${location.id}&` : ""}page=${page - 1}`}>Newer inspections</Link>}
        {hasMore && <Link className={styles.secondaryButton} href={`${base}?${location ? `location=${location.id}&` : ""}page=${page + 1}`}>Earlier inspections</Link>}
      </div>
      {!records.length && <p>No location inspections recorded. Earlier morning checks remain in the existing register.</p>}
    </section>
  </>;
}
