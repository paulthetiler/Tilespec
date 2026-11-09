import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { siteDayFor } from "@/lib/operations/data";
import { buildSiteDay } from "@/lib/operations/site-day";
import { londonDate } from "@/lib/operations/planning";
import { morningUuid } from "@/lib/operations/morning-checks";

type Choice = { planId: string; status: "all" | "some" | "none"; missing: string[] };
export async function POST(request: Request) {
 const { supabase, member } = await requireActor();
 if (!["owner","contracts_manager","supervisor"].includes(member.role)) return NextResponse.json({error:"Forbidden"},{status:403});
 let body: {contractId?:string; inspectionId?:string; choices?:Choice[]};
 try { body = await request.json(); } catch { return NextResponse.json({error:"Invalid request"},{status:400}); }
 if (!body.contractId || !morningUuid.test(body.contractId) || !body.inspectionId || !morningUuid.test(body.inspectionId) || !Array.isArray(body.choices))
  return NextResponse.json({error:"Invalid attendance details"},{status:400});
 const inspection = await supabase.from("supervisor_inspections").select("id,contract_id,organisation_id,answers").eq("id",body.inspectionId).eq("contract_id",body.contractId).maybeSingle();
 if (inspection.error || !inspection.data || inspection.data.organisation_id !== member.organisation_id)
  return NextResponse.json({error:"Morning check unavailable"},{status:403});
 const attendanceAnswer = (inspection.data.answers as {item?:string;response?:string}[]).find(answer=>answer.item==="Are the expected lads on site?");
 if (!attendanceAnswer || !["yes","no"].includes(attendanceAnswer.response || "")) return NextResponse.json({error:"Attendance was not confirmed in this morning check"},{status:400});
 if (attendanceAnswer.response==="yes" && body.choices.some(choice=>choice.status!=="all")) return NextResponse.json({error:"Attendance does not match the saved morning check"},{status:400});
 const day = londonDate();
 const {records} = await siteDayFor(supabase,body.contractId,day);
 const cards = buildSiteDay(records).cards;
 const choices = body.choices;
 if (new Set(choices.map(c=>c.planId)).size !== choices.length || choices.some(c=>!cards.some(card=>card.plan.id===c.planId) || !["all","some","none"].includes(c.status) || !Array.isArray(c.missing)))
  return NextResponse.json({error:"Invalid planned gang selection"},{status:400});
 // Never overwrite or reinterpret attendance already confirmed by a supervisor.
 let confirmed=0,skipped=0;
 for (const card of cards) {
  if (card.status!=="unconfirmed") { skipped++; continue; }
  const choice = choices.find(c=>c.planId===card.plan.id);
  if (!choice) { skipped++; continue; }
  const missing = choice.status==="none" ? card.expected : choice.status==="all" ? [] : choice.missing;
  if (missing.some(id=>!card.expected.includes(id)) || (choice.status==="some" && !missing.length))
   return NextResponse.json({error:"Missing people do not match the office plan"},{status:400});
  if (choice.status==="some" && !card.expected.length) { skipped++; continue; }
  if (choice.status==="none" || (card.expected.length>0 && missing.length===card.expected.length)) {
   const result=await supabase.rpc("record_allocation_absence",{p_request_key:randomUUID(),p_data:{planned_allocation_id:card.plan.id,work_date:day,reason:"Not on site — morning check"}});
   if (result.error) return NextResponse.json({error:"Could not record gang absence; check the workforce register."},{status:503});
  } else {
   if (!card.expected.length) { skipped++; continue; }
   const present=card.expected.filter(id=>!missing.includes(id));
   const result=await supabase.rpc("confirm_planned_allocation",{p_request_key:randomUUID(),p_data:{
    contract_id:body.contractId,planned_allocation_id:card.plan.id,groups:[{operative_ids:present}],
    ...(missing.length?{absent:missing.map(operative_id=>({operative_id,reason:"Not on site — morning check"}))}:{})
   }});
   if (result.error) return NextResponse.json({error:"Could not confirm gang attendance; check the workforce register."},{status:503});
  }
  confirmed++;
 }
 const after=buildSiteDay((await siteDayFor(supabase,body.contractId,day)).records);
 return NextResponse.json({confirmed,skipped,remaining:after.summary.unconfirmed});
}
