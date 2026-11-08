"use server";
import { requireFinancialActor } from "@/lib/auth";
export async function saveSiteProgramme(input:{contractId:string;title:string;startDate:string;contingencyDays:number;items:{description:string;sqm:number;output:number;days:number;extra:number}[];notes:string;issue:boolean}) {
 const {supabase,member}=await requireFinancialActor();
 if(!/^[0-9a-f-]{36}$/i.test(input.contractId)||!input.title.trim()||input.title.length>200||!Array.isArray(input.items)||input.items.length<1||input.items.length>100) return {error:"Invalid programme details"};
 if(input.items.some(i=>!i.description||i.description.length>200||![i.sqm,i.output,i.days,i.extra].every(n=>Number.isFinite(n)&&n>=0)||i.output<1||i.days>365))return {error:"Invalid work area"};
 if(!Number.isInteger(input.contingencyDays)||input.contingencyDays<0||input.contingencyDays>365)return {error:"Invalid contingency"};
 if(input.startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate))return {error:"Invalid start date"};
 const {data:contract,error:ce}=await supabase.from("contracts").select("id").eq("id",input.contractId).eq("organisation_id",member.organisation_id).single();
 if(ce||!contract)return {error:"Contract not found"};
 const {data:prior,error:pe}=await supabase.from("site_programme_revisions").select("revision").eq("contract_id",input.contractId).order("revision",{ascending:false}).limit(1);
 if(pe)return {error:"Could not check existing revisions"};
 const revision=(prior?.[0]?.revision??0)+1;
 const {data,error}=await supabase.from("site_programme_revisions").insert({organisation_id:member.organisation_id,contract_id:input.contractId,revision,title:input.title.trim(),start_date:input.startDate||null,items:input.items,contingency_days:input.contingencyDays,status:input.issue?"issued":"draft",notes:input.notes.slice(0,3000),created_by:member.user_id}).select("id,revision").single();
 if(error)return {error:error.code==="23505"?"Another revision was saved. Please retry.":"Could not save programme"};
 return {id:data.id,revision:data.revision};
}
