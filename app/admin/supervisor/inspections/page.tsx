import Link from "next/link";
import { requireActor } from "@/lib/auth";
import IssueQueue from "./issue-queue";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function InspectionQueue({searchParams}:{searchParams:Promise<{contract?:string|string[]}>}){
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role))return <main><p>Access denied.</p></main>;
 // Opened from a site, the queue shows that site only.
 const requested=(await searchParams).contract;
 const contract=typeof requested==="string"&&uuid.test(requested)?requested:null;
 let issuesQuery=supabase.from("supervisor_issues").select("id,contract_id,inspection_id,check_label,description,state,created_at,rectified_by").order("created_at",{ascending:false}).limit(200);
 let inspectionsQuery=supabase.from("supervisor_inspections").select("id,contract_id,created_at,issues_count").order("created_at",{ascending:false}).limit(50);
 if(contract){issuesQuery=issuesQuery.eq("contract_id",contract);inspectionsQuery=inspectionsQuery.eq("contract_id",contract);}
 const [issues,inspections]=await Promise.all([issuesQuery,inspectionsQuery]);
 return <main style={{maxWidth:900,margin:"0 auto",padding:20}}>
 <p><Link href={contract?`/admin/supervisor/sites/${contract}`:"/admin/supervisor"}>{contract?"← Site dashboard":"← Supervisor hub"}</Link></p>
 <h1>Outstanding issues & inspections</h1>
 <p>Issues remain on hold until an authorised independent reinspection closes them. Submission alone does not release work or approve payment.</p>
 {issues.error?<p role="alert">Issue register unavailable. Check database migration and permissions.</p>:<IssueQueue initial={issues.data||[]} role={member.role} userId={member.user_id}/>}
 <h2>Recent inspection submissions</h2>
 {inspections.error?<p role="alert">Inspection history unavailable.</p>:inspections.data?.map(i=><p key={i.id}>{new Date(i.created_at).toLocaleString("en-GB")} · {i.contract_id} · {i.issues_count} issue(s) · {i.id}</p>)}
 </main>;
}
