"use client";
import { useEffect, useState } from "react";
import type { WorkHistoryEntry } from "@/lib/operations/types";
import { londonClock, dayLabel } from "@/lib/operations/planning";
import styles from "@/app/admin/admin.module.css";
export function WorkCandidates({contract,location,stage,disabled=false}:{contract:string;location:string;stage:string;disabled?:boolean}) {
 const [history,setHistory]=useState<WorkHistoryEntry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  const controller=new AbortController();setHistory([]);setError("");setLoading(false);
  if(!location) return ()=>controller.abort();
  setLoading(true);
  fetch(`/api/supervisor/snags/history?${new URLSearchParams({contract,location,stage})}`,{signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok) throw new Error(data.error||"History unavailable");if(!controller.signal.aborted)setHistory(data.history);
  }).catch(error=>{if(!controller.signal.aborted) setError(error instanceof Error?error.message:"History unavailable");}).finally(()=>{if(!controller.signal.aborted) setLoading(false);});
  return ()=>controller.abort();
 },[contract,location,stage]);
 return <section aria-label="Historical workforce candidates">
  <h3>Who actually worked here?</h3><p>Historical presence is evidence of work performed, not proof of responsibility. Plans do not count as attendance.</p>
  {loading&&<p role="status">Reading actual work history…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  {!location?<p>Choose the exact location first.</p>:!loading&&!history.length&&!error?<p>No matching actual work recorded. Responsibility may be unknown.</p>:<ul>{history.map(period=><li key={period.actual_allocation_id}>
   <strong>{period.team_name||"People without a registered gang"}</strong> · {period.contractor_name||"Company not recorded"} · {dayLabel(period.work_date)} · {londonClock(period.started_at)}–{period.ended_at?londonClock(period.ended_at):"open"} · {period.location_relation}
   <p>{period.operative_names.join(", ")}</p></li>)}</ul>}
  <label>Responsibility proposal (optional)<select name="responsibility_allocation" disabled={disabled} defaultValue="" key={`${location}-${stage}`}>
   <option value="">Not assessed — do not assign responsibility</option><option value="unknown">Unable to determine</option>
   {history.filter(period=>period.team_id).map(period=><option value={period.actual_allocation_id} key={period.actual_allocation_id}>{period.team_name} · {period.work_date} · {londonClock(period.started_at)} · {period.location_relation}</option>)}
  </select></label>
  <label>Why this proposal / why unknown<textarea name="responsibility_note" maxLength={2000} disabled={disabled}/></label>
 </section>;
}
