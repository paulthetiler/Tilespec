import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
const labels = [
 "HSE issues, hazards and site instructions reviewed",
 "Yesterday's work and outstanding snags reviewed",
 "Today's operatives and teams accounted for",
 "Tiles, adhesive, grout and consumables available",
 "Water, mixing area and materials positioned",
 "Access clear: scaffold, other trades and obstructions",
 "Substrates and missing boardwork checked",
 "Current drawings, setting out and work instructions reviewed",
 "Delays, variations and dayworks identified",
 "Team briefed and safe to start"
];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request) {
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role)) return NextResponse.json({error:"Forbidden"},{status:403});
 let payload:unknown;
 try { payload=await request.json(); } catch { return NextResponse.json({error:"Invalid JSON"},{status:400}); }
 if(!payload||typeof payload!=="object") return NextResponse.json({error:"Invalid payload"},{status:400});
 const {contractId,requestKey,answers}=payload as Record<string,unknown>;
 if(typeof contractId!=="string"||!uuid.test(contractId)||typeof requestKey!=="string"||!uuid.test(requestKey)||!Array.isArray(answers)||answers.length!==labels.length)
  return NextResponse.json({error:"Missing or invalid inspection fields"},{status:400});
 const normalized=labels.map((label,index)=>{
  const a=answers[index];
  if(!a||typeof a!=="object") return null;
  const {item,status,note} = a as Record<string,unknown>;
  if(item!==label||!["pass","issue","na"].includes(String(status))||typeof note!=="string"||note.length>2000||((status==="issue"||status==="na")&&!note.trim())) return null;
  return {item:label,status,note:note.trim()};
 });
 if(normalized.some(a=>!a)) return NextResponse.json({error:"Every check needs a valid answer; issues and N/A require a reason"},{status:400});
 const contract=await supabase.from("contracts").select("id").eq("id",contractId).maybeSingle();
 if(contract.error||!contract.data) return NextResponse.json({error:"Site unavailable"},{status:403});
 const record={organisation_id:member.organisation_id,contract_id:contractId,actor_id:member.user_id,request_key:requestKey,answers:normalized,issues_count:normalized.filter(a=>a?.status==="issue").length};
 const result=await supabase.from("supervisor_inspections").insert(record).select("id,created_at,issues_count").single();
 if(result.error){
  if(result.error.code==="23505"){
   const existing=await supabase.from("supervisor_inspections").select("id,created_at,issues_count,answers,contract_id").eq("request_key",requestKey).eq("actor_id",member.user_id).maybeSingle();
   if(existing.data&&existing.data.contract_id===contractId&&JSON.stringify(existing.data.answers)===JSON.stringify(normalized))
    return NextResponse.json({id:existing.data.id,createdAt:existing.data.created_at,issuesCount:existing.data.issues_count});
   return NextResponse.json({error:"Submission key already used. Refresh before submitting again."},{status:409});
  }
  return NextResponse.json({error:"Inspection could not be saved. Check the database migration and retry."},{status:503});
 }
 return NextResponse.json({id:result.data.id,createdAt:result.data.created_at,issuesCount:result.data.issues_count},{status:201});
}
