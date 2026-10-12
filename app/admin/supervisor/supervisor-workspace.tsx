"use client";
import { useState } from "react";
import SiteWorkflowPreview from "./site-workflow-preview";

type Area={id:string;name:string;location:string;substrate_notes:string;system_notes:string;specification_revision:string};
type Doc={id:string;title:string;document_reference:string;revision:string};
type Contract={id:string;reference:string;name:string;address:string;client:string;site_contact:string;scope:string;exclusions:string;tile_specification:string;installation_system:string;access_restrictions:string;working_hours:string;areas:Area[];docs:Doc[]};
const card:React.CSSProperties={border:"1px solid #d5e0e4",borderRadius:12,padding:16,background:"#fff",minWidth:0,overflowWrap:"anywhere"};
const button:React.CSSProperties={minHeight:48,border:"1px solid #9fb8bd",borderRadius:9,background:"#fff",padding:"10px 14px",fontWeight:700,color:"#0f2a3a",cursor:"pointer"};
export default function SupervisorWorkspace({contracts,role,displayName}:{contracts:Contract[];role:string;displayName:string}){
 const [selected,setSelected]=useState<string|null>(null);
 const [tab,setTab]=useState("dashboard");
 const contract=contracts.find(c=>c.id===selected);
 if(!contract)return <section>
  <h1>Choose your site</h1><p>Welcome, {displayName}. Select the contract you are working on. {role==="owner"?"As owner you can switch between available sites.":""}</p>
  {contracts.length===0?<p>No contracts available. Ask an owner to assign a contract.</p>:<div style={{display:"grid",gap:12}}>
   {contracts.map(c=><button key={c.id} onClick={()=>{setSelected(c.id);setTab("dashboard")}} style={{...card,textAlign:"left",cursor:"pointer",width:"100%",color:"#0f2a3a"}}>
    <strong style={{fontSize:17}}>{c.name}</strong><p>{c.reference} · {c.address}</p><span>{c.areas.length} work areas → Open dashboard</span>
   </button>)}
  </div>}
 </section>;
 const sections=[["dashboard","Dashboard"],["checks","Daily checks"],["areas","Work areas"],["docs","Drawings & RAMS"],["diary","Daily diary"]];
 return <section style={{minWidth:0}}>
  <button style={button} onClick={()=>{setSelected(null);setTab("dashboard")}}>← Change site</button>
  <h1 style={{overflowWrap:"anywhere"}}>{contract.name}</h1><p>{contract.reference} · {contract.address}</p>
  <nav aria-label="Site workspace" style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:12}}>
   {sections.map(([key,label])=><button key={key} style={{...button,whiteSpace:"nowrap",background:tab===key?"#0f2a3a":"#fff",color:tab===key?"#fff":"#0f2a3a"}} onClick={()=>setTab(key)}>{label}</button>)}
  </nav>
  {tab==="dashboard"&&<div style={{display:"grid",gap:12}}>
   <div style={card}><h2>Today's site</h2><p>Start with the morning checks. Record issues against this site before proceeding.</p><button style={button} onClick={()=>setTab("checks")}>Start daily checks →</button></div>
   <div style={card}><h2>Inspection records</h2><p>Review saved inspections and outstanding issues.</p><a href="/admin/supervisor/inspections">View inspection history & issues →</a></div>
   <div style={card}><h2>Quick access</h2><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{sections.slice(1).map(([key,label])=><button key={key} style={button} onClick={()=>setTab(key)}>{label}</button>)}</div></div>
   <div style={card}><h2>Job information</h2>{[["Client",contract.client],["Site contact",contract.site_contact],["Scope",contract.scope],["Exclusions",contract.exclusions],["Tile specification",contract.tile_specification],["Installation system",contract.installation_system],["Access",contract.access_restrictions],["Working hours",contract.working_hours]].map(([k,v])=><p key={k}><strong>{k}:</strong> {v||"Not provided"}</p>)}</div>
  </div>}
  {tab==="checks"&&<SiteWorkflowPreview key={contract.id} contractId={contract.id} onNext={()=>setTab("dashboard")} areaNames={contract.areas.map(a=>a.name)} contractReference={contract.reference}/>}
  {tab==="areas"&&<div style={{display:"grid",gap:12}}>{contract.areas.map(a=><article key={a.id} style={card}><h2>{a.name}</h2><p>{a.location}</p><p><strong>Substrate:</strong> {a.substrate_notes}</p><p><strong>System:</strong> {a.system_notes}</p><p><strong>Revision:</strong> {a.specification_revision}</p><p><strong>Release blocked:</strong> Formal QA gates are not yet enabled.</p></article>)}</div>}
  {tab==="docs"&&<div style={card}><h2>Approved job-pack register</h2>{contract.docs.length?contract.docs.map(d=><p key={d.id}>{d.title} · {d.document_reference} · Rev {d.revision}</p>):<p>No approved operational documents uploaded.</p>}<p>Document download and approval are not yet enabled. Do not work from unverified drawings.</p></div>}
  {tab==="diary"&&<div style={card}><h2>Daily site diary</h2><p>Diary submissions, labour records and handovers are not yet enabled. This section will require saved, attributable entries before use on a live contract.</p></div>}
  <p style={{fontSize:12,color:"#52646d"}}>Signed in as {displayName} · {role}. Financial values are hidden in this hub.</p>
 </section>;
}
