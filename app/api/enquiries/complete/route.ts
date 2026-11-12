import { after, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public-client";
import { completeEnquiry } from "@/lib/enquiries/complete";
import { notifySubmittedEnquiry } from "@/lib/notifications/enquiry";
import { enquiryDeps } from "@/lib/notifications/enquiry-server";
export const runtime="nodejs";
// Time for the office's email alert, which is sent after the visitor already has their answer.
export const maxDuration=60;
// Confirms an enquiry once its files have arrived. The database checks the visitor's one-time
// token and that every reserved file is stored at its declared size, and queues the office's email
// alert in the same transaction. The alert is sent afterwards and cannot change the answer. No service key is used.
export async function POST(req:Request){
 if(Number(req.headers.get("content-length")||0)>4096)return NextResponse.json({error:"Invalid request"},{status:413});
 const origin=req.headers.get("origin");
 try{if(origin&&new URL(origin).host!==req.headers.get("host"))return NextResponse.json({error:"Invalid origin"},{status:403});}
 catch{return NextResponse.json({error:"Invalid origin"},{status:403});}
 const input=await req.json().catch(()=>null);
 const connection=createPublicClient();
 const result=await completeEnquiry(input,{
  rpc:connection?(fn,args)=>connection.client.rpc(fn,args):null,
  schedule:task=>after(task),
  notify:enquiry=>connection?notifySubmittedEnquiry(enquiry,enquiryDeps(connection.client)):Promise.resolve(),
 });
 return NextResponse.json(result.body,{status:result.status,headers:result.status===200?{"Cache-Control":"no-store"}:undefined});
}
