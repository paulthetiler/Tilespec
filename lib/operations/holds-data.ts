import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRpc } from "./data";
import type { Hold, HoldEvent, HoldPhoto, HoldRegister } from "./holds";
import type { LocationInspection, RequirementStatus } from "./inspections";
export type HoldDocument={id:string;title:string;revision:number;document_reference:string};
export type HoldInspection=LocationInspection&{title:string;stage:string;specification_reference?:string;specification_revision?:string};
export type HoldRequirementReview=RequirementStatus&{scopes?:{work_area_id:string;location_path:string[];stage:string;requirements:RequirementStatus}[]};
export type WorkReleaseStatus={status:string;authorised:boolean;holds:Hold[];requirements:HoldRequirementReview;reason?:string|null;release:{hold_id:string;reviewer_name:string;at:string;note:string}|null};
export type HoldContext={hold:Hold;permissions:{supervise:boolean;office:boolean;correct:boolean;release:boolean};events:HoldEvent[];overlapping_holds:Hold[];related_snags:{id:string;description:string;severity:string;snag_status:string}[];inspections:HoldInspection[];requirements:HoldRequirementReview;documents:HoldDocument[];release_status:WorkReleaseStatus};
export async function holdRegisterFor(supabase:SupabaseClient,filters:Record<string,unknown>,page=0){const result=await supabase.rpc("hold_register",{p_filters:filters,p_page:page});checkRpc(result.error);return result.data as HoldRegister;}
export async function holdContextFor(supabase:SupabaseClient,id:string){const result=await supabase.rpc("hold_context",{p_hold:id});if(result.error?.code==="42501")return null;checkRpc(result.error);const photos=await supabase.from("hold_photos").select("id,hold_id,actor_id,purpose,correction_cycle,uploaded_at,created_at,event_id,mime_type").eq("hold_id",id).order("created_at");checkRpc(photos.error);return {...result.data as HoldContext,photos:(photos.data||[]) as HoldPhoto[]};}
export async function workReleaseFor(supabase:SupabaseClient,contract:string,area:string,stage:string,packageId:string|null=null){const result=await supabase.rpc("work_release_status",{p_contract:contract,p_area:area,p_stage:stage,p_package:packageId});checkRpc(result.error);return result.data as WorkReleaseStatus;}
