"use client";
import {useState} from "react";
type Issue={id:string;contract_id:string;inspection_id:string;check_label:string;description:string;state:string;created_at:string;rectified_by:string|null};
const btn:React.CSSProperties={minHeight:48,padding:"10px 14px",border:"1px solid #a4b7c1",borderRadius:8,background:"#fff",color:"#0f2a3a",fontWeight:700};
export default function IssueQueue({initial,role,userId}:{initial:Issue[];role:string;userId:string}){
 const [items,setItems]=useState(initial),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({}),[photos,setPhotos]=useState<Record<string,File|null>>({});
 const actions=(i:Issue)=>i.state==="open"?["report_rectification"]:i.state==="rectification_reported"?["request_reinspection"]:i.state==="reinspection_required"?["report_rectification",...(["owner","contracts_manager"].includes(role)&&i.rectified_by!==userId?["close_after_reinspection"]:[])]:i.state==="closed"&&["owner","contracts_manager"].includes(role)?["reopen"]:[];
 const labels:Record<string,string>={report_rectification:"Report rectification",request_reinspection:"Request independent reinspection",close_after_reinspection:"Confirm reinspection and close",reopen:"Reopen issue"};
 return <div style={{display:"grid",gap:14}}>
 {items.length===0?<p>No issues recorded.</p>:items.map(i=><article key={i.id} style={{background:"#fff",padding:16,border:"1px solid #d2dce0",borderRadius:12}}>
 <h2 style={{fontSize:20}}>{i.check_label}</h2><p><strong>Status: {i.state.replaceAll("_"," ")}</strong></p><p>{i.description}</p><p>Contract {i.contract_id} · {new Date(i.created_at).toLocaleString("en-GB")}</p>
 <label style={{display:"block"}}>Action / reinspection notes<textarea value={notes[i.id]||""} onChange={e=>setNotes(p=>({...p,[i.id]:e.target.value}))} style={{width:"100%",minHeight:90,boxSizing:"border-box"}} placeholder="Location, remedial work, evidence reviewed and physical reinspection findings"/></label>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>{actions(i).map(action=><button key={action} type="button" style={btn} disabled={busy===i.id||(notes[i.id]||"").trim().length<5} onClick={async()=>{
 setBusy(i.id);setError(p=>({...p,[i.id]:""}));
 try{const r=await fetch("/api/supervisor/issues",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({issueId:i.id,action,note:notes[i.id]})});const data=await r.json();if(!r.ok)throw Error(data.error||"Unable to save");setItems(p=>p.map(v=>v.id===i.id?data.issue:v));setNotes(p=>({...p,[i.id]:""}))}
 catch(e){setError(p=>({...p,[i.id]:e instanceof Error?e.message:"Action failed"}))}finally{setBusy(null)}
 }}>{busy===i.id?"Saving…":labels[action]}</button>)}</div>
 <label style={{display:"block",marginTop:16}}>Photographic evidence (JPEG, PNG, WebP; max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setPhotos(p=>({...p,[i.id]:e.target.files?.[0]||null}))}/></label>
 <button type="button" style={{...btn,marginTop:8}} disabled={!photos[i.id]||busy===i.id} onClick={async()=>{
 setBusy(i.id);setError(p=>({...p,[i.id]:""}));
 try{const form=new FormData();form.set("issueId",i.id);form.set("photo",photos[i.id]!);const r=await fetch("/api/supervisor/issues/photo",{method:"POST",body:form});const data=await r.json();if(!r.ok)throw Error(data.error||"Upload failed");setPhotos(p=>({...p,[i.id]:null}));setError(p=>({...p,[i.id]:"Photograph saved successfully."}))}
 catch(e){setError(p=>({...p,[i.id]:e instanceof Error?e.message:"Upload failed"}))}finally{setBusy(null)}
 }}>Upload photo</button>
 {error[i.id]&&<p role="status">{error[i.id]}</p>}
 </article>)}
 </div>;
}
