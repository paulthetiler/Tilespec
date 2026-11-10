import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public-client";
export const runtime="nodejs";
// Confirms an enquiry once its files have arrived. The database checks the visitor's one-time
// token and that every reserved file is stored at its declared size. No service key is used.
export async function POST(req:Request){
 try{
  if(Number(req.headers.get("content-length")||0)>4096)return NextResponse.json({error:"Invalid request"},{status:413});
  const origin=req.headers.get("origin");
  if(origin&&new URL(origin).host!==req.headers.get("host"))return NextResponse.json({error:"Invalid origin"},{status:403});
  const {id,token}=await req.json();
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)||typeof token!=="string"||!/^[0-9a-f]{48}$/.test(token))return NextResponse.json({error:"Invalid submission"},{status:400});
  const connection=createPublicClient();
  if(!connection)throw new Error("Tender intake not configured");
  const publicClient=connection.client;
  const {data,error}=await publicClient.rpc("complete_tender_enquiry",{p_id:id,p_token:token});
  if(error){
   if(error.code==="42501")return NextResponse.json({error:"Invalid submission"},{status:403});
   if(error.code==="22023")return NextResponse.json({error:"Invalid status"},{status:409});
   throw error;
  }
  if(data!=="received")return NextResponse.json({error:"Files have not all finished uploading. Please retry."},{status:409});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Tender completion failed",e);return NextResponse.json({error:"Unable to confirm submission"},{status:503});}
}
