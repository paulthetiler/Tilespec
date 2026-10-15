"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
const CONNECTION_FAILED="We could not confirm the draft was saved. Your details and request key are kept; retry without changing them.";
import { checkRpc } from "@/lib/operations/data";
import { createSnagInput, snagTransitionInput } from "@/lib/operations/snags";
import { integer, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";
import { confirmsSnagCreation, confirmsSnagTransition, isSavedSnagId } from "@/lib/operations/snag-save-confirmation";
export type SnagActionState=ActionState & {id?:string;uncertain?:boolean};
function refresh(contract:string,id:string) {
 revalidatePath("/admin/snags"); revalidatePath(`/admin/snags/${id}`);
 revalidatePath("/admin/quality");
 revalidatePath(`/admin/supervisor/sites/${contract}`); revalidatePath(`/admin/supervisor/sites/${contract}/inspections`);
}
export async function createSnagAction(_:SnagActionState,form:FormData):Promise<SnagActionState> {
 const {supabase,member}=await requireActor();
 let attempted=false;
 try {
  const data=createSnagInput(form);
  const requestKey=uuid(form,"request_key");
  attempted=true;
  const result=await supabase.rpc("create_snag",{p_request_key:requestKey,p_data:data});
  if(result.error) return {error:rpcErrorMessage(result.error),uncertain:!result.error.code||!(/^[A-Z0-9]{5}$/.test(result.error.code)||result.error.code.startsWith("PGRST"))};
  if(!isSavedSnagId(result.data)) return {error:"Draft creation has not been confirmed. Retry the same details.",uncertain:true};
  const saved=await supabase.from("supervisor_issues").select("id,contract_id,inspector_id").eq("id",result.data).single();
  if(saved.error||!confirmsSnagCreation(saved.data,result.data,data.contract_id,member.user_id)) return {error:CONNECTION_FAILED,uncertain:true};
  refresh(data.contract_id,result.data);
  return {id:result.data,success:"Draft findings recorded. Verify photographs and submit to raise the snag."};
 } catch(error) {return {error:error instanceof ValidationError?error.message:attempted?CONNECTION_FAILED:"Draft could not be saved.",uncertain:attempted&&!(error instanceof ValidationError)};}
}
export async function transitionSnagAction(_:ActionState,form:FormData):Promise<ActionState> {
 const {supabase}=await requireActor();
 try {
  const issue=uuid(form,"issue_id"),version=integer(form,"version",1), {action,data}=snagTransitionInput(form);
  const result=await supabase.rpc("transition_snag",{p_issue:issue,p_request_key:uuid(form,"request_key"),p_version:version,p_action:action,p_data:data}); checkRpc(result.error);
  if(result.data!==issue) throw new Error("The change has not been confirmed. Retry the same details or review the saved snag.");
  const snag=await supabase.from("supervisor_issues").select("id,contract_id,snag_status,version").eq("id",issue).single();checkRpc(snag.error);
  if(!confirmsSnagTransition(snag.data,result.data,issue,version,action)) throw new Error("The saved change has not been confirmed. Your details are kept; retry the same action or review the snag history.");
  if(!snag.data) throw new Error("The saved snag is unavailable. Retry the same action.");
  refresh(snag.data.contract_id,issue);
  return {success:action==="submit_rectification"?"Repair submitted for independent reinspection; snag remains open.":action==="accept"?"Independent reinspection accepted. Snag closed.":action==="reject"?"Repair rejected. Snag reopened; this attempt and evidence are kept.":"Snag history updated and confirmed by the database."};
 } catch(error) {return {error:error instanceof Error?error.message:"Could not confirm the change. Retry with the same request."};}
}
