"use client";
import { useState } from "react";
import { createHoldAction } from "@/app/admin/holds/actions";
import { HoldForm } from "./hold-form";
import { LocationPicker } from "@/components/office/location-picker";
import { qualityCategories,safetyCategories,holdTypes } from "@/lib/operations/holds";
import { installationStages,installationStageLabels,type Location } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";
export function CreateHold({contract,locations,packages,requestKey,initialLocation,initialStage,source,initialReason}:{contract:string;locations:Location[];packages:{id:string;name:string}[];requestKey:string;initialLocation?:string;initialStage?:string;initialReason?:string;source?:{key:string;id:string;label:string}}){
 const [type,setType]=useState<"quality"|"safety">("quality"),[site,setSite]=useState(false);
 return <HoldForm action={createHoldAction} label="STOP AFFECTED WORK" create contract={contract}>
  <input type="hidden" name="contract_id" value={contract}/><input type="hidden" name="request_key" value={requestKey}/>
  {source&&<><input type="hidden" name={source.key} value={source.id}/><p>Linked to {source.label}. Original findings remain unchanged.</p></>}
  <label>Type<select name="hold_type" value={type} onChange={event=>setType(event.target.value as "quality"|"safety")}>{Object.entries(holdTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  {type==="safety"&&<p className={styles.error}>Safety stop-work: stop the affected activity immediately and follow the principal contractor’s site-safety procedures. TileSPEC records controls and decisions; it does not replace their authority.</p>}
  <label className={styles.checkboxRow}><input type="checkbox" name="site_scope" checked={site} onChange={event=>setSite(event.target.checked)}/>Stop the entire site — all locations</label>
  {site?<input type="hidden" name="work_area_id" value=""/>:<LocationPicker name="work_area_id" label="Affected location or branch" locations={locations} defaultValue={initialLocation||null} hint="A selected floor or zone includes its descendants. Search a room name to limit the stop."/>}
  <label>Affected stage<select name="stage" defaultValue={initialStage||""}><option value="">All installation activities in this scope</option>{installationStages.map(stage=><option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
  <label>Affected activity description (optional)<input name="activity" maxLength={200} placeholder="For example, tiling over the waterproofing system"/></label>
  <p>The restriction covers the selected stage and location branch. Activity notes describe the concern and do not narrow that restriction.</p>
  <label>Work package (optional)<select name="work_package_id" defaultValue="" disabled={site}><option value="">All work packages in this scope</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Category<select name="category" key={type}>{(type==="quality"?qualityCategories:safetyCategories).map(category=><option key={category}>{category}</option>)}</select></label>
  <label>Severity<select name="severity" defaultValue="major"><option value="major">Major</option><option value="critical">Critical / immediate concern</option></select></label>
  <label>Reason<textarea name="reason" required minLength={5} maxLength={2000} defaultValue={initialReason||""}/></label>
  <label>Required corrective action<textarea name="required_action" required minLength={5} maxLength={2000}/></label>
  <p>Record the stop now. Photographs and supporting documents can follow after it is saved. Evidence or a documented explanation is required for release review.</p>
  <label>Evidence unavailable — explanation (optional now)<textarea name="evidence_explanation" maxLength={2000} placeholder="For example, access is unsafe; evidence will be provided after the area is made safe."/></label>
 </HoldForm>;
}
