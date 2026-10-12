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

export default function SiteWorkflowPreview({ areaNames, contractReference }: { areaNames: string[]; contractReference: string }) {
  const [checks, setChecks] = useState<string[]>([]);
  const [reviewed,setReviewed]=useState(false);
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
  const ready = checks.length === morning.length && Object.keys(checkIssues).length===0;
  const pass = inspection && ack && issues.length === 0 && prep !== "not-assessed";
  const btn = { minHeight: 48, padding: "10px 16px", borderRadius: 8, border: "1px solid #aabdc5", background: "#fff", color: "#0f2a3a", fontWeight: 700, cursor: "pointer" } as const;
  return <section style={{background:"#fff",border:"1px solid #d7e2e5",borderRadius:12,padding:18,margin:"20px 0"}}>
    <p style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#326e67"}}>WORKFLOW PREVIEW — NOT SAVED</p>
    <h2>Daily supervisor routine</h2>
    <p>This is a hands-on prototype. Nothing you tick here is stored, approved or used to release work or payments.</p>
    <details open><summary>1. Morning arrival — {checks.length}/{morning.length} reviewed</summary>
      {morning.map(item=><div key={item} style={{borderBottom:"1px solid #edf1f2",padding:"8px 0"}}>
        <p style={{fontWeight:600,overflowWrap:"anywhere"}}>{item}</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button type="button" style={{...btn,background:checks.includes(item)?"#d5eee5":"#fff"}} onClick={()=>{setChecks(prev=>prev.includes(item)?prev.filter(v=>v!==item):[...prev,item]);setIssueFor(null);}}>Pass</button>
          <button type="button" style={{...btn,background:checkIssues[item]?"#ffe1d9":"#fff"}} onClick={()=>{setIssueFor(item);setIssueText(checkIssues[item]||"");}}>Raise issue</button>
          <button type="button" style={btn} onClick={()=>{setChecks(prev=>prev.includes(item)?prev:[...prev,item]);setIssueFor(null);}}>N/A</button>
        </div>
        {checkIssues[item]&&<p role="status" style={{color:"#8d3423"}}><strong>Issue noted (unsaved):</strong> {checkIssues[item]}</p>}
        {issueFor===item&&<div style={{padding:12,background:"#fff4f0",borderRadius:8,marginTop:8}}>
          <label style={{display:"block"}}>Problem, location and required action<textarea style={{display:"block",width:"100%",maxWidth:"100%",boxSizing:"border-box",minHeight:90}} value={issueText} onChange={e=>setIssueText(e.target.value)}/></label>
          <p style={{fontSize:12}}>Prototype only: issues are not submitted, escalated or saved. A real hold cannot be released here.</p>
          <button type="button" style={btn} disabled={!issueText.trim()} onClick={()=>{setCheckIssues(prev=>({...prev,[item]:issueText.trim()}));setChecks(prev=>prev.filter(v=>v!==item));setIssueFor(null);}}>Record in preview</button>
        </div>}
      </div>)}
      {Object.keys(checkIssues).length>0&&<p role="alert"><strong>Outstanding issues: {Object.keys(checkIssues).length}.</strong> No work release permitted from this prototype. Site: {contractReference}.</p>}
      <div style={{marginTop:18,padding:16,background:"#f5f9fa",borderRadius:10}}>
        <strong>{checks.length+Object.keys(checkIssues).length}/{morning.length} checks reviewed</strong>
        <button type="button" style={{...btn,display:"block",width:"100%",marginTop:12,background:ready?"#0f2a3a":"#ddd",color:ready?"#fff":"#333"}} disabled={!ready} onClick={()=>setReviewed(true)}>Review daily checklist →</button>
        {reviewed&&<div role="status"><h3>Checklist reviewed — preview only</h3><p>Not submitted or saved. This prototype cannot notify the office or release work.</p><p><strong>Next action:</strong> Review the area preparation decision below. Escalate any site issue directly to the contracts manager.</p></div>}
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
