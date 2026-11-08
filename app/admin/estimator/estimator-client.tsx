"use client";

import { useMemo, useState, useEffect, type FocusEvent } from "react";
import Link from "next/link";
import { saveSiteProgramme } from "./programme-actions";
import styles from "./page.module.css";
import { calculateEstimate, type EstimateArea, type CostArea, type MaterialSettings, type SupervisorSettings, type ProgrammeSettings } from "@/lib/estimator";

type Area = CostArea;
const initial: Area = { id: 1, description: "Open commercial floor", sqm: 500, sell: 35, sub: 17, output: 60, workType:"open-floor", daysExtra: 0, materials: 7, mode: "metre", gangDay: 600, lengthMm:600, widthMm:600, depthMm:10, jointMm:3, backButter:false };
const presets = [{value:"open-floor",label:"Open commercial floor — 60 m²/day",output:60},{value:"complex-floor",label:"Floors with cuts / obstructions — 35 m²/day",output:35},{value:"simple-walls",label:"Simple bathroom walls — 22 m²/day",output:22},{value:"detailed-bathroom",label:"IPS / trims / detailed bathrooms — 12 m²/day",output:12},{value:"custom",label:"Custom output",output:0}] as const;
const workday=(start:string,offset:number)=>{const d=new Date(start+"T12:00:00");if(Number.isNaN(d.getTime()))return "";let count=0;while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);while(count<offset){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)count++;}return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});};
const gbp = (n:number) => new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);
const num = (n:number) => Number.isFinite(n) ? Math.max(0,n) : 0;
// On mobile, selecting the whole existing number lets typing replace it immediately.
// Blank inputs remain blank while editing, then normalise to zero on blur.
function selectNumberOnFocus(e:FocusEvent<HTMLInputElement>){e.currentTarget.select();}


// Keep the text draft independent of the calculated numeric value.
// Clearing a field must not immediately reinsert 0 on mobile.
function EditableNumber({value,onValueChange,min=0,max,step="any"}:{value:number;onValueChange:(value:number)=>void;min?:number;max?:number;step?:number|string}){
 const [draft,setDraft]=useState(String(value));
 const [editing,setEditing]=useState(false);
 useEffect(()=>{if(!editing)setDraft(String(value));},[value,editing]);
 return <input type="number" inputMode="decimal" min={min} max={max} step={step}
  value={draft} onFocus={e=>{setEditing(true);selectNumberOnFocus(e);}}
  onChange={e=>{const raw=e.target.value;setDraft(raw);if(raw.trim()!==""&&Number.isFinite(Number(raw)))onValueChange(Number(raw));}}
  onBlur={()=>{setEditing(false);const parsed=draft.trim()===""?0:Number(draft);const next=Number.isFinite(parsed)?Math.max(min,max===undefined?parsed:Math.min(max,parsed)):0;onValueChange(next);setDraft(String(next));}}/>;
}

