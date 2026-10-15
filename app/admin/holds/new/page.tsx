import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { contractsFor,locationsFor,checkRpc } from "@/lib/operations/data";
import { CreateHold } from "@/components/holds/create-hold";
import { ConnectionStatus } from "@/components/site/connection-status";
import styles from "../../admin.module.css";
export const dynamic="force-dynamic";
export default async function NewHold({searchParams}:{searchParams:Promise<{contract?:string;location?:string;stage?:string;snag?:string;inspection?:string;morning?:string}>}){
 const {supabase,member}=await requireActor();if(!["owner","contracts_manager","supervisor"].includes(member.role))return <><h1>Stop affected work</h1><p>Ask the assigned supervisor or office to record the hold. Follow the site’s immediate safety reporting procedure.</p><Link href="/admin/holds">Open assigned holds</Link></>;
 const q=await searchParams,contracts=await contractsFor(supabase),contract=contracts.find(c=>c.id===q.contract);if(q.contract&&!contract)notFound();
 if(!contract)return <><h1 className={styles.title}>Stop affected work</h1><form className={styles.form} method="get"><label>Site<select name="contract" required><option value="">Choose site</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.reference} · {c.name}</option>)}</select></label><button className={styles.bigButton}>Choose site</button></form></>;
 const locations=await locationsFor(supabase,contract.id),packages=await supabase.from("work_packages").select("id,name").eq("contract_id",contract.id);checkRpc(packages.error);
 let source:{key:string;id:string;label:string}|undefined,initialLocation=q.location,initialStage=q.stage,initialReason="";
 if([q.snag,q.inspection,q.morning].filter(Boolean).length>1)notFound();
 if(q.snag){const row=await supabase.from("supervisor_issues").select("id,description,work_area_id,stage").eq("id",q.snag).eq("contract_id",contract.id).maybeSingle();checkRpc(row.error);if(!row.data)notFound();source={key:"source_snag_id",id:row.data.id,label:"saved snag"};initialLocation=row.data.work_area_id;initialStage=row.data.stage;initialReason=row.data.description;}
 if(q.inspection){const row=await supabase.from("location_inspections").select("id,work_area_id,template_id,answers").eq("id",q.inspection).eq("contract_id",contract.id).maybeSingle();checkRpc(row.error);if(!row.data)notFound();const template=await supabase.from("location_inspection_templates").select("stage").eq("id",row.data.template_id).single();checkRpc(template.error);source={key:"source_inspection_id",id:row.data.id,label:"saved location inspection"};initialLocation=row.data.work_area_id;initialStage=template.data?.stage;initialReason=(row.data.answers as {status:string;item:string;note:string}[]).filter(a=>a.status==="issue"||((a as {mandatory?:boolean;hold_point?:boolean}).mandatory||(a as {hold_point?:boolean}).hold_point)&&a.status!=="pass").map(a=>`${a.item}: ${a.note}`).join("\n");}
 if(q.morning){const row=await supabase.from("supervisor_inspections").select("id").eq("id",q.morning).eq("contract_id",contract.id).maybeSingle();checkRpc(row.error);if(!row.data)notFound();source={key:"source_morning_inspection_id",id:row.data.id,label:"saved morning readiness check"};}
 return <><ConnectionStatus/><p><Link href={`/admin/supervisor/sites/${contract.id}`}>← Site dashboard</Link></p><h1 className={styles.title}>STOP AFFECTED WORK</h1><p>{contract.reference} · {contract.name}</p><CreateHold contract={contract.id} locations={locations} packages={packages.data||[]} requestKey={randomUUID()} initialLocation={locations.find(l=>l.id===initialLocation&&!l.archived_at)?.id} initialStage={initialStage} initialReason={initialReason} source={source}/></>;
}
