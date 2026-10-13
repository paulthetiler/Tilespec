import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export async function POST(req:Request){
 try{
  if(Number(req.headers.get("content-length")||0)>4096)return NextResponse.json({error:"Invalid request"},{status:413});
  const origin=req.headers.get("origin");
  if(origin&&new URL(origin).host!==req.headers.get("host"))return NextResponse.json({error:"Invalid origin"},{status:403});
  const {id,token}=await req.json();
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)||typeof token!=="string"||token.length!==48)return NextResponse.json({error:"Invalid submission"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Tender intake not configured");
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:enquiry,error}=await db.from("tender_enquiries").select("status,token_hash,attachments").eq("id",id).single();
  if(error||!enquiry)return NextResponse.json({error:"Submission not found"},{status:404});
  const a=Buffer.from(createHash("sha256").update(token).digest("hex"));
  const b=Buffer.from(enquiry.token_hash);
  if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"Invalid submission"},{status:403});
  if(enquiry.status==="received")return NextResponse.json({ok:true});
  if(enquiry.status!=="uploading")return NextResponse.json({error:"Invalid status"},{status:409});
  for(const item of enquiry.attachments as {path:string;size:number}[]){
   const {data:info,error:infoError}=await db.storage.from("tilespec-tenders").info(item.path);
   if(infoError||!info||Number(info.size)!==item.size)return NextResponse.json({error:"Files have not all finished uploading. Please retry."},{status:409});
  }
  const {error:updateError}=await db.from("tender_enquiries").update({status:"received",received_at:new Date().toISOString()}).eq("id",id).eq("status","uploading");
  if(updateError)throw updateError;
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Tender completion failed",e);return NextResponse.json({error:"Unable to confirm submission"},{status:503});}
}
