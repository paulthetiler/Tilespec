import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public-client";

export const runtime="nodejs";
const str=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
// A visitor's enquiry. No service key is used: the database function validates every field,
// limits how many enquiries can arrive, and reserves the only paths files may be stored at.
export async function POST(req:Request){
 try{
  if(Number(req.headers.get("content-length")||0)>32000)return NextResponse.json({error:"Request too large"},{status:413});
  const origin=req.headers.get("origin");
  if(origin && new URL(origin).host!==req.headers.get("host"))return NextResponse.json({error:"Invalid origin"},{status:403});
  const input=await req.json();
  if(str(input.website,100))return NextResponse.json({error:"Unable to submit enquiry"},{status:400});
  const docs=Array.isArray(input.files)?input.files:[];
  if(docs.length>10)return NextResponse.json({error:"Maximum 10 files"},{status:400});
  const connection=createPublicClient();
  if(!connection)throw new Error("Tender intake is not configured");
  const publicClient=connection.client;
  const {data,error}=await publicClient.rpc("submit_tender_enquiry",{p_data:{
   kind:input.kind==="general"?"general":"tender",name:str(input.name,120),email:str(input.email,200),company:str(input.company,160),
   project:str(input.project,200),message:str(input.message,3000),deadline:str(input.deadline,10),
   files:docs.map((entry:{name?:unknown;size?:unknown;type?:unknown})=>({name:str(entry?.name,180),size:Number.isSafeInteger(entry?.size)?entry.size:0,type:str(entry?.type,100)})),
  }});
  if(error){
   if(error.code==="22023")return NextResponse.json({error:error.message},{status:400});
   if(error.code==="53400")return NextResponse.json({error:error.message},{status:429});
   throw error;
  }
  const result=data as {id:string;token:string;reference:string;files:{path:string;type:string}[]};
  const {url,publishableKey}=connection.configuration;
  // The browser stores each file itself. Storage accepts only these reserved paths, once each.
  const uploads=result.files.map(file=>({
   url:`${url}/storage/v1/object/tilespec-tenders/${file.path.split("/").map(encodeURIComponent).join("/")}`,method:"POST",
   contentType:file.type||"application/octet-stream",headers:{apikey:publishableKey,Authorization:`Bearer ${publishableKey}`,"x-upsert":"false"},
  }));
  return NextResponse.json({id:result.id,token:result.token,reference:result.reference,uploads},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Tender intake error",e);return NextResponse.json({error:"Unable to prepare submission. Please try again later."},{status:503});}
}
