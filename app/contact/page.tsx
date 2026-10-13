"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import "./contact.css";
import { ArrowUpRight, FileUp, Mail, ShieldCheck, X } from "lucide-react";

const maxFiles=10;
const maxFileSize=25*1024*1024;
const allowed=["pdf","dwg","dxf","doc","docx","xls","xlsx","zip","jpg","jpeg","png"];
type Stage = "idle"|"sending"|"done"|"error";

export default function ContactPage(){
 const [type,setType]=useState<"tender"|"general">("tender");
 const [files,setFiles]=useState<File[]>([]);
 const [stage,setStage]=useState<Stage>("idle");
 const [feedback,setFeedback]=useState("");
 const [reference,setReference]=useState("");
 function addFiles(input:FileList|null){
  if(!input)return;
  const next=[...files,...Array.from(input)].filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size)===i);
  if(next.length>maxFiles){setFeedback("Maximum 10 files per enquiry.");return;}
  const bad=next.find(f=>f.size>maxFileSize||!allowed.includes(f.name.split(".").pop()?.toLowerCase()||""));
  if(bad){setFeedback("Unsupported file or over 25 MB: "+bad.name);return;}
  setFeedback("");setFiles(next);
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setStage("sending");setFeedback("");
  const data=new FormData(e.currentTarget);
  const payload={kind:type,name:String(data.get("name")||"").trim(),company:String(data.get("company")||"").trim(),email:String(data.get("email")||"").trim(),project:String(data.get("project")||"").trim(),deadline:String(data.get("deadline")||""),message:String(data.get("message")||"").trim(),website:String(data.get("website")||""),files:files.map(f=>({name:f.name,size:f.size,type:f.type}))};
  try{
   const init=await fetch("/api/enquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await init.json();
   if(!init.ok)throw new Error(result.error||"Could not submit enquiry.");
   for(let i=0;i<files.length;i++){
    const item=result.uploads[i];
    const response=await fetch(item.url,{method:"PUT",headers:{"Content-Type":item.contentType},body:files[i]});
    if(!response.ok)throw new Error("File upload failed for "+files[i].name+". Please retry using the reference below.");
   }
   const confirm=await fetch("/api/enquiries/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:result.id,token:result.token})});
   const final=await confirm.json();
   if(!confirm.ok)throw new Error(final.error||"Submission could not be confirmed.");
   setReference(result.reference);setStage("done");setFiles([]);
  }catch(err){setStage("error");setFeedback(err instanceof Error?err.message:"Submission failed. Please try again.");}
 }
 return <main className="contact-page">
  <div className="contact-top"><Link href="/" className="contact-home">← TILESPEC HOME</Link><span>COMMERCIAL WALL & FLOOR TILING</span></div>
  <section className="contact-hero"><div className="shell"><div className="eyebrow light"><span className="eyebrow-line"/> GET IN TOUCH</div><h1>LET'S TALK<br/><em>PROJECTS.</em></h1><p>Send a tender package or get in touch about commercial wall and floor tiling. No registration or lengthy questionnaires.</p></div></section>
  <section className="contact-section"><div className="shell contact-layout"><div className="contact-explainer"><div className="eyebrow"><span className="eyebrow-line"/> STRAIGHTFORWARD ENQUIRIES</div><h2>YOUR PROJECT.<br/><em>THE ESSENTIALS.</em></h2><p>Send your drawings, specification and pricing schedule in one go. We'll review what you've supplied and get back to you.</p><div className="contact-benefit"><FileUp size={22}/> Drawings, specifications and schedules</div><div className="contact-benefit"><ShieldCheck size={22}/> Private document storage</div><div className="contact-benefit"><Mail size={22}/> A reference to follow up your enquiry</div><p className="contact-fallback">Already have a secure tender portal or a large document pack? Include your sharing link in the message instead.</p></div>
   <div className="contact-panel">{stage==="done"?<div role="status" className="contact-success"><ShieldCheck size={38}/><h2>ENQUIRY RECEIVED.</h2><p>Your reference is <strong>{reference}</strong>. Please keep it for follow-up.</p><button type="button" className="button button-dark" onClick={()=>{setStage("idle");setReference("");}}>SEND ANOTHER ENQUIRY <ArrowUpRight size={16}/></button></div>:<>
    <div className="contact-switch" role="group" aria-label="Enquiry type"><button type="button" aria-pressed={type==="tender"} className={type==="tender"?"selected":""} onClick={()=>setType("tender")}>SEND A TENDER</button><button type="button" aria-pressed={type==="general"} className={type==="general"?"selected":""} onClick={()=>setType("general")}>GENERAL ENQUIRY</button></div>
    <form onSubmit={submit} className="contact-form"><div className="form-row"><label>Your name *<input required name="name" maxLength={120} placeholder="Full name"/></label><label>Company<input name="company" maxLength={160} placeholder="Company name"/></label></div><label>Email address *<input required type="email" name="email" maxLength={200} placeholder="name@company.co.uk"/></label><label>Project name / location<input name="project" maxLength={200} placeholder="e.g. Retail fit-out, Manchester"/></label>{type==="tender"&&<label>Tender return date (optional)<input type="date" name="deadline"/></label>}
    <label>{type==="tender"?"Any details we should know?":"How can we help?"}<textarea name="message" rows={3} maxLength={3000} placeholder={type==="tender"?"Scope, programme, a secure document link, or anything else...":"Tell us a little about your enquiry..."}/></label>
    <label className="contact-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <div className="contact-upload"><strong>Attach documents (optional)</strong><label className="contact-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}><FileUp size={27}/><span>Drop documents here or browse files</span><small>PDF, DWG, DXF, Word, Excel, ZIP and images · 10 files · 25 MB each</small><input type="file" multiple accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png" onChange={e=>{addFiles(e.target.files);e.target.value="";}}/></label>
    {files.length>0&&<ul className="contact-files">{files.map(f=><li key={f.name+f.size}><span>{f.name} · {(f.size/1048576).toFixed(1)} MB</span><button type="button" aria-label={"Remove "+f.name} onClick={()=>setFiles(files.filter(x=>x!==f))}><X size={16}/></button></li>)}</ul>}</div>
    {feedback&&<p className="contact-error" role="alert">{feedback}</p>}
    <button className="button button-dark contact-submit" type="submit" disabled={stage==="sending"}>{stage==="sending"?"UPLOADING — PLEASE WAIT":type==="tender"?"SUBMIT TENDER ENQUIRY":"SEND ENQUIRY"} <ArrowUpRight size={18}/></button>
    <small className="contact-help">Don't close this page while uploading. You'll receive an on-screen reference only after submission is confirmed.</small>
    </form></>}</div></div></section>
  <footer className="contact-footer"><div className="shell"><span>© {new Date().getFullYear()} TileSPEC · Commercial Tiling Contractors</span><Link href="/">RETURN TO HOMEPAGE ↑</Link></div></footer>
 </main>;
}