export default function CommercialEstimator({contracts}:{contracts:{id:string;name:string;reference:string}[]}){
  const [areas,setAreas] = useState<Area[]>([initial]);
  const [other,setOther] = useState(1800);
  const [contingency,setContingency] = useState(5);
  const [target,setTarget] = useState(30);
  const [copied,setCopied] = useState(false);
  const [programmeCopied,setProgrammeCopied] = useState(false);
  const [programme,setProgramme] = useState<ProgrammeSettings>({contingencyDays:2,startDate:""});
  const [projectName,setProjectName] = useState("");
  const [contractId,setContractId] = useState("");
  const [saveState,setSaveState] = useState("");
  const [saving,setSaving] = useState(false);
  const [programmeNotes,setProgrammeNotes] = useState("");
  const [materialSettings,setMaterialSettings] = useState<MaterialSettings>({adhesiveBagPrice:25,adhesiveCoverage:4,adhesiveBagKg:20,backButterKgPerSqm:1.5,groutPackPrice:18,groutPackKg:5,groutDensity:1.6,groutWaste:10});
  const [supervisor,setSupervisor] = useState<SupervisorSettings>({mode:"full-time",dayRate:230,days:2,expenses:0});
  const setMaterial=(key:keyof MaterialSettings,value:number)=>setMaterialSettings(v=>({...v,[key]:value}));
  const setSuper=(key:keyof SupervisorSettings,value:string|number)=>setSupervisor(v=>({...v,[key]:value}));
  function edit(id:number,changes:Partial<Area>){setAreas(prev=>prev.map(a=>a.id===id?{...a,...changes}:a));}
  function add(){setAreas(prev=>[...prev,{...initial,id:Math.max(0,...prev.map(a=>a.id))+1,description:"New work area",sqm:50,sell:45,sub:22,output:30,workType:"custom"}]);}
  const figures=useMemo(()=>calculateEstimate(areas,other,contingency,target,materialSettings,supervisor,programme),[areas,other,contingency,target,materialSettings,supervisor,programme]);
  const programmeLines = figures.lines.reduce<{description:string;days:number;start:number;end:number;output:number;sqm:number;extra:number}[]>((acc,line)=>{const start=acc.length?acc[acc.length-1].end:0;return [...acc,{description:line.description,days:line.days,start,end:start+line.days,output:line.output,sqm:line.sqm,extra:line.daysExtra}];},[]);
  const siteProgramme = ["TileSPEC — SITE WORK PROGRAMME",projectName||"Project: to be confirmed",programme.startDate?"Planned start: "+workday(programme.startDate,0):"Start date: to be confirmed",...programmeLines.map((a,i)=>`${i+1}. ${a.description}: ${a.sqm} m² | ${a.output} m²/day planning output | ${a.days} working days${programme.startDate?` | ${workday(programme.startDate,a.start)} – ${workday(programme.startDate,a.end-1)}`:""}${a.extra?` | includes ${a.extra} finishing days`:""}`),`Planned work: ${figures.installationDays} working days`,`Programme allowance: ${figures.contingencyDays} working days`,`Total programme: ${figures.projectDays} working days`,programme.startDate&&figures.projectDays?`Target completion (including allowance): ${workday(programme.startDate,figures.projectDays-1)}`:"","Targets are planning allowances, not guaranteed daily output. Sequence and access to be confirmed on site. Record delays, quality concerns and changes promptly; do not sacrifice workmanship to meet targets."].filter(Boolean).join("\n");
  const summary = [
    "TileSPEC commercial tender estimate — draft only",
    ...figures.lines.map(a=>a.description+": "+a.sqm+"m² @ £"+a.sell+"/m²; subcontract "+(a.mode==="metre"?"£"+a.sub+"/m²":"£"+a.gangDay+"/day")+"; "+a.days+" gang days"),
    "Revenue: "+gbp(figures.revenue),"Subcontract labour: "+gbp(figures.labour),
    "Fixing materials: "+gbp(figures.materials),"Supervisor: "+figures.supervisorAttendance+" days, "+gbp(figures.supervisorCost),"Other costs: "+gbp(other),
    "Contingency reserve: "+gbp(figures.reserve),"Estimated profit: "+gbp(figures.profit),
    "Estimated margin: "+figures.margin.toFixed(1)+"%","Excludes VAT. Not a customer quotation."
  ].join("\n");
  return <div className={styles.page}>
    <header className={styles.header}><Link href="/admin" className={styles.brand}>TileSPEC <span> / COMMERCIAL ADMIN</span></Link><span className={styles.flag}>Authenticated draft · unsaved estimate</span></header>
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>INTERNAL PRICING TOOL</p>
      <h1>Commercial tender estimator</h1>
      <p className={styles.intro}>Price work by area. Compare subcontractor £/m² with gang day rates, and see the margin before submitting a tender. Figures are editable assumptions, not market benchmarks.</p>
      <div className={styles.metrics}>
        <div><span>Contract value</span><strong>{gbp(figures.revenue)}</strong></div>
        <div><span>Estimated profit</span><strong>{gbp(figures.profit)}</strong></div>
        <div><span>Profit margin</span><strong className={figures.margin<target?styles.warning:""}>{figures.margin.toFixed(1)}%</strong></div>
      </div>
      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>Work areas</h2><button className={styles.add} onClick={add}>+ Add area</button></div>
        {areas.map(a=>{
          const line=figures.lines.find(l=>l.id===a.id)!;
          return <article className={styles.area} key={a.id}>
            <div className={styles.areaTop}><label className={styles.grow}>Area / description<input aria-label="Area description" value={a.description} onChange={e=>edit(a.id,{description:e.target.value})}/></label><button className={styles.remove} disabled={areas.length===1} onClick={()=>setAreas(v=>v.filter(x=>x.id!==a.id))}>Remove</button></div>
            <div className={styles.fields}>
              <label>Quantity (m²)<EditableNumber min={0} step="any" value={a.sqm} onValueChange={value=>edit(a.id,{sqm:num(Number(value))})}/></label>
              <label>TileSPEC sell (£/m²)<EditableNumber min={0} step="any" value={a.sell} onValueChange={value=>edit(a.id,{sell:num(Number(value))})}/></label>
              <label>Fixing materials (£/m²)<EditableNumber min={0} step="any" value={a.materials} onValueChange={value=>edit(a.id,{materials:num(Number(value))})}/></label>
              <label>Back-butter large format <input type="checkbox" checked={!!a.backButter} onChange={e=>edit(a.id,{backButter:e.target.checked})}/></label>
              {(["lengthMm","widthMm","depthMm","jointMm"] as const).map(k=><label key={k}>{({lengthMm:"Tile length mm",widthMm:"Tile width mm",depthMm:"Joint depth mm",jointMm:"Joint width mm"} as const)[k]}<EditableNumber min={0} value={a[k]??0} onValueChange={value=>edit(a.id,{[k]:num(Number(value))})}/></label>)}
              <label>Work type / planning benchmark<select value={a.workType??"custom"} onChange={e=>{const p=presets.find(p=>p.value===e.target.value);if(p)edit(a.id,{workType:p.value,...(p.output?{output:p.output}:{})});}}>{presets.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
              <label>Gang output (m²/day)<EditableNumber min={1} step="any" value={a.output} onValueChange={value=>edit(a.id,{output:Math.max(1,num(Number(value))),workType:"custom"})}/></label>
            </div>
            <div className={styles.payment}>
              <label>Subcontractor payment <select value={a.mode} onChange={e=>edit(a.id,{mode:e.target.value as Area["mode"]})}><option value="metre">Price work — per m²</option><option value="day">Gang day rate</option></select></label>
              {a.mode==="metre"?<label>Subcontract gang (£/m²)<EditableNumber min={0} step="any" value={a.sub} onValueChange={value=>edit(a.id,{sub:num(Number(value))})}/></label>:<label>Whole gang (£/day)<EditableNumber min={0} step="any" value={a.gangDay} onValueChange={value=>edit(a.id,{gangDay:num(Number(value))})}/></label>}
              <label>Extra finishing days<EditableNumber min={0} step="1" value={a.daysExtra} onValueChange={value=>edit(a.id,{daysExtra:Math.floor(num(Number(value)))})}/></label>
            </div>
            <div className={styles.areaTotals}><span>Estimated gang days <b>{line.days}</b></span><span>Subcontract labour <b>{gbp(line.labour)}</b></span><span>Adhesive <b>{line.adhesiveBags} bags</b></span><span>Grout <b>{line.groutPacks} packs</b></span><span>Area revenue <b>{gbp(line.revenue)}</b></span></div>
          </article>;
        })}
      </section>
      <section className={styles.section}>
        <h2>Direct materials and supervision</h2>
        <p className={styles.note}>Draft assumptions only. Supplier prices and grout geometry must be verified. Existing fixing materials £/m² must exclude adhesive and grout to avoid double counting. Unsurveyed substrates remain provisional.</p>
        <div className={styles.fields}>
          {(["adhesiveBagPrice","adhesiveCoverage","adhesiveBagKg","backButterKgPerSqm","groutPackPrice","groutPackKg","groutDensity","groutWaste"] as const).map(k=><label key={k}>{({adhesiveBagPrice:"Adhesive £/bag",adhesiveCoverage:"Standard m²/bag",adhesiveBagKg:"Adhesive kg/bag",backButterKgPerSqm:"Extra back-butter kg/m²",groutPackPrice:"Grout £/pack",groutPackKg:"Grout kg/pack",groutDensity:"Grout density factor",groutWaste:"Grout wastage %"} as const)[k]}<EditableNumber min={0} step="any" value={materialSettings[k]} onValueChange={value=>setMaterial(k,num(Number(value)))}/></label>)}
          <label>Supervisor mode<select value={supervisor.mode} onChange={e=>setSuper("mode",e.target.value)}><option value="visiting">Visiting</option><option value="full-time">Full-time</option><option value="manual">Manual</option></select></label>
          {supervisor.mode==="manual"&&<label>Supervisor days<EditableNumber min={0} step="0.5" value={supervisor.days??0} onValueChange={value=>setSuper("days",num(Number(value)))}/></label>}
          <label>Supervisor £/day<EditableNumber min={0} value={supervisor.dayRate} onValueChange={value=>setSuper("dayRate",num(Number(value)))}/></label>
          <label>Supervisor expenses £<EditableNumber min={0} value={supervisor.expenses} onValueChange={value=>setSuper("expenses",num(Number(value)))}/></label>
        </div>
        <p className={styles.note}>Installation {figures.installationDays} days + {figures.contingencyDays} programme allowance days = {figures.projectDays} planned days; supervisor {figures.supervisorAttendance} chargeable days. For projects over 20 days, confirm attendance manually. Pre-start, in-progress and handover QA checks remain mandatory operational gates.</p>
        <h2>Project allowances</h2>
        <div className={styles.fields}>
          <label>Other project costs (£)<EditableNumber min={0} step="any" value={other} onValueChange={value=>setOther(num(Number(value)))}/></label>
          <label>Contingency (% of revenue)<EditableNumber min={0} max={100} step="any" value={contingency} onValueChange={value=>setContingency(Math.min(100,num(Number(value))))}/></label>
          <label>Target margin (%)<EditableNumber min={0} max={99} step="any" value={target} onValueChange={value=>setTarget(Math.min(99,num(Number(value))))}/></label>
        </div>
        <p className={styles.note}>Other costs should include travel, accommodation, equipment, insurance, overhead allocation and any separately paid preparation or finishing. Price-work mode assumes the agreed subcontract rate covers the specified measured work.</p>
      </section>
      <section className={styles.section}>
        <h2>Site programme</h2>
        <p className={styles.note}>A separate cost-free programme for the supervisor or main contractor. Work areas are sequenced in the order shown above, one after another. Dates assume Monday–Friday working and no bank holidays, access delays or overlapping gangs. Finishing days should include cuts, grouting and snagging where they are not already allowed in daily output.</p>
        <div className={styles.fields}>
          <label>Project / site<input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project name"/></label>
          <label>Start date<input type="date" value={programme.startDate??""} onChange={e=>setProgramme(p=>({...p,startDate:e.target.value}))}/></label>
          <label>Programme contingency (working days)<EditableNumber min={0} step="1" value={programme.contingencyDays} onValueChange={value=>setProgramme(p=>({...p,contingencyDays:Math.floor(num(value))}))}/></label>
        </div>
        <div className={styles.areaTotals}><span>Installation <b>{figures.installationDays} days</b></span><span>Contingency <b>{figures.contingencyDays} days</b></span><span>Total planned <b>{figures.projectDays} days</b></span>{programme.startDate&&figures.projectDays>0&&<span>Target finish <b>{workday(programme.startDate,figures.projectDays-1)}</b></span>}</div>
        <div className={styles.programmePreview}><h3>TileSPEC — Site work programme</h3><p>{projectName||"Project to be confirmed"}</p>{programmeLines.map((a,i)=><div key={i} className={styles.programmeRow}><strong>{i+1}. {a.description}</strong><span>{a.sqm} m² · {a.output} m²/day · {a.days} working days</span>{programme.startDate&&<span>{workday(programme.startDate,a.start)} – {workday(programme.startDate,a.end-1)}</span>}</div>)}<p>Contingency: {figures.contingencyDays} days. Total: {figures.projectDays} working days.</p><p>Maintain quality and report delays or access problems promptly. Daily targets are guidelines, not permission to rush.</p></div>
        <div className={styles.fields} style={{marginTop:24}}>
          <label>File against existing contract<select value={contractId} onChange={e=>{setContractId(e.target.value);setSaveState("");}}><option value="">Choose a contract</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.reference} — {c.name}</option>)}</select></label>
          <label>Programme notes<input value={programmeNotes} onChange={e=>setProgrammeNotes(e.target.value)} placeholder="Access, sequencing, working hours"/></label>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:16}}>
          <button className={styles.copy} disabled={saving||!contractId} onClick={async()=>{setSaving(true);try{const r=await saveSiteProgramme({contractId,title:projectName||contracts.find(c=>c.id===contractId)?.name||"Site programme",startDate:programme.startDate||"",contingencyDays:programme.contingencyDays,items:programmeLines.map(a=>({description:a.description,sqm:a.sqm,output:a.output,days:a.days,extra:a.extra})),notes:programmeNotes,issue:false});setSaveState(r.error||"Saved draft revision "+r.revision);}catch{setSaveState("Save failed");}finally{setSaving(false);}}}>Save draft revision</button>
          <button className={styles.copy} disabled={saving||!contractId||!programme.startDate} onClick={async()=>{setSaving(true);try{const r=await saveSiteProgramme({contractId,title:projectName||contracts.find(c=>c.id===contractId)?.name||"Site programme",startDate:programme.startDate||"",contingencyDays:programme.contingencyDays,items:programmeLines.map(a=>({description:a.description,sqm:a.sqm,output:a.output,days:a.days,extra:a.extra})),notes:programmeNotes,issue:true});setSaveState(r.error||"Issued revision "+r.revision+" to assigned site staff");}catch{setSaveState("Issue failed");}finally{setSaving(false);}}}>Issue programme revision</button>
        </div>
        {saveState&&<p role="status" className={styles.note}>{saveState}</p>}
        <button className={styles.copy} onClick={async()=>{try{await navigator.clipboard.writeText(siteProgramme);setProgrammeCopied(true)}catch{setProgrammeCopied(false)}}}>{programmeCopied?"Programme copied":"Copy supervisor programme"}</button>
        <p className={styles.note}>The copied programme contains no prices, wages, margin or financial information. It is a draft for review before issue.</p>
      </section>
      <section className={styles.section}>
        <h2>Commercial viability</h2>
        <div className={styles.breakdown}>
          <div><span>Contract value</span><b>{gbp(figures.revenue)}</b></div>
          <div><span>Subcontract labour</span><b>{gbp(figures.labour)}</b></div>
          <div><span>Fixing materials</span><b>{gbp(figures.materials)}</b></div>
          <div><span>Supervisor cost</span><b>{gbp(figures.supervisorCost)}</b></div><div><span>Other project costs</span><b>{gbp(other)}</b></div>
          <div><span>Contingency reserve</span><b>{gbp(figures.reserve)}</b></div>
          <div className={styles.total}><span>Estimated profit</span><b>{gbp(figures.profit)}</b></div>
          <div><span>Break-even contract value</span><b>{Number.isFinite(figures.breakEven)?gbp(figures.breakEven):"Not achievable"}</b></div>
          <div><span>Revenue needed for {target}% margin</span><b>{Number.isFinite(figures.required)?gbp(figures.required):"Not achievable"}</b></div>
        </div>
        <button className={styles.copy} onClick={async()=>{try{await navigator.clipboard.writeText(summary);setCopied(true)}catch{setCopied(false)}}}>{copied?"Copied estimate":"Copy estimate"}</button>
        <p className={styles.note}>Ex VAT. Estimated profit assumes every entered cost is complete and correctly allocated. Gang days are rounded up for each work area; the estimate does not account for shared mobilisation between areas. Estimate inputs are unsaved and reset when you leave this page. Copy an estimate to retain your draft.</p>
      </section>
    </div>
  </div>;
}
