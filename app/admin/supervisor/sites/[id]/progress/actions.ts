"use server";
import { revalidatePath } from "next/cache";
import { requireSite } from "@/app/admin/supervisor/site-access";
import type { ActionState } from "@/lib/operations/types";

export async function recordGangProgress(_: ActionState, form: FormData): Promise<ActionState> {
 try {
  const contractId=String(form.get("contract_id")||"");
  const {supabase,contract,member}=await requireSite(contractId);
  if(!contract || !["owner","contracts_manager","supervisor"].includes(member.role)) throw new Error("Not authorised.");
  const teamId=String(form.get("team_id")||"");
  const areaId=String(form.get("work_area_id")||"");
  const quantity=Number(form.get("quantity_m2"));
  const status=String(form.get("quality_status")||"");
  const note=String(form.get("note")||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(teamId)||!/^[0-9a-f-]{36}$/i.test(areaId)||!Number.isFinite(quantity)||quantity<=0||quantity>=100000||!["passed","correction_required"].includes(status)||note.length>2000) throw new Error("Check the gang, area, quantity and quality result.");
  const {error}=await supabase.from("gang_progress_checks").insert({organisation_id:member.organisation_id,contract_id:contractId,team_id:teamId,work_area_id:areaId,quantity_m2:quantity,quality_status:status,note,checked_by:member.user_id});
  if(error) throw new Error(error.message);
  revalidatePath(`/admin/supervisor/sites/${contractId}/progress`);
  return {success:"Measurement recorded. This is not a payment approval."};
 } catch(e){return {error:e instanceof Error?e.message:"Could not save measurement."};}
}
