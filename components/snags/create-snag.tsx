"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSnagAction, transitionSnagAction } from "@/app/admin/snags/actions";
import { LocationPicker } from "@/components/office/location-picker";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import type { Location } from "@/lib/operations/types";
import { WorkCandidates } from "./work-candidates";
import { PhotoChoices, uploadPhoto, usePhotos } from "./photo-upload";
import { CONNECTION_FAILED } from "@/components/operations/operations-form";
import { defectCategories, severityLabels } from "@/lib/operations/snags";
import { restoreSnagForm, snapshotSnagForm, type SnagFormSnapshot } from "@/lib/operations/snag-create-workflow";
import { MAX_FILE_BYTES } from "@/lib/operations/validation";
import { installationStages, installationStageLabels } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";
export function CreateSnag({contractId,locations,packages,requestKey,submitKey,proposalKey,inspection,initialLocation,simple=false,offerStop=true}:{
 contractId:string;locations:Location[];packages:{id:string;label:string}[];requestKey:string;submitKey:string;proposalKey:string;initialLocation?:string;
 simple?:boolean;
 /** False when the person already answered "does work need to stop?" on Report an issue. */
 offerStop?:boolean;
 inspection?:{id:string;locationId:string;stage:string;description:string};
}) {
 const router=useRouter(),photos=usePhotos();
 const savedForm=useRef<SnagFormSnapshot|null>(null),submissionForm=useRef<SnagFormSnapshot|null>(null),proposalForm=useRef<SnagFormSnapshot|null>(null);
 const [findingsLocked,setFindingsLocked]=useState(false),[submissionStarted,setSubmissionStarted]=useState(false),[submissionConfirmed,setSubmissionConfirmed]=useState(false);
 const [phase,setPhase]=useState<"creating"|"uploading"|"submitting"|"proposing">("creating");
 const [location,setLocation]=useState(inspection?.locationId||initialLocation||""),[stage,setStage]=useState(inspection?.stage||"installation"),[dirty,setDirty]=useState(false);
 const [showDetails,setShowDetails]=useState(!simple);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[draft,setDraft]=useState<string>();
 const details=<>
  <fieldset disabled={busy||findingsLocked} className={styles.fieldset}>
   {!inspection&&<label>Installation stage<select name="stage" value={stage} onChange={event=>setStage(event.target.value)}>{installationStages.map(stage=><option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>}
   <label>Severity<select name="severity" defaultValue="major">{Object.entries(severityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Required rectification<textarea name="required_rectification" required maxLength={2000} defaultValue={simple?"Investigate this finding against the approved project requirements and agree any corrective work with the office.":""}/></label>
   <label>Relevant work package (optional)<select name="work_package_id" defaultValue=""><option value="">Not specified</option>{packages.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  </fieldset>
  {showDetails&&<><WorkCandidates contract={contractId} location={location} stage={stage} disabled={busy||findingsLocked}/>
   <p>No gang is automatically held responsible. Responsibility can be reviewed separately after submission.</p></>}
 </>;
 return <form className={styles.form} onInput={()=>setDirty(true)} onSubmit={async event=>{
  event.preventDefault();setBusy(true);setError("");setDirty(true);
  const form=savedForm.current?restoreSnagForm(savedForm.current):new FormData(event.currentTarget);
  try {
   if(!submissionForm.current) {
    if(!photos.entries.length||photos.entries.length>12) throw new Error("Choose between 1 and 12 photographs.");
    if(photos.entries.some(entry=>!["image/jpeg","image/png"].includes(entry.file.type)||entry.file.size===0||entry.file.size>MAX_FILE_BYTES))
     throw new Error("Choose JPEG or PNG photographs between 1 byte and 4 MB each.");
   }
   const proposal=String(form.get("responsibility_allocation")||"");
   if(proposal&&String(form.get("responsibility_note")||"").trim().length<5) throw new Error("Explain the responsibility proposal or why it is unknown (at least 5 characters).");
   let id=draft;
   if(!id) {
    // Freeze before dispatch: even a lost creation response may have saved it.
    savedForm.current=snapshotSnagForm(form);setFindingsLocked(true);setPhase("creating");
    const result=await createSnagAction({},restoreSnagForm(savedForm.current));
    if(!result.id) {
     if(result.uncertain===false) {savedForm.current=null;setFindingsLocked(false);}
     throw new Error(result.error||"We could not confirm whether the original findings were saved. Retry the same findings.");
    }
    id=result.id;setDraft(id);
   }
   if(!submissionConfirmed) {
    if(!submissionForm.current) {
     setPhase("uploading");const ids:string[]=[];
     for(const entry of photos.entries) {
      if(entry.verifiedId){ids.push(entry.verifiedId);continue;}
      try {const photo=await uploadPhoto(id,"original",entry,percent=>photos.patch(entry.key,{percent}));photos.patch(entry.key,{verifiedId:photo,error:undefined});ids.push(photo);}
      catch(error){photos.patch(entry.key,{error:error instanceof Error?error.message:CONNECTION_FAILED});throw error;}
     }
     const submission=new FormData();submission.set("issue_id",id);submission.set("request_key",submitKey);submission.set("version","1");submission.set("action","submit");
     submission.set("note","Original defect findings and verified photographs submitted");for(const photo of ids) submission.append("photo_ids",photo);
     submissionForm.current=snapshotSnagForm(submission);setSubmissionStarted(true);
    }
    setPhase("submitting");
    const result=await transitionSnagAction({},restoreSnagForm(submissionForm.current));if(result.error||!result.success) throw new Error(result.error||"Snag submission has not been confirmed. Retry the same submission.");
    setSubmissionConfirmed(true);
   }
   if(proposal) {
    if(!proposalForm.current) {
     const attribution=new FormData();attribution.set("issue_id",id);attribution.set("request_key",proposalKey);attribution.set("version","2");
     attribution.set("action",proposal==="unknown"?"mark_unknown":"propose_responsibility");attribution.set("note",String(form.get("responsibility_note")));
     if(proposal!=="unknown") attribution.set("allocation_id",proposal);
     proposalForm.current=snapshotSnagForm(attribution);
    }
    setPhase("proposing");
    const decision=await transitionSnagAction({},restoreSnagForm(proposalForm.current));if(decision.error||!decision.success) throw new Error(decision.error||"The snag is submitted, but the responsibility proposal has not been confirmed. Retry the same proposal.");
   }
   setDirty(false);router.push(`/admin/snags/${id}`);router.refresh();
  } catch(error){setError(error instanceof Error&&!(error instanceof TypeError)?error.message:CONNECTION_FAILED);}finally{setBusy(false);}
 }}>
  <input type="hidden" name="contract_id" value={contractId}/><input type="hidden" name="request_key" value={requestKey}/>
  {inspection&&<input type="hidden" name="inspection_id" value={inspection.id}/>}
  {simple&&offerStop&&<p><Link className={styles.secondaryButton} href={`/admin/holds/new?contract=${contractId}${location?`&location=${location}`:""}`}>STOP WORK</Link> <span>Serious concern? Stop affected work and alert the office.</span></p>}
  {findingsLocked&&!draft&&!busy&&<p role="status">We could not confirm whether the original findings were recorded. Retry keeps the same findings and responsibility choices. <Link href={`/admin/snags?contract_id=${contractId}`}>Check saved snags</Link> before starting a different record.</p>}
  {draft&&!submissionConfirmed&&<p role="status">Draft findings saved; snag submission has not yet been confirmed. <Link href={`/admin/snags/${draft}`}>Review saved status and continue after a reload</Link>. {submissionStarted?"Retry sends the same verified photographs; selections are locked until the outcome is confirmed.":"Retry here to verify photographs and submit the snag."}</p>}
  {draft&&submissionConfirmed&&<p role="status">Snag submitted with verified photographs. The responsibility proposal has not yet been confirmed; retry records only that proposal. <Link href={`/admin/snags/${draft}`}>Open the submitted snag</Link>.</p>}
  <fieldset disabled={busy||findingsLocked} className={styles.fieldset}>
   {inspection?<><input type="hidden" name="work_area_id" value={inspection.locationId}/><input type="hidden" name="stage" value={inspection.stage}/>
    <p>{locationPath(indexLocations(locations),inspection.locationId)} · {installationStageLabels[inspection.stage as keyof typeof installationStageLabels]||inspection.stage}. Linked to your saved check.</p></>
    :<LocationPicker name="work_area_id" label="Exact location" locations={locations} defaultValue={initialLocation||null} onChange={id=>setLocation(id||"")}/>}
   <label>Defect category<select name="category" required defaultValue={simple?"":"Excessive lippage"}>{simple&&<option value="">Choose the problem</option>}{defectCategories.map(category=><option key={category}>{category}</option>)}</select></label>
  </fieldset>
  {simple&&<section aria-label="Defect photographs"><h2>Photograph</h2><p>Add at least one photograph so the office can see the problem.</p><PhotoChoices entries={photos.entries} add={photos.add} remove={photos.remove} disabled={busy||submissionStarted}/></section>}
  <fieldset disabled={busy||findingsLocked} className={styles.fieldset}>
   <label>Short description<textarea name="description" required maxLength={2000} defaultValue={inspection?.description||""}/></label>
  </fieldset>
  {simple?<details className={styles.details} onToggle={event=>{if(event.currentTarget.open)setShowDetails(true);}}><summary>More details</summary><p>Optional: change the type of work, urgency or repair instructions.</p>{details}</details>:details}
  {!simple&&<PhotoChoices entries={photos.entries} add={photos.add} remove={photos.remove} disabled={busy||submissionStarted}/>}
  <button className={styles.bigButton} disabled={busy}>{busy?({creating:"Saving original findings…",uploading:"Uploading and verifying photographs…",submitting:"Confirming snag submission…",proposing:"Recording responsibility proposal…"}[phase]):submissionConfirmed?"Retry responsibility proposal":draft?"Retry verification and submission":findingsLocked?"Retry original findings":simple?"Submit snag":"Raise snag"}</button>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </form>;
}
