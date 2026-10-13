import { NextResponse } from "next/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime="nodejs";
const extensions=new Set(["pdf","dwg","dxf","doc","docx","xls","xlsx","zip","jpg","jpeg","png"]);
const maxSize=25*1024*1024;
function storage(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Tender intake is not configured");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
const str=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
export async function POST(req:Request){
 try{
  if(Number(req.headers.get("content-length")||0)>32000)return NextResponse.json({error:"Request too large"},{status:413});
  const origin=req.headers.get("origin");
  if(origin && new URL(origin).host!==req.headers.get("host"))return NextResponse.json({error:"Invalid origin"},{status:403});
  const input=await req.json();
  if(str(input.website,100))return NextResponse.json({error:"Unable to submit enquiry"},{status:400});
  const kind=input.kind==="general"?"general":"tender";
  const name=str(input.name,120),email=str(input.email,200),company=str(input.company,160),project=str(input.project,200),message=str(input.message,3000);
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"Name and a valid email are required"},{status:400});
  const docs=Array.isArray(input.files)?input.files:[];
  if(docs.length>10)return NextResponse.json({error:"Maximum 10 files"},{status:400});
  const verified: {name:string;size:number;type:string;path:string}[]=[];
  const id=randomUUID(), token=randomBytes(24).toString("hex");
  for(const entry of docs){
   const filename=str(entry?.name,180).replace(/[\\/]/g,"_");
   const ext=filename.split(".").pop()?.toLowerCase()||"";
   if(!extensions.has(ext)||!Number.isSafeInteger(entry?.size)||entry.size<=0||entry.size>maxSize)return NextResponse.json({error:"Unsupported file or file too large"},{status:400});
   verified.push({name:filename,size:entry.size,type:str(entry.type,100),path:id+"/"+randomUUID()+"."+ext});
  }
  const db=storage();
  const ref="TS-"+id.slice(0,8).toUpperCase();
  const {error}=await db.from("tender_enquiries").insert({id,reference:ref,kind,name,email,company,project,message,deadline:/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)?input.deadline:null,token_hash:createHash("sha256").update(token).digest("hex"),attachments:verified});
  if(error)throw error;
  const uploads=[];
  for(const file of verified){
   const {data,error:uploadError}=await db.storage.from("tilespec-tenders").createSignedUploadUrl(file.path);
   if(uploadError||!data)throw uploadError||new Error("Failed to prepare upload");
   uploads.push({url:data.signedUrl,contentType:file.type||"application/octet-stream"});
  }
  return NextResponse.json({id,token,reference:ref,uploads},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Tender intake error",e);return NextResponse.json({error:"Unable to prepare submission. Please try again later."},{status:503});}
}
