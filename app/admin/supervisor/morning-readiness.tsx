"use client";

import Link from "next/link";
import { useState } from "react";

const morning = [
  "HSE issues, hazards and site instructions reviewed",
  "Yesterday's work and outstanding snags reviewed",
  "Today's operatives and teams accounted for",
  "Tiles, adhesive, grout and consumables available",
  "Water, mixing area and materials positioned",
  "Access clear: scaffold, other trades and obstructions",
  "Substrates and missing boardwork checked",
  "Current drawings, setting out and work instructions reviewed",
  "Delays, variations and dayworks identified",
  "Team briefed and safe to start"
];
export default function MorningReadiness({ contractReference, contractId, dashboardHref, workforceHref }: { contractReference: string; contractId:string; dashboardHref:string; workforceHref:string }) {
  const [checks, setChecks] = useState<string[]>([]);
  
  const [naChecks,setNaChecks]=useState<string[]>([]);
  const [naReasons,setNaReasons]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState("");
  const [saved,setSaved]=useState<{id:string;createdAt:string;issuesCount:number}|null>(null);
  const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
  const [checkIssues,setCheckIssues]=useState<Record<string,string>>({});
  const [issueFor,setIssueFor]=useState<string|null>(null);
  const [issueText,setIssueText]=useState("");
  const answered = new Set([...checks,...naChecks,...Object.keys(checkIssues)]).size;
  const ready = answered === morning.length && issueFor===null && naChecks.every(item=>Boolean(naReasons[item]?.trim()));
  const issueCount=Object.keys(checkIssues).length;
  const btn = { minHeight: 48, padding: "10px 16px", borderRadius: 8, border: "1px solid #aabdc5", background: "#fff", color: "#0f2a3a", fontWeight: 700, cursor: "pointer" } as const;
  return <section style={{background:"#fff",border:"1px solid #d7e2e5",borderRadius:12,padding:18,margin:"20px 0"}}>
    <p style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#326e67"}}>DAILY SITE INSPECTION</p>
    <h2>Morning readiness checks</h2>
    <p>Record the morning inspection. Review affected work in the location inspection, snag and hold records before work proceeds.</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}><Link href={`/admin/holds/new?contract=${contractId}`} style={{...btn,display:"inline-flex",alignItems:"center",background:"#8a3228",color:"#fff",textDecoration:"none"}}>Stop work</Link><Link href={`/admin/snags/new?contract=${contractId}`} style={{...btn,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Raise snag</Link></div>
    <details open><summary>1. Morning arrival — {answered}/{morning.length} reviewed</summary>
      {morning.map(item=><div key={item} style={{borderBottom:"1px solid #edf1f2",padding:"8px 0"}}>
        <p style={{fontWeight:600,overflowWrap:"anywhere"}}>{item}</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button type="button" style={{...btn,background:checks.includes(item)?"#d5eee5":"#fff"}} onClick={()=>{setChecks(prev=>prev.includes(item)?prev.filter(v=>v!==item):[...prev,item]);setIssueFor(null);setNaChecks(prev=>prev.filter(v=>v!==item));setCheckIssues(prev=>{const n={...prev};delete n[item];return n;});}}>Pass</button>
          <button type="button" style={{...btn,background:checkIssues[item]?"#ffe1d9":"#fff"}} onClick={()=>{setIssueFor(item);setIssueText(checkIssues[item]||"");}}>Raise issue</button>
          <button type="button" style={{...btn,background:naChecks.includes(item)?"#dce9f6":"#fff"}} onClick={()=>{setNaChecks(prev=>prev.includes(item)?prev.filter(v=>v!==item):[...prev,item]);setChecks(prev=>prev.filter(v=>v!==item));setCheckIssues(prev=>{const n={...prev};delete n[item];return n;});setIssueFor(null);}}>N/A</button>
        </div>
        {naChecks.includes(item)&&<label style={{display:"block",marginTop:8}}>Reason N/A (required)<textarea style={{display:"block",width:"100%"}} value={naReasons[item]||""} onChange={e=>setNaReasons(prev=>({...prev,[item]:e.target.value}))}/></label>}
        {checkIssues[item]&&<p role="status" style={{color:"#8d3423"}}><strong>Issue to submit:</strong> {checkIssues[item]}</p>}
        {issueFor===item&&<div style={{padding:12,background:"#fff4f0",borderRadius:8,marginTop:8}}>
          <label style={{display:"block"}}>Problem, location and required action<textarea style={{display:"block",width:"100%",maxWidth:"100%",boxSizing:"border-box",minHeight:90}} value={issueText} onChange={e=>setIssueText(e.target.value)}/></label>
          <p style={{fontSize:12}}>Issues will be saved with this inspection and require office review. This submission does not release a hold.</p>
          <button type="button" style={btn} disabled={!issueText.trim()} onClick={()=>{setCheckIssues(prev=>({...prev,[item]:issueText.trim()}));setChecks(prev=>prev.filter(v=>v!==item));setIssueFor(null);}}>Record issue</button>
        </div>}
      </div>)}
      {issueCount>0&&<p role="alert"><strong>{issueCount} issue(s) requiring attention.</strong> Site: {contractReference}. Do not proceed with affected work until authorised.</p>}
      <div style={{marginTop:18,padding:16,background:"#f5f9fa",borderRadius:10}}>
       <strong>{answered}/{morning.length} checks answered</strong>
       {!ready&&<p>Answer all checks. N/A and issues need written reasons.</p>}
       {!saved?<button type="button" disabled={!ready||saving} style={{...btn,display:"block",width:"100%",marginTop:12,background:ready?"#0f2a3a":"#ddd",color:ready?"#fff":"#333"}} onClick={async()=>{
        setSaving(true);setSaveError("");
        const answers=morning.map(item=>({item,status:checkIssues[item]?"issue":naChecks.includes(item)?"na":"pass",note:checkIssues[item]||naReasons[item]||""}));
        try {
         const response=await fetch("/api/supervisor/inspections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contractId,requestKey,answers})});
         const data=await response.json();
         if(!response.ok) throw new Error(data.error||"Submission failed");
         setSaved(data);
        } catch(e) {setSaveError(e instanceof Error?e.message:"Unable to save inspection");}
        finally {setSaving(false);}
       }}>{saving?"Saving inspection…":"Complete daily inspection →"}</button>:<div role="status" style={{marginTop:12}}>
        <h3>Inspection saved</h3><p>Reference: {saved.id}</p><p>Recorded: {new Date(saved.createdAt).toLocaleString("en-GB")}</p>
        <p>{saved.issuesCount?String(saved.issuesCount)+" outstanding issue(s) — office review required.":"No issues recorded in this inspection."}</p>
        {saved.issuesCount > 0 && <p><Link href={`/admin/holds/new?contract=${contractId}&morning=${saved.id}`} style={{...btn,display:"inline-flex",alignItems:"center",background:"#8a3228",color:"#fff",textDecoration:"none"}}>Stop affected work — linked morning finding</Link></p>}
        <p><strong>Next action:</strong> confirm who is on site and where.{saved.issuesCount?" Escalate outstanding issues before affected work proceeds.":""}</p>
        <Link href={workforceHref} style={{...btn,display:"flex",alignItems:"center",justifyContent:"center",minHeight:60,background:"#0f2a3a",color:"#fff",fontSize:18,textTransform:"uppercase",textDecoration:"none",marginBottom:8}}>Confirm today&apos;s workforce →</Link>
        <Link href={dashboardHref} style={{...btn,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Return to site dashboard</Link>
        <button type="button" style={{...btn,marginLeft:8}} onClick={()=>{setChecks([]);setNaChecks([]);setNaReasons({});setCheckIssues({});setSaved(null);setRequestKey(crypto.randomUUID());}}>Start another inspection</button>
       </div>}
       {saveError&&<p role="alert" style={{color:"#a12626"}}>{saveError} — nothing has been confirmed saved.</p>}
      </div>
    </details>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:20}}><Link href={`${dashboardHref}/inspections`} style={{...btn,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Inspect location</Link><Link href={`/admin/holds?contract_id=${contractId}`} style={{...btn,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Review holds</Link><Link href={`/admin/snags?contract_id=${contractId}`} style={{...btn,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Review saved snags and historic issues</Link></div>
  </section>;
}
