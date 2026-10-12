"use client";

import { useMemo, useState, useEffect, type FocusEvent } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { calculateEstimate, type EstimateArea, type CostArea, type MaterialSettings, type SupervisorSettings } from "@/lib/estimator";

type Area = CostArea;
const initial: Area = { id: 1, description: "Open commercial floor", sqm: 500, sell: 35, sub: 17, output: 70, daysExtra: 0, materials: 7, mode: "metre", gangDay: 600, lengthMm:600, widthMm:600, depthMm:10, jointMm:3, backButter:false };
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

export default function CommercialEstimator(){
  const [areas,setAreas] = useState<Area[]>([initial]);
  const [other,setOther] = useState(1800);
  const [contingency,setContingency] = useState(5);
  const [target,setTarget] = useState(30);
  const [copied,setCopied] = useState(false);
  const [materialSettings,setMaterialSettings] = useState<MaterialSettings>({adhesiveBagPrice:25,adhesiveCoverage:4,adhesiveBagKg:20,backButterKgPerSqm:1.5,groutPackPrice:18,groutPackKg:5,groutDensity:1.6,groutWaste:10});
  const [supervisor,setSupervisor] = useState<SupervisorSettings>({mode:"visiting",dayRate:230,days:2,expenses:0});
  const setMaterial=(key:keyof MaterialSettings,value:number)=>setMaterialSettings(v=>({...v,[key]:value}));
  const setSuper=(key:keyof SupervisorSettings,value:string|number)=>setSupervisor(v=>({...v,[key]:value}));
  function edit(id:number,changes:Partial<Area>){setAreas(prev=>prev.map(a=>a.id===id?{...a,...changes}:a));}
  function add(){setAreas(prev=>[...prev,{...initial,id:Math.max(0,...prev.map(a=>a.id))+1,description:"New work area",sqm:50,sell:45,sub:22,output:30}]);}
  const figures=useMemo(()=>calculateEstimate(areas,other,contingency,target,materialSettings,supervisor),[areas,other,contingency,target,materialSettings,supervisor]);
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
              <label>Gang output (m²/day)<EditableNumber min={1} step="any" value={a.output} onValueChange={value=>edit(a.id,{output:Math.max(1,num(Number(value)))})}/></label>
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
        <p className={styles.note}>Project {figures.projectDays} gang-days; supervisor {figures.supervisorAttendance} chargeable days. For projects over 20 days, confirm attendance manually. Pre-start, in-progress and handover QA checks remain mandatory operational gates.</p>
        <h2>Project allowances</h2>
        <div className={styles.fields}>
          <label>Other project costs (£)<EditableNumber min={0} step="any" value={other} onValueChange={value=>setOther(num(Number(value)))}/></label>
          <label>Contingency (% of revenue)<EditableNumber min={0} max={100} step="any" value={contingency} onValueChange={value=>setContingency(Math.min(100,num(Number(value))))}/></label>
          <label>Target margin (%)<EditableNumber min={0} max={99} step="any" value={target} onValueChange={value=>setTarget(Math.min(99,num(Number(value))))}/></label>
        </div>
        <p className={styles.note}>Other costs should include travel, accommodation, equipment, insurance, overhead allocation and any separately paid preparation or finishing. Price-work mode assumes the agreed subcontract rate covers the specified measured work.</p>
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
