import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
export async function POST(request:Request){
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role))return NextResponse.json({error:"Forbidden"},{status:403});
 let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 const b=body as {issueId?:unknown;action?:unknown;note?:unknown};
 if(!b||typeof b.issueId!=="string"||!/^[0-9a-f-]{36}$/i.test(b.issueId)||typeof b.action!=="string"||!["report_rectification","request_reinspection","close_after_reinspection","reopen"].includes(b.action)||typeof b.note!=="string"||b.note.trim().length<5||b.note.length>2000)return NextResponse.json({error:"Invalid action or note"},{status:400});
 const result=await supabase.rpc("transition_supervisor_issue",{p_issue:b.issueId,p_action:b.action,p_note:b.note});
 if(result.error)return NextResponse.json({error:"Issue transition rejected. Check permissions, required evidence and current state."},{status:409});
 return NextResponse.json({issue:result.data});
}
