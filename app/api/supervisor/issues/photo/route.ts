import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { randomUUID } from "node:crypto";
export async function POST(request:Request){
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role))return NextResponse.json({error:"Forbidden"},{status:403});
 let form:FormData;try{form=await request.formData()}catch{return NextResponse.json({error:"Invalid upload"},{status:400})}
 const issueId=form.get("issueId"),file=form.get("photo");
 if(typeof issueId!=="string"||!/^[0-9a-f-]{36}$/i.test(issueId)||!(file instanceof File))return NextResponse.json({error:"Select an issue and photograph"},{status:400});
 const mime=file.type;
 if(!["image/jpeg","image/png","image/webp"].includes(mime)||file.size===0||file.size>5242880)return NextResponse.json({error:"JPEG, PNG or WebP only, maximum 5 MB"},{status:400});
 const issue=await supabase.from("supervisor_issues").select("id,organisation_id,contract_id").eq("id",issueId).maybeSingle();
 if(issue.error||!issue.data||issue.data.organisation_id!==member.organisation_id)return NextResponse.json({error:"Issue unavailable"},{status:403});
 const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
 const path=`${member.organisation_id}/${issueId}/${randomUUID()}.${ext}`;
 const uploaded=await supabase.storage.from("supervisor-evidence").upload(path,file,{contentType:mime,upsert:false});
 if(uploaded.error)return NextResponse.json({error:"Photograph could not be uploaded"},{status:503});
 const saved=await supabase.from("supervisor_issue_photos").insert({issue_id:issueId,organisation_id:member.organisation_id,actor_id:member.user_id,object_path:path}).select("id").single();
 if(saved.error){await supabase.storage.from("supervisor-evidence").remove([path]);return NextResponse.json({error:"Photo record could not be saved"},{status:503})}
 return NextResponse.json({id:saved.data.id},{status:201});
}
