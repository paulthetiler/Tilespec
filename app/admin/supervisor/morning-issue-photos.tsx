"use client";
import { useEffect, useState } from "react";
const labels = ["Safe, suitable access?", "Work areas available and clear?", "Any other trades obstructing progress?"];
type Issue = { id: string; check_label: string };
export default function MorningIssuePhotos({ inspectionId }: { inspectionId: string }) {
 const [issues,setIssues]=useState<Issue[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState("");
 const [files,setFiles]=useState<Record<string,File|null>>({}),[done,setDone]=useState<Record<string,boolean>>({});
 useEffect(()=>{let active=true;fetch("/api/supervisor/inspections?inspection="+encodeURIComponent(inspectionId)).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||"Cannot load issues");return b as {issues:Issue[]}}).then(b=>{if(active)setIssues(b.issues.filter(i=>labels.includes(i.check_label)))}).catch(e=>{if(active)setError(String(e))});return()=>{active=false}},[inspectionId]);
 if(!issues.length&&!error)return null;
 return <section style={{padding:14,border:"1px solid #ccd9df",borderRadius:10,marginTop:12}}><h3>Add photos to site readiness issues</h3><p>Take a photo or choose an existing one. It will be attached to the issue for the office.</p>
 {issues.map(i=><div key={i.id} style={{padding:12,borderTop:"1px solid #ddd"}}><strong>{i.check_label}</strong>
 <label style={{display:"block",marginTop:8}}>Take or add photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{display:"block",marginTop:8}} onChange={e=>setFiles(p=>({...p,[i.id]:e.target.files?.[0]||null}))}/></label>
 <button type="button" disabled={!files[i.id]||!!busy} style={{padding:12,marginTop:8}} onClick={async()=>{const file=files[i.id];if(!file)return;setBusy(i.id);setError("");try{const form=new FormData();form.set("issueId",i.id);form.set("photo",file);const r=await fetch("/api/supervisor/issues/photo",{method:"POST",body:form});const b=await r.json();if(!r.ok)throw Error(b.error||"Upload failed");setDone(p=>({...p,[i.id]:true}));setFiles(p=>({...p,[i.id]:null}))}catch(e){setError(e instanceof Error?e.message:"Upload failed")}finally{setBusy("")}}}>{busy===i.id?"Uploading…":"Save photo"}</button>
 {done[i.id]&&<p role="status">Photo saved against this issue.</p>}</div>)}
 {error&&<p role="alert">{error}</p>}</section>;
}
