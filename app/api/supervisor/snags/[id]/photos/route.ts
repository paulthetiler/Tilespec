import { boundedPhotoForm } from "@/lib/operations/photo-form";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { createStorageVerifier } from "@/lib/supabase/storage-admin";
import { alreadyStored, inspectEvidence, verifyStoredEvidence } from "@/lib/operations/evidence";
import { uuid, text, MAX_FILE_BYTES, ValidationError } from "@/lib/operations/validation";
import { rpcErrorMessage } from "@/lib/operations/errors";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase,member}=await requireActor();
 const {id}=await params;
 try {
  const form=await boundedPhotoForm(request); form.set("issue_id",id);
  const issue=uuid(form,"issue_id"),key=uuid(form,"request_key"),purpose=text(form,"purpose",20,true),file=form.get("file");
  if(!["original","rectification","reinspection"].includes(purpose) || !(file instanceof File) || !["image/jpeg","image/png"].includes(file.type) || file.size===0 || file.size>MAX_FILE_BYTES)
   return NextResponse.json({error:"Choose a JPEG or PNG photograph between 1 byte and 4 MB."},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer()), type=inspectEvidence(bytes,file.type);
  const verifier=createStorageVerifier(); // Fail before reserving when verification is not configured.
  const reservation=await supabase.rpc("reserve_snag_photo",{p_issue:issue,p_request_key:key,p_purpose:purpose,p_meta:{mime_type:type.mime,sha256:type.sha256,bytes:bytes.length}});
  if(reservation.error) return NextResponse.json({error:rpcErrorMessage(reservation.error)},{status:reservation.error.code==="42501"?403:409});
  // Obtain the exact user-visible reservation, never trust a client object path,
  // actor or hash. Privileged access remains confined to reading these bytes.
  const metadata=await supabase.from("supervisor_issue_photos").select("id,issue_id,actor_id,object_path,sha256,bytes,mime_type,purpose,uploaded_at").eq("id",reservation.data).single();
  if(metadata.error || !metadata.data || metadata.data.actor_id!==member.user_id || metadata.data.issue_id!==issue)
   return NextResponse.json({error:"Photo reservation unavailable."},{status:403});
  // A retry (same request key) returns the same reservation. Its object may already be stored by an
  // earlier attempt, including one whose verification failed: that is a safe retry only if the
  // actual stored bytes match, which is checked next. Any other upload failure stops here, unsaved.
  if(!metadata.data.uploaded_at) {
   const upload=await supabase.storage.from("supervisor-evidence").upload(metadata.data.object_path,bytes,{contentType:type.mime,upsert:false});
   if(upload.error && !alreadyStored(upload.error))
    return NextResponse.json({error:"The photograph was not uploaded. It has not been saved; retry the same photograph."},{status:503});
  }
  const stored=await verifier.storage.from("supervisor-evidence").download(metadata.data.object_path);
  if(stored.error || !stored.data) return NextResponse.json({error:"Upload remains pending. Retry the same photograph; it has not been confirmed saved."},{status:503});
  verifyStoredEvidence(new Uint8Array(await stored.data.arrayBuffer()),metadata.data);
  const completion=await verifier.rpc("complete_snag_photo",{p_photo:metadata.data.id,p_actor:member.user_id,p_sha256:metadata.data.sha256});
  if(completion.error) return NextResponse.json({error:rpcErrorMessage(completion.error)},{status:409});
  return NextResponse.json({id:metadata.data.id,verified:true},{status:201});
 } catch(error) {return NextResponse.json({error:error instanceof ValidationError?error.message:"Could not confirm the photograph was saved. Retry with the same file."},{status:error instanceof ValidationError?400:503});}
}
