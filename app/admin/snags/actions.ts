"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
const CONNECTION_FAILED="We could not confirm the draft was saved. Your details and request key are kept; retry without changing them.";
import { checkRpc } from "@/lib/operations/data";
import { createSnagInput, snagTransitionInput } from "@/lib/operations/snags";
import { integer, uuid, ValidationError } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";
export type SnagActionState=ActionState & {id?:string;uncertain?:boolean};
function refresh(contract:string,id:string) {
 revalidatePath("/admin/snags"); revalidatePath(`/admin/snags/${id}`);
 revalidatePath(`/admin/supervisor/sites/${contract}`); revalidatePath(`/admin/supervisor/sites/${contract}/inspections`);
}
export async function createSnagAction(_:SnagActionState,form:FormData):Promise<SnagActionState> {
 const {supabase}=await requireActor();
 let attempted=false;
 try {
  const data=createSnagInput(form);
  const requestKey=uuid(form,"request_key");
  attempted=true;
  const result=await supabase.rpc("create_snag",{p_request_key:requestKey,p_data:data});
  if(result.error) return {error:rpcErrorMessage(result.error),uncertain:!result.error.code||!(/^[A-Z0-9]{5}$/.test(result.error.code)||result.error.code.startsWith("PGRST"))};
  if(typeof result.data!=="string") return {error:"Draft creation has not been confirmed. Retry the same details.",uncertain:true};
  refresh(data.contract_id,result.data);
  return {id:result.data,success:"Draft findings recorded. Verify photographs and submit to raise the snag."};
 } catch(error) {return {error:error instanceof ValidationError?error.message:attempted?CONNECTION_FAILED:"Draft could not be saved.",uncertain:attempted&&!(error instanceof ValidationError)};}
}
export async function transitionSnagAction(_:ActionState,form:FormData):Promise<ActionState> {
 const {supabase}=await requireActor();
 try {
  const issue=uuid(form,"issue_id"), {action,data}=snagTransitionInput(form);
  const result=await supabase.rpc("transition_snag",{p_issue:issue,p_request_key:uuid(form,"request_key"),p_version:integer(form,"version",1),p_action:action,p_data:data}); checkRpc(result.error);
  const snag=await supabase.from("supervisor_issues").select("contract_id").eq("id",issue).single();checkRpc(snag.error);
  if(!snag.data) throw new Error("The action was recorded, but the snag is no longer readable. Refresh the register.");
  refresh(snag.data.contract_id,issue);
  return {success:action==="submit_rectification"?"Repair submitted for independent reinspection; snag remains open.":action==="accept"?"Independent reinspection accepted. Snag closed.":action==="reject"?"Repair rejected. Snag reopened; this attempt and evidence are kept.":"Snag history updated and confirmed by the database."};
 } catch(error) {return {error:error instanceof Error?error.message:"Could not confirm the change. Retry with the same request."};}
}
