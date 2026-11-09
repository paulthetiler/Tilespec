"use client";
import { useState } from "react";
import styles from "@/app/admin/admin.module.css";

/** The phone's own keyboard microphone works in these normal text areas. No audio is stored. */
export function HandoverQuestions() {
 const [progress,setProgress]=useState("yes");
 const [completed,setCompleted]=useState("");
 const [problems,setProblems]=useState("no");
 const [materials,setMaterials]=useState("yes");
 const [attention,setAttention]=useState("no");
 const [notes,setNotes]=useState(false);
 const options=(name:string,value:string,onChange:(value:string)=>void,items:[string,string][]) =>
  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>{items.map(([key,label])=><label key={key} style={{border:"1px solid #b5c7cb",borderRadius:9,padding:"10px 12px",background:value===key?"#e1f2ee":"transparent",cursor:"pointer"}}>
   <input type="radio" name={name} value={key} checked={value===key} onChange={()=>onChange(key)} style={{marginRight:6}} />{label}
  </label>)}</div>;
 return <div style={{display:"grid",gap:22}}>
  <section><strong>1. Did the work go to plan?</strong>{options("progress_choice",progress,setProgress,[["yes","Yes, all good"],["partial","Partly"],["no","Delays / problems"]])}
   <label className={styles.field} style={{marginTop:12}}>What work was completed?
    <textarea name="work_completed" maxLength={2000} rows={2} value={completed} onChange={event=>setCompleted(event.target.value)} placeholder="e.g. Floor preparation and 40m² of tiling completed. Tap the microphone on your phone keyboard to speak." />
   </label>
  </section>
  <input type="hidden" name={notes ? "summary_note" : "office_notes"} value={notes ? "" : `Day summary: ${progress==="yes"?"Work went to plan":progress==="partial"?"Work partly completed":"Work delayed"}; problems ${problems==="no"?"none reported":"reported"}; tomorrow materials ${materials==="yes"?"ready":materials==="no"?"required":"not confirmed"}; areas needing attention ${attention==="yes"?"reported":"none reported"}.`} />
  <section><strong>2. Any outstanding problems?</strong>{options("problems_choice",problems,setProblems,[["no","No problems"],["yes","Yes, needs attention"]])}
   {problems==="yes"&&<label className={styles.field} style={{marginTop:12}}>What needs sorting?<textarea name="outstanding_problems" maxLength={2000} rows={2} required placeholder="Speak using your keyboard microphone, or type a quick note" /></label>}
  </section>
  <section><strong>3. Everything ready for tomorrow?</strong>{options("materials_choice",materials,setMaterials,[["yes","Yes, all sorted"],["no","Materials needed"],["unknown","Not sure yet"]])}
   {materials==="no"&&<label className={styles.field} style={{marginTop:12}}>What materials are needed?<textarea name="materials_needed" maxLength={2000} rows={2} required placeholder="What, how much, and when needed?" /></label>}
   {materials==="unknown"&&<input type="hidden" name="materials_needed" value="Materials for tomorrow not yet confirmed — office to check." />}
  </section>
  <section><strong>4. Any areas still needing attention?</strong>{options("attention_choice",attention,setAttention,[["no","No"],["yes","Yes"]])}
   {attention==="yes"&&<label className={styles.field} style={{marginTop:12}}>Which areas?<textarea name="areas_awaiting_attention" maxLength={2000} rows={2} required placeholder="Area and what's outstanding" /></label>}
  </section>
  <section><label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={notes} onChange={e=>setNotes(e.target.checked)}/>Anything else the office needs to know?</label>
   {notes&&<label className={styles.field} style={{marginTop:12}}>Office note<textarea name="office_notes" maxLength={2000} rows={2} placeholder="Optional voice-dictated or typed note" /></label>}
  </section>
  <p className={styles.small}>You can use the microphone on your phone's keyboard in any note box. Check the words before saving. Already reported snags and restrictions remain in their own records.</p>
 </div>;
}
