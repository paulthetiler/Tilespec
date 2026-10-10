"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type Area = { id: number; description: string; sqm: number; sell: number; sub: number; output: number; daysExtra: number; materials: number; mode: "metre" | "day"; gangDay: number; outputBasis: "gang" | "tiler"; tilers: number };
const initial: Area = { id: 1, description: "Open commercial floor", sqm: 500, sell: 40, sub: 20, output: 60, daysExtra: 0, materials: 7, mode: "metre", gangDay: 600, outputBasis: "gang", tilers: 2 };
const gbp = (n:number) => new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);
const num = (n:number) => Number.isFinite(n) ? Math.max(0,n) : 0;

export default function CommercialEstimator(){
  const [areas,setAreas] = useState<Area[]>([initial]);
  const [other,setOther] = useState(1800);
  const [dailyCosts,setDailyCosts] = useState(0);
  const [programmeExtra,setProgrammeExtra] = useState(0);
  const [contingency,setContingency] = useState(5);
  const [target,setTarget] = useState(30);
  const [copied,setCopied] = useState(false);
  function edit(id:number,changes:Partial<Area>){setAreas(prev=>prev.map(a=>a.id===id?{...a,...changes}:a));}
  function add(){setAreas(prev=>[...prev,{...initial,id:Math.max(0,...prev.map(a=>a.id))+1,description:"Bathroom / washroom area — enter agreed rate",sqm:50,sell:0,sub:0,output:20}]);}
  const figures=useMemo(()=>{
    const lines=areas.map(a=>{
      const dailyOutput=a.output*(a.outputBasis==="tiler"?Math.max(1,a.tilers):1);
      const days=a.sqm>0?Math.ceil(a.sqm/Math.max(1,dailyOutput))+a.daysExtra:0;
      const revenue=a.sqm*a.sell;
      const labour=a.mode==="metre"?a.sqm*a.sub:days*a.gangDay;
      const material=a.sqm*a.materials;
      return {...a,dailyOutput,days,revenue,labour,material};
    });
    const revenue=lines.reduce((v,a)=>v+a.revenue,0);
    const labour=lines.reduce((v,a)=>v+a.labour,0);
    const materials=lines.reduce((v,a)=>v+a.material,0);
    const programmeDays=Math.max(0,...lines.map(a=>a.days))+programmeExtra;
    const timeCosts=programmeDays*dailyCosts;
    const reserve=revenue*contingency/100;
    const costs=labour+materials+other+timeCosts+reserve;
    const profit=revenue-costs;
    const margin=revenue>0?100*profit/revenue:0;
    const breakEven=contingency<100?(labour+materials+other+timeCosts)/(1-contingency/100):Infinity;
    const required=target+contingency<100?(labour+materials+other+timeCosts)/(1-(target+contingency)/100):Infinity;
    return {lines,revenue,labour,materials,reserve,costs,profit,margin,breakEven,required,programmeDays,timeCosts};
  },[areas,other,dailyCosts,programmeExtra,contingency,target]);
  const summary = [
    "TileSPEC commercial tender estimate — draft only",
    ...figures.lines.map(a=>a.description+": "+a.sqm+"m² @ £"+a.sell+"/m²; subcontract "+(a.mode==="metre"?"£"+a.sub+"/m²":"£"+a.gangDay+"/day")+"; "+a.days+" gang days"),
    "Revenue: "+gbp(figures.revenue),"Subcontract labour: "+gbp(figures.labour),
    "Fixing materials: "+gbp(figures.materials),"Other costs: "+gbp(other),"Programme-dependent costs: "+gbp(figures.timeCosts),
    "Contingency reserve: "+gbp(figures.reserve),"Estimated profit: "+gbp(figures.profit),
    "Estimated margin: "+figures.margin.toFixed(1)+"%","Excludes VAT. Not a customer quotation."
  ].join("\n");
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>TileSPEC <span> / ADMIN PROTOTYPE</span></Link><span className={styles.flag}>Preview only · no login or saved jobs</span></header>
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>INTERNAL PRICING TOOL</p>
      <h1>Commercial tender estimator</h1>
      <p className={styles.intro}>Enter your selling rate and agreed subcontract rate separately. Pricework labour is fixed by measured area, while programme-dependent costs change with duration. Defaults are editable scenarios, not verified market rates.</p>
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
              <label>Quantity (m²)<input type="number" min="0" step="any" value={a.sqm} onChange={e=>edit(a.id,{sqm:num(Number(e.target.value))})}/></label>
              <label>TileSPEC sell (£/m²)<input type="number" min="0" step="any" value={a.sell} onChange={e=>edit(a.id,{sell:num(Number(e.target.value))})}/></label>
              <label>Fixing materials (£/m²)<input type="number" min="0" step="any" value={a.materials} onChange={e=>edit(a.id,{materials:num(Number(e.target.value))})}/></label>
              <label>Planning output (m²/day, selected basis)<input type="number" min="1" step="any" value={a.output} onChange={e=>edit(a.id,{output:Math.max(1,num(Number(e.target.value)))})}/></label>
            </div>
            <div className={styles.payment}>
              <label>Output measured per <select value={a.outputBasis} onChange={e=>edit(a.id,{outputBasis:e.target.value as Area["outputBasis"]})}><option value="gang">Whole gang / team</option><option value="tiler">Individual tiler</option></select></label>
              {a.outputBasis==="tiler"&&<label>Number of tilers (excluding labourers)<input type="number" min="1" step="1" value={a.tilers} onChange={e=>edit(a.id,{tilers:Math.max(1,Math.floor(num(Number(e.target.value))))})}/></label>}
            </div>
            <div className={styles.payment}>
              <label>Subcontractor payment <select value={a.mode} onChange={e=>edit(a.id,{mode:e.target.value as Area["mode"]})}><option value="metre">Price work — per m²</option><option value="day">Gang day rate</option></select></label>
              {a.mode==="metre"?<label>Subcontract gang (£/m²)<input type="number" min="0" step="any" value={a.sub} onChange={e=>edit(a.id,{sub:num(Number(e.target.value))})}/></label>:<label>Whole gang (£/day)<input type="number" min="0" step="any" value={a.gangDay} onChange={e=>edit(a.id,{gangDay:num(Number(e.target.value))})}/></label>}
              <label>Extra grouting / finishing days<input type="number" min="0" step="1" value={a.daysExtra} onChange={e=>edit(a.id,{daysExtra:Math.floor(num(Number(e.target.value)))})}/></label>
            </div>
            <div className={styles.areaTotals}><span>Combined planned output <b>{line.dailyOutput}m²/day</b></span><span>Estimated site days <b>{line.days}</b></span><span>Subcontract labour <b>{gbp(line.labour)}</b></span><span>Area revenue <b>{gbp(line.revenue)}</b></span></div>
          </article>;
        })}
      </section>
      <section className={styles.section}>
        <h2>Project allowances and programme</h2>
        <div className={styles.fields}>
          <label>Other project costs (£)<input type="number" min="0" step="any" value={other} onChange={e=>setOther(num(Number(e.target.value)))}/></label>
          <label>Contingency (% of revenue)<input type="number" min="0" max="100" step="any" value={contingency} onChange={e=>setContingency(Math.min(100,num(Number(e.target.value))))}/></label>
          <label>Target margin (%)<input type="number" min="0" max="99" step="any" value={target} onChange={e=>setTarget(Math.min(99,num(Number(e.target.value))))}/></label>
        </div>
        <div className={styles.fields}><label>Programme-dependent costs (£/site day)<input type="number" min="0" step="any" value={dailyCosts} onChange={e=>setDailyCosts(num(Number(e.target.value)))}/></label><label>Extra project delay days<input type="number" min="0" step="1" value={programmeExtra} onChange={e=>setProgrammeExtra(Math.floor(num(Number(e.target.value))))}/></label></div>
        <p className={styles.note}>Programme allowance: {figures.programmeDays} site days. Daily costs might include paid supervision, hire, accommodation or other time-dependent expenses. The programme assumes areas run concurrently; adjust for sequential phases. Fixed costs should include travel, mobilisation, insurance, overhead allocation and separately paid preparation. Do not enter the same cost twice. In pricework mode, slower installation does not increase the agreed measured labour payment; day-rate mode does.</p>
      </section>
      <section className={styles.section}>
        <h2>Commercial viability</h2>
        <div className={styles.breakdown}>
          <div><span>Contract value</span><b>{gbp(figures.revenue)}</b></div>
          <div><span>Subcontract labour</span><b>{gbp(figures.labour)}</b></div>
          <div><span>Fixing materials</span><b>{gbp(figures.materials)}</b></div>
          <div><span>Other fixed project costs</span><b>{gbp(other)}</b></div>
          <div><span>Programme costs ({figures.programmeDays} days)</span><b>{gbp(figures.timeCosts)}</b></div>
          <div><span>Contingency reserve</span><b>{gbp(figures.reserve)}</b></div>
          <div className={styles.total}><span>Estimated profit</span><b>{gbp(figures.profit)}</b></div>
          <div><span>Break-even contract value</span><b>{Number.isFinite(figures.breakEven)?gbp(figures.breakEven):"Not achievable"}</b></div>
          <div><span>Revenue needed for {target}% margin</span><b>{Number.isFinite(figures.required)?gbp(figures.required):"Not achievable"}</b></div>
        </div>
        <button className={styles.copy} onClick={async()=>{try{await navigator.clipboard.writeText(summary);setCopied(true)}catch{setCopied(false)}}}>{copied?"Copied estimate":"Copy estimate"}</button>
        <p className={styles.note}>Ex VAT. Estimated profit assumes every entered cost is complete and correctly allocated. Gang days are rounded up per work area. Output can be entered for a whole team or per tiler (labourers excluded from the tiler multiplier). Programme duration assumes concurrent areas; revise if sequential. The displayed profit is a project estimate, not company net profit or distributable earnings. No data is saved or transmitted by this prototype.</p>
      </section>
    </div>
  </main>;
}
