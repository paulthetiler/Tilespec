import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { checkRpc, contractsFor, locationsFor } from "@/lib/operations/data";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { ConnectionStatus } from "@/components/site/connection-status";
import { CreateSnag } from "@/components/snags/create-snag";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import styles from "../../admin.module.css";
export const dynamic="force-dynamic";
export default async function NewSnag({searchParams}:{searchParams:Promise<{contract?:string;location?:string;inspection?:string}>}) {
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role)) return <p>Only assigned supervisors and the office can raise snags. <Link href="/admin/snags">Open assigned snags</Link></p>;
 const q=await searchParams,contracts=await contractsFor(supabase),contract=contracts.find(c=>c.id===q.contract);
 if(q.contract&&!contract) notFound();
 if(!contract) return <><h1 className={styles.title}>Raise snag</h1><form className={styles.form} method="get"><label>Site<select name="contract" required defaultValue=""><option value="">Choose site</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.reference} · {c.name}</option>)}</select></label><button className={styles.button}>Choose site</button></form></>;
 const locations=await locationsFor(supabase,contract.id),index=indexLocations(locations);
 const packages=await supabase.from("work_packages").select("id,name,work_area_id").eq("contract_id",contract.id);checkRpc(packages.error);
 let linked:{id:string;locationId:string;stage:string;description:string}|undefined;
 if(q.inspection) {
  if(!/^[0-9a-f-]{36}$/i.test(q.inspection)) notFound();
  const record=await supabase.from("location_inspections").select("id,work_area_id,template_id,issues_count,answers").eq("id",q.inspection).eq("contract_id",contract.id).maybeSingle();checkRpc(record.error);
  if(!record.data||record.data.issues_count===0) notFound();
  const template=await supabase.from("location_inspection_templates").select("stage").eq("id",record.data.template_id).single();checkRpc(template.error);
  if(!template.data) notFound();
  linked={id:record.data.id,locationId:record.data.work_area_id,stage:template.data.stage,description:record.data.answers.filter((a:{status:string})=>a.status==="issue").map((a:{item:string;note:string})=>`${a.item}: ${a.note}`).join("\n")};
 }
 const simple=member.role==="supervisor";
 return <><ConnectionStatus/><p><Link href={simple?`/admin/supervisor/sites/${contract.id}`:`/admin/snags?contract_id=${contract.id}`}>{simple?"← Today":"← Snag register"}</Link></p><h1 className={styles.title}>Raise a snag</h1>
  <p><strong>{contract.name}</strong></p>{simple?<p>Show the office where the problem is and what needs attention.</p>:<p>Urgent snag reporting is always available, before or after morning checks. Critical findings require immediate office review; this does not grant a stop-work hold.</p>}
  <CreateSnag contractId={contract.id} locations={locations} packages={(packages.data||[]).map(p=>({id:p.id,label:`${p.name} · ${locationPath(index,p.work_area_id)}`}))}
   requestKey={randomUUID()} submitKey={randomUUID()} proposalKey={randomUUID()} inspection={linked} initialLocation={locations.find(l=>l.id===q.location&&!l.archived_at)?.id} simple={simple} offerStop={!(simple&&flagEnabled("nextActions",member.role))}/>
 </>;
}
