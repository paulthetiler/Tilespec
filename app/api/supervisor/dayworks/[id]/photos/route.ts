import { boundedPhotoForm } from "@/lib/operations/photo-form";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { createStorageVerifier } from "@/lib/supabase/storage-admin";
import { alreadyStored, inspectEvidence, verifyStoredEvidence } from "@/lib/operations/evidence";
import { uuid, text, MAX_FILE_BYTES, ValidationError } from "@/lib/operations/validation";
import { rpcErrorMessage } from "@/lib/operations/errors";
// Optional daywork photographs, verified the same way as stop and snag evidence. The daywork
// itself never waits for one: if photographs cannot be verified, it is saved without them.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase,member}=await requireActor();
 const {id}=await params;
 try {
  const form=await boundedPhotoForm(request); form.set("daywork_id",id);
  const daywork=uuid(form,"daywork_id"),key=uuid(form,"request_key"),purpose=text(form,"purpose",20,true),file=form.get("file");
  if(!["work","signed_sheet"].includes(purpose) || !(file instanceof File) || !["image/jpeg","image/png"].includes(file.type) || file.size===0 || file.size>MAX_FILE_BYTES)
   return NextResponse.json({error:"Choose a JPEG or PNG photograph between 1 byte and 4 MB."},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer()), type=inspectEvidence(bytes,file.type);
  let verifier;
  try { verifier=createStorageVerifier(); } // Fail before reserving when verification is not configured.
  catch { return NextResponse.json({error:"Photographs cannot be saved here yet. The daywork is saved without them; keep the photographs on your phone."},{status:503}); }
  const reservation=await supabase.rpc("reserve_daywork_photo",{p_daywork:daywork,p_request_key:key,p_purpose:purpose,p_meta:{mime_type:type.mime,sha256:type.sha256,bytes:bytes.length}});
  if(reservation.error) return NextResponse.json({error:rpcErrorMessage(reservation.error)},{status:reservation.error.code==="42501"?403:409});
  const metadata=await supabase.from("daywork_photos").select("id,daywork_id,actor_id,object_path,sha256,bytes,mime_type,purpose,uploaded_at").eq("id",reservation.data).single();
  if(metadata.error || !metadata.data || metadata.data.actor_id!==member.user_id || metadata.data.daywork_id!==daywork)
   return NextResponse.json({error:"Photo reservation unavailable."},{status:403});
  // A retry (same request key) returns the same reservation. Its object may already be stored by an
  // earlier attempt, including one whose verification failed: that is not an error, because the
  // exact stored bytes are checked next. Any other upload failure stops here, unsaved.
  if(!metadata.data.uploaded_at) {
   const upload=await supabase.storage.from("supervisor-evidence").upload(metadata.data.object_path,bytes,{contentType:type.mime,upsert:false});
   if(upload.error && !alreadyStored(upload.error))
    return NextResponse.json({error:"The photograph was not uploaded. It has not been saved; retry the same photograph. The daywork itself is already saved."},{status:503});
  }
  const stored=await verifier.storage.from("supervisor-evidence").download(metadata.data.object_path);
  if(stored.error || !stored.data) return NextResponse.json({error:"Upload remains pending. Retry the same photograph; it has not been confirmed saved."},{status:503});
  try { verifyStoredEvidence(new Uint8Array(await stored.data.arrayBuffer()),metadata.data); }
  catch { return NextResponse.json({error:"The stored photograph does not match the one you chose, so it is not saved. Retry the same photograph."},{status:409}); }
  const completion=await verifier.rpc("complete_daywork_photo",{p_photo:metadata.data.id,p_actor:member.user_id,p_sha256:metadata.data.sha256});
  if(completion.error) return NextResponse.json({error:rpcErrorMessage(completion.error)},{status:409});
  return NextResponse.json({id:metadata.data.id,verified:true},{status:201});
 } catch(error) {return NextResponse.json({error:error instanceof ValidationError?error.message:"Could not confirm the photograph was saved. Retry with the same file."},{status:error instanceof ValidationError?400:503});}
}
