import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRpc } from "./data";
import type { Snag, SnagEvent, SnagPhoto, SnagRegister } from "./snags";
export type SnagContext={snag:Snag; permissions:{supervise:boolean;office:boolean;repair:boolean;proposed_party:boolean};events:SnagEvent[]};
export async function snagRegisterFor(supabase:SupabaseClient,filters:Record<string,unknown>,page=0) {
 const result=await supabase.rpc("snag_register",{p_filters:filters,p_page:page});checkRpc(result.error);
 return result.data as SnagRegister;
}
export async function snagContextFor(supabase:SupabaseClient,id:string) {
 const result=await supabase.rpc("snag_context",{p_issue:id});
 if(result.error?.code==="42501") return null;
 checkRpc(result.error);
 const photos=await supabase.from("supervisor_issue_photos").select("id,issue_id,purpose,event_id,repair_cycle,actor_id,uploaded_at,created_at,mime_type").eq("issue_id",id).order("created_at");checkRpc(photos.error);
 return {...result.data as SnagContext,photos:(photos.data||[]) as SnagPhoto[]};
}
