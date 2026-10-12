import Link from "next/link";
import { requireActor } from "@/lib/auth";
export const dynamic="force-dynamic";
export default async function InspectionQueue(){
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role)) return <main><p>Access denied.</p></main>;
 const {data,error}=await supabase.from("supervisor_inspections").select("id,contract_id,actor_id,created_at,issues_count,answers").order("created_at",{ascending:false}).limit(100);
 return <main style={{maxWidth:900,margin:"0 auto",padding:20}}>
  <p><Link href="/admin/supervisor">← Supervisor hub</Link></p><h1>Inspection history & outstanding issues</h1>
  <p>Issue records are awaiting office review. This queue does not authorise work release, resolve defects or apply deductions.</p>
  {error?<p role="alert">Inspections unavailable. Check database migration and permissions.</p>:
   !data?.length?<p>No inspections submitted yet.</p>:
   data.map(record=><article key={record.id} style={{border:"1px solid #ccd8dd",borderRadius:12,padding:16,marginBottom:12,background:"#fff"}}>
    <h2>{record.issues_count>0?"Action required":"Inspection recorded"}</h2>
    <p>Contract: {record.contract_id} · {new Date(record.created_at).toLocaleString("en-GB")} · Inspector: {record.actor_id}</p>
    <p>Inspection reference: {record.id}</p>
    {(record.answers as {item:string;status:string;note:string}[]).filter(a=>a.status==="issue").map(a=><p key={a.item}><strong>{a.item}</strong>: {a.note}</p>)}
   </article>)}
 </main>;
}
