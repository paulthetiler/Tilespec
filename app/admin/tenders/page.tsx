import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { requireActor } from "@/lib/auth";
import styles from "../admin.module.css";

export const dynamic="force-dynamic";
export default async function TenderInbox(){
 const {member}=await requireActor();
 if(member.role!=="owner"&&member.role!=="contracts_manager")return <p>Not authorised to view tender enquiries.</p>;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return <p>Tender inbox is awaiting secure storage configuration.</p>;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from("tender_enquiries").select("id,reference,kind,name,company,email,project,deadline,message,status,attachments,received_at").eq("status","received").order("received_at",{ascending:false}).limit(100);
 if(error)return <p>Tender inbox unavailable. Please check the migration and secure credentials.</p>;
 const entries=await Promise.all((data||[]).map(async e=>{
  const documents=await Promise.all(((e.attachments||[]) as {name:string;path:string}[]).map(async f=>{
   const {data:link}=await db.storage.from("tilespec-tenders").createSignedUrl(f.path,300);
   return {name:f.name,url:link?.signedUrl||""};
  }));
  return {...e,documents};
 }));
 return <><div className={styles.pageHeader}><div><p className={styles.eyebrow}>New business</p><h1 className={styles.title}>Tender enquiries</h1><p className={styles.description}>Received submissions and private document links. Files expire after five minutes; refresh to renew.</p></div><Link href="/admin" className={styles.secondaryButton}>Overview</Link></div>
 <section className={styles.panel}>{entries.length===0?<p>No completed enquiries have been received yet.</p>:entries.map(e=><article key={e.id} style={{padding:"24px 0",borderBottom:"1px solid #dce4e6"}}>
  <strong>{e.reference} · {e.project||"General enquiry"}</strong><p>{e.company||e.name} · {e.email}</p><p>Submitted: {e.received_at?new Date(e.received_at).toLocaleString("en-GB"):"Not confirmed"}{e.deadline?" · Return date: "+e.deadline:""}</p>{e.message&&<p style={{whiteSpace:"pre-wrap"}}>{e.message}</p>}
  {e.documents.length>0&&<div><strong>Documents</strong><ul>{e.documents.map((f,i)=><li key={i}>{f.url?<a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a>:f.name+" (temporarily unavailable)"}</li>)}</ul></div>}
 </article>)}</section></>;
