import Link from "next/link";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { snagContextFor } from "@/lib/operations/snags-data";
import { conversationsAvailable } from "@/lib/operations/daily-data";
import { statusLabels, responsibilityLabels, photoIdsFor, isSnagOverdue, type Snag, type SnagPhoto } from "@/lib/operations/snags";
import type { WorkHistoryEntry } from "@/lib/operations/types";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { transitionSnagAction } from "../actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { SnagPhotoUploader } from "@/components/snags/photo-upload";
import { ConnectionStatus } from "@/components/site/connection-status";
import IssueQueue from "../../supervisor/inspections/issue-queue";
import styles from "../../admin.module.css";
import css from "@/components/snags/snags.module.css";
export const dynamic="force-dynamic";
function ActionPanel({snag,action,label,children,photos=[],purpose,userId,defaultNote=""}:{snag:Snag;action:string;label:string;children?:React.ReactNode;photos?:SnagPhoto[];purpose?:NonNullable<SnagPhoto["purpose"]>;userId:string;defaultNote?:string}) {
 const ids=purpose?photoIdsFor(photos,purpose,snag.repair_cycle||0,userId):[];
 return <details className={styles.disclosure}><summary>{label}</summary><OperationsForm action={transitionSnagAction} submitLabel={label}>
  <input type="hidden" name="issue_id" value={snag.id}/><input type="hidden" name="request_key" value={randomUUID()}/><input type="hidden" name="version" value={snag.version||1}/><input type="hidden" name="action" value={action}/>
  {children}
  <label>Notes / reason<textarea name="note" required minLength={5} maxLength={2000} defaultValue={defaultNote}/></label>
  {purpose&&<><h4>{purpose} evidence to attach to this action</h4>{ids.length?ids.map((id,index)=><label className={styles.checkboxRow} key={id}><input type="checkbox" name="photo_ids" value={id} defaultChecked/>Verified photograph {index+1}</label>):<p>No new verified photographs for this action. Upload them above{action==="accept"||action==="reject"||action==="start_reinspection"?" if needed":" before submitting"}.</p>}</>}
 </OperationsForm></details>;
}
function DetailedWorkflow({simple,children}:{simple:boolean;children:React.ReactNode}) {
 return simple?<details className={styles.details}><summary>Repair, responsibility and history</summary>{children}</details>:<>{children}</>;
}
export default async function SnagDetail({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const {supabase,member}=await requireActor(),context=await snagContextFor(supabase,id);if(!context)notFound();
 const {snag,permissions,events,photos}=context;
 const open=!["closed","cancelled"].includes(snag.snag_status||snag.state),draft=snag.snag_status==="draft";
 const simple=member.role==="supervisor";
 // In the Report an issue flow the supervisor already chose whether work stops; escalating stays available, not prominent.
 const reportFlow=simple&&flagEnabled("nextActions",member.role);
 const original=photos.filter(photo=>photo.purpose==="original"&&photo.uploaded_at&&photo.event_id!==null);
 const [teams,operatives,historyResult]=await Promise.all([
  permissions.supervise?supabase.from("teams").select("id,name").eq("active",true).order("name"):Promise.resolve({data:[],error:null}),
  permissions.supervise?supabase.from("operatives").select("id,display_name").eq("status","active").order("display_name"):Promise.resolve({data:[],error:null}),
  permissions.supervise&&snag.work_area_id?supabase.rpc("location_work_history",{p_area:snag.work_area_id}):Promise.resolve({data:[],error:null}),
 ]);checkRpc(teams.error);checkRpc(operatives.error);checkRpc(historyResult.error);
 const history=((historyResult.data||[]) as WorkHistoryEntry[]).filter(period=>period.stage===snag.stage);
 // A supervisor can ask the office about this snag once conversations are installed.
 const ask=simple&&!draft&&!!snag.snag_status&&await conversationsAvailable(supabase);
 const panel=(action:string,label:string,children?:React.ReactNode,purpose?:NonNullable<SnagPhoto["purpose"]>,defaultNote="")=><ActionPanel key={action} snag={snag} action={action} label={label} photos={photos} purpose={purpose} userId={member.user_id} defaultNote={defaultNote}>{children}</ActionPanel>;
 return <><ConnectionStatus/><p><Link href={simple?`/admin/supervisor/sites/${snag.contract_id}`:`/admin/snags?contract_id=${snag.contract_id}`}>{simple?"← Today":"← Snag register"}</Link></p>
  <h1 className={styles.title}>{snag.check_label}</h1><p>{snag.contract_reference} · {snag.contract_name} · {snag.location_path?.join(" › ")||"Legacy morning-check finding"}</p>
  {simple&&!draft&&snag.snag_status&&<p role="status" className={styles.success}>Snag saved. The office can review this report.</p>}
  <div className={css.badges}><span>{statusLabels[snag.snag_status||snag.state]}</span>{snag.severity&&<span>{snag.severity}</span>}{isSnagOverdue(snag)&&<span>Overdue</span>}</div>
  {(snag.severity==="critical"||snag.escalated)&&open&&!draft&&<div className={css.critical} role="status"><strong>{snag.severity==="critical"?"Critical defect — immediate office review":"Escalated to office"}</strong><p>{snag.escalation_reason}</p><p>This is an escalation, not a formal stop-work hold.</p></div>}
  {permissions.supervise&&open&&!draft&&<div className={styles.rowActions}><Link className={reportFlow?styles.secondaryButton:styles.bigButton} href={`/admin/holds/new?contract=${snag.contract_id}&snag=${snag.id}`}>{reportFlow?"Stop work for this snag":simple?"STOP WORK":"STOP AFFECTED WORK — linked hold"}</Link><Link className={styles.secondaryButton} href={`/admin/holds?contract_id=${snag.contract_id}${snag.work_area_id?`&location_id=${snag.work_area_id}`:""}`}>Review location holds</Link></div>}
  <section className={styles.panel}><h2>Original finding</h2><p>{snag.description}</p>{!simple&&snag.required_rectification&&<p><strong>Required rectification:</strong> {snag.required_rectification}</p>}
   <p>{!simple&&snag.stage&&`${snag.stage} · `}Recorded {new Date(snag.created_at).toLocaleString("en-GB",{timeZone:"Europe/London"})}{snag.inspector_name&&` by ${snag.inspector_name}`}</p>
   {snag.location_inspection_id&&<p>Linked to a failed inspection. <Link href={`/admin/supervisor/sites/${snag.contract_id}/inspections?location=${snag.work_area_id}`}>Review original inspection</Link></p>}
   {ask&&<Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${snag.contract_id}/messages?about=snag:${snag.id}#ask`}>Ask the office about this</Link>}
  </section>
  {simple&&!draft&&snag.snag_status&&<p><Link className={styles.bigButton} href={`/admin/supervisor/sites/${snag.contract_id}`}>Back to today</Link></p>}
  <DetailedWorkflow simple={simple&&!draft&&!!snag.snag_status}>
  {simple&&snag.required_rectification&&<p><strong>Required rectification:</strong> {snag.required_rectification}</p>}
  {!snag.snag_status?<><p>This legacy morning-check issue retains its original workflow and history. No location, severity or responsibility has been invented for it.</p><IssueQueue initial={[{id:snag.id,contract_id:snag.contract_id,inspection_id:snag.inspection_id!,check_label:snag.check_label,description:snag.description,state:snag.state,created_at:snag.created_at,rectified_by:snag.rectified_by}]} role={member.role} userId={member.user_id}/></>:<>
   {draft&&<section className={styles.panel}><h2>Finish recording this draft</h2><p>The snag has not been submitted. Upload and verify original photographs, then submit. Drafts do not count as completed defects.</p></section>}
   {open&&permissions.supervise&&<SnagPhotoUploader key={`original-${snag.repair_cycle}`} issue={id} purpose="original"/>}
   {draft&&permissions.supervise&&panel("submit","Submit snag",undefined,"original","Original finding and verified photographs submitted")}
   {!draft&&open&&permissions.supervise&&panel("add_original_evidence","Attach additional original evidence",undefined,"original")}
   {!draft&&<section className={styles.panel}><h2>Responsibility for the original defect</h2>
    <p><strong>{responsibilityLabels[snag.responsibility_state||"not_assessed"]}</strong>{snag.responsible_team&&` · ${snag.responsible_team}`}</p>
    <p>Historical presence is evidence of work performed, not proof of responsibility. No payment deduction or liability charge is created by this workflow.</p>
    {open&&permissions.supervise&&<>
     <details className={styles.details}><summary>Actual workforce at this location and stage</summary>{history.length?<ul>{history.map(period=><li key={period.actual_allocation_id}><strong>{period.team_name||"No named gang"}</strong> · {period.contractor_name||"Company not recorded"} · {dayLabel(period.work_date)} · {londonClock(period.started_at)}–{period.ended_at?londonClock(period.ended_at):"open"} · {period.location_relation}<p>{period.operative_names.join(", ")}</p></li>)}</ul>:<p>No matching actual work history. Plans do not prove attendance.</p>}</details>
     {(snag.responsibility_state!=="confirmed"||permissions.office)?<>
      {panel("propose_responsibility","Propose responsible gang",<label>Actual gang / work period<select name="allocation_id" required defaultValue=""><option value="">Choose recorded work</option>{history.filter(period=>period.team_id).map(period=><option key={period.actual_allocation_id} value={period.actual_allocation_id}>{period.team_name} · {period.work_date} · {londonClock(period.started_at)} · {period.location_relation}</option>)}</select></label>)}
      {panel("mark_unknown","Mark responsibility unknown")}
     </>:<p>The office confirmed responsibility. Office review is required to revise this decision.</p>}
    </>}
    {open&&permissions.proposed_party&&["proposed","accepted"].includes(snag.responsibility_state||"")&&<>{panel("accept_responsibility","Accept responsibility proposal")}{panel("dispute_responsibility","Dispute responsibility")}</>}
    {open&&permissions.office&&panel("review_responsibility","Office responsibility decision",<label>Decision<select name="decision"><option value="under_review">Under office review</option><option value="confirmed">Confirm the proposed gang</option><option value="unable_to_determine">Unable to determine</option></select></label>)}
   </section>}
   {!draft&&<section className={styles.panel}><h2>Rectification and independent reinspection</h2>
    <p><strong>Repair assigned to:</strong> {snag.repair_team||snag.repair_operative||"Not assigned"}</p>{snag.assigned_action&&<p>{snag.assigned_action} · target {snag.target_date}</p>}
    <p>Who performs the repair is separate from responsibility for the original defect. Each failed attempt stays in the history.</p>
    {open&&permissions.supervise&&["open","assigned"].includes(snag.snag_status)&&panel("assign","Assign or reassign rectification",<>
     <label>Repair gang<select name="team_id" defaultValue=""><option value="">Choose gang, or an operative below</option>{(teams.data||[]).map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
     <label>Repair operative<select name="operative_id" defaultValue=""><option value="">Choose operative, or a gang above</option>{(operatives.data||[]).map(person=><option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
     <label>Required repair action<textarea name="required_action" required maxLength={2000} defaultValue={snag.required_rectification||""}/></label><label>Target date<input name="target_date" type="date" required/></label></>)}
    {open&&permissions.repair&&(snag.assigned_team_id||snag.assigned_operative_id)&&["open","assigned"].includes(snag.snag_status)&&<>
     <SnagPhotoUploader key={`repair-${snag.repair_cycle}`} issue={id} purpose="rectification"/>
     {panel("submit_rectification","Submit repair for reinspection",<label>Work completed on<input name="completed_on" type="date" required max={londonDate()} defaultValue={londonDate()}/></label>,"rectification")}
    </>}
    {permissions.supervise&&["rectification_submitted","reinspection"].includes(snag.snag_status)&&<>
     <SnagPhotoUploader key={`reinspection-${snag.repair_cycle}`} issue={id} purpose="reinspection"/>
     {snag.snag_status==="rectification_submitted"&&panel("start_reinspection","Start reinspection",undefined,undefined,"Independent reinspection started")}
     {snag.snag_status==="reinspection"&&member.user_id!==snag.rectified_by&&((snag.severity!=="critical"&&!snag.escalated)||permissions.office)&&panel("accept","Accept rectification and close",undefined,"reinspection")}
     {member.user_id===snag.rectified_by&&<p>You submitted this repair. A different authorised inspector must accept it.</p>}
     {(snag.severity==="critical"||snag.escalated)&&!permissions.office&&<p>The office must accept this critical or escalated repair.</p>}
     {panel("reject","Reject — further work required",undefined,"reinspection")}
    </>}
   </section>}
   {permissions.supervise&&<section className={styles.panel}><h2>Review and corrections</h2>
    {open&&!draft&&panel("escalate","Escalate to office")}{open&&snag.escalated&&permissions.office&&panel("resolve_escalation","Record office escalation review")}
    {snag.snag_status==="closed"&&panel("reopen","Reopen snag")}{open&&panel("cancel","Entered in error — preserve record")}
   </section>}
  </>}
  <section className={styles.panel}><h2>Saved photographic evidence</h2><p>{original.length} original defect photograph{original.length===1?"":"s"} attached. Stored images below are separate from unsaved camera previews.</p>
   <div className={css.photoGrid}>{photos.map(photo=><figure key={photo.id}>
    {photo.purpose&&!photo.uploaded_at?<p>Pending reservation — upload not verified; does not count as evidence.</p>:<>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/snags/photos/${photo.id}`} alt={`${photo.purpose||"Legacy"} evidence`}/><a href={`/admin/snags/photos/${photo.id}`} target="_blank" rel="noopener noreferrer">Review full-size photograph</a></>}
    <figcaption>{photo.purpose||"Legacy photograph"} · {photo.uploaded_at?`Verified ${new Date(photo.uploaded_at).toLocaleString("en-GB",{timeZone:"Europe/London"})}`:"Original stored record"}
     <p>Uploader: {photo.actor_id===member.user_id?member.display_name:events.find(event=>event.actor_id===photo.actor_id)?.actor_name||"Recorded uploader"}</p>
     {photo.purpose&&photo.uploaded_at&&photo.event_id===null&&<p>Verified in storage; not yet attached to a lifecycle submission.</p>}
     {photo.purpose&&photo.repair_cycle!==snag.repair_cycle&&<p>Earlier cycle — preserved for review.</p>}
    </figcaption></figure>)}</div>{!photos.length&&<p>No saved photographs.</p>}
  </section>
  <section className={styles.panel}><h2>Permanent snag history</h2><ol className={css.history}>{events.map(event=>{
   const presence=event.snapshot?.work_presence as {work_date:string;started_at:string;ended_at:string|null}|undefined;
   const attendance=Array.isArray(event.snapshot?.attendance)?event.snapshot.attendance as {display_name:string}[]:[];
   return <li key={event.id}>
   <strong>{event.action.replaceAll("_"," ")}</strong> · {new Date(event.created_at).toLocaleString("en-GB",{timeZone:"Europe/London"})} · {event.actor_name||"Recorded actor"}
   {event.previous_status&&<p>{statusLabels[event.previous_status]} → {statusLabels[event.new_status||""]}</p>}<p>{event.note}</p>
   {event.snapshot&&<p>{Boolean(event.snapshot.assigned_party)&&`Repair: ${String(event.snapshot.assigned_party)} · `}{Boolean(event.snapshot.completed_on)&&`Completed: ${String(event.snapshot.completed_on)} · `}{Boolean(event.snapshot.team_name)&&`Proposed gang: ${String(event.snapshot.team_name)} · `}{Boolean(event.snapshot.responsibility_state)&&`Responsibility: ${responsibilityLabels[String(event.snapshot.responsibility_state)]||String(event.snapshot.responsibility_state)}`}</p>}
   {event.action==="assign"&&Boolean(event.snapshot?.assigned_action)&&<p>Repair instructions recorded at this event: {String(event.snapshot!.assigned_action)} · target {String(event.snapshot!.target_date)}</p>}
   {presence&&<details className={styles.details}><summary>Recorded workforce evidence for this proposal</summary>
    <p>{presence.work_date} · {londonClock(presence.started_at)}–{presence.ended_at?londonClock(presence.ended_at):"open at time of proposal"}</p>
    <p>{attendance.map(person=>person.display_name).join(", ")||"No named operatives recorded"}</p>
   </details>}
   {photos.some(photo=>photo.event_id===event.id)&&<p>{photos.filter(photo=>photo.event_id===event.id).length} verified photographs linked to this event.</p>}
  </li>;})}</ol>{!events.length&&<p>No lifecycle events recorded yet.</p>}</section>
  </DetailedWorkflow>
 </>;
}
