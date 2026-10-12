"use client";

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
const defects = [
  "Adhesive in grout joints / inadequate grout depth",
  "Adhesive visible through completed grout",
  "Excessive lippage or poor alignment",
  "Unacceptable cuts or gaps",
  "Missing / incomplete grout joints",
  "Poor trims, edges or movement joints",
  "Incorrect falls, levels or setting out",
  "Other workmanship defect"
];

export default function SiteWorkflowPreview({ areaNames, contractReference, contractId, onNext }: { areaNames: string[]; contractReference: string; contractId:string; onNext?:()=>void }) {
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
  const [prep, setPrep] = useState("not-assessed");
  const [area, setArea] = useState(areaNames[0] || "Sample work area");
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [snagsCleared, setSnagsCleared] = useState(false);
  const [inspection, setInspection] = useState(false);
  const [ack, setAck] = useState(false);
  const toggle = (value: string, list: string[], set: (value: string[]) => void) =>
    set(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  const answered = new Set([...checks,...naChecks,...Object.keys(checkIssues)]).size;
  const ready = answered === morning.length && issueFor===null && naChecks.every(item=>Boolean(naReasons[item]?.trim()));
  const issueCount=Object.keys(checkIssues).length;
  const pass = inspection && ack && issues.length === 0 && prep !== "not-assessed";
  const btn = { minHeight: 48, padding: "10px 16px", borderRadius: 8, border: "1px solid #aabdc5", background: "#fff", color: "#0f2a3a", fontWeight: 700, cursor: "pointer" } as const;
  return <section style={{background:"#fff",border:"1px solid #d7e2e5",borderRadius:12,padding:18,margin:"20px 0"}}>
    <p style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#326e67"}}>DAILY SITE INSPECTION</p>
    <h2>Daily supervisor routine</h2>
    <p>Submit the morning inspection to the office. Submission does not authorise work release or payment.</p>
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
        <p><strong>Next action:</strong> {saved.issuesCount?"Escalate outstanding issues before affected work proceeds.":"Review area preparation and outstanding site requirements."}</p>
        <button type="button" style={btn} onClick={()=>onNext?.()}>Return to job dashboard →</button>
        <button type="button" style={{...btn,marginLeft:8}} onClick={()=>{setChecks([]);setNaChecks([]);setNaReasons({});setCheckIssues({});setSaved(null);setRequestKey(crypto.randomUUID());}}>Start another inspection</button>
       </div>}
       {saveError&&<p role="alert" style={{color:"#a12626"}}>{saveError} — nothing has been confirmed saved.</p>}
      </div>
    </details>
    <details><summary>2. Area preparation decision</summary>
      <label style={{display:"block",margin:"10px 0"}}>Work area
        <select value={area} onChange={e=>{setArea(e.target.value);setPrep("not-assessed");setIssues([]);setInspection(false);setAck(false);setSnagsCleared(false);}}>
          {(areaNames.length?areaNames:["Sample work area"]).map(a=><option key={a}>{a}</option>)}
        </select>
      </label>
      <label style={{display:"block",margin:"10px 0"}}>Preparation status
        <select value={prep} onChange={e=>{setPrep(e.target.value);setAck(false);}}>
          <option value="not-assessed">Not assessed</option>
          <option value="required">Preparation required — not yet released</option>
          <option value="existing">Already completed — verify suitability</option>
          <option value="not-required">Not required — substrate suitable</option>
        </select>
      </label>
      <p>Supervisor chooses the appropriate route. Any unsuitable substrate or outstanding preparation prevents release of the affected area.</p>
    </details>
    <details><summary>3. Installation QA and snags</summary>
      <p>Inspect joint cleanliness <strong>before grouting</strong> and the finished grout afterwards. Record defects against the affected area.</p>
      {defects.map(item=><label key={item} style={{display:"flex",gap:12,alignItems:"center",minHeight:48,padding:"4px 0"}}>
        <input type="checkbox" style={{width:22,height:22,minHeight:22,flexShrink:0}} checked={issues.includes(item)} onChange={()=>{toggle(item,issues,setIssues);setSnagsCleared(false);setAck(false);}}/><span>{item}</span>
      </label>)}
      <label style={{display:"block",margin:"12px 0"}}>Snag notes / location / responsible installer
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Describe the problem and what must be rectified"/>
      </label>
      {issues.length>0&&<p role="status"><strong>QA hold:</strong> {issues.length} defect type(s) flagged. Rectification and reinspection required. Owner reviews any proposed deduction; no automatic deduction.</p>}
      {issues.length>0&&<button type="button" style={btn} onClick={()=>{setIssues([]);setSnagsCleared(true);setInspection(false);setAck(false);}}>Mark rectified — require reinspection</button>}
      {snagsCleared&&<p>Rectification noted in this preview. Reinspect before signing off.</p>}
      <label style={{display:"flex",alignItems:"center",gap:12,minHeight:48,marginTop:10}}>
        <input type="checkbox" style={{width:22,height:22,minHeight:22}} checked={inspection} onChange={e=>{setInspection(e.target.checked);setAck(false);}}/>Workmanship physically inspected against the job specification and tolerances
      </label>
    </details>
    <details><summary>4. Sign-off and escalation</summary>
      <p><strong>Routine QA:</strong> supervisor may approve satisfactory work. Serious defects, disputes, unusual remedial costs and proposed deductions go to the owner.</p>
      <label style={{display:"flex",alignItems:"center",gap:12,minHeight:48}}>
        <input type="checkbox" style={{width:22,height:22,minHeight:22}} checked={ack} onChange={e=>setAck(e.target.checked)} disabled={!inspection||issues.length>0||prep==="not-assessed"||prep==="required"}/>
        I confirm the affected area is acceptable for routine QA sign-off
      </label>
      <p role="status"><strong>{pass?"Ready for supervisor sign-off in the future live workflow":"QA sign-off unavailable"}</strong></p>
      <p>Actual sign-off, photographs, audit history, variation approvals and invoice review are not yet implemented in this prototype.</p>
    </details>
  </section>;
}
