"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinancialActor } from "@/lib/auth";

const categories = ["formation","premises","equipment","software","insurance","marketing","training","travel","professional_fees","other"] as const;
function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function money(input: string) { const n=Number(input); if(!Number.isFinite(n)||n<=0||n>10000000||Math.round(n*100)!==n*100) throw new Error("Enter a valid amount in pounds and pence."); return n; }
export async function addStartupExpense(form: FormData) {
 const {supabase,member}=await requireFinancialActor();
 const category=value(form,"category"), source=value(form,"payment_source"), supplier=value(form,"supplier"), description=value(form,"description"), date=value(form,"expense_date");
 if(!categories.includes(category as typeof categories[number]) || !["personal","company"].includes(source)) throw new Error("Invalid category or payment source.");
 if(supplier.length<1||supplier.length>160||description.length<3||description.length>500||!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Check the date, supplier and description.");
 const {error}=await supabase.from("startup_expenses").insert({organisation_id:member.organisation_id,expense_date:date,supplier,description,category,amount_gbp:money(value(form,"amount_gbp")),payment_source:source,receipt_status:value(form,"receipt_status")==="held"?"held":"awaiting",date_confirmed:true,notes:value(form,"notes").slice(0,1000)||null});
 if(error) throw new Error("Expense could not be saved: "+error.message);
 revalidatePath("/admin/startup-expenses");
 redirect("/admin/startup-expenses?saved=1");
}
export async function recordStartupReimbursement(form: FormData) {
 const {supabase,member}=await requireFinancialActor();
 const id=value(form,"id"), date=value(form,"reimbursement_date");
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid reimbursement details.");
 const {data,error:readError}=await supabase.from("startup_expenses").select("amount_gbp,payment_source,reimbursed_gbp").eq("id",id).eq("organisation_id",member.organisation_id).single();
 if(readError||!data||data.payment_source!=="personal") throw new Error("Personal expense not found.");
 const amount=money(value(form,"reimbursement_amount"));
 const total=Math.round((Number(data.reimbursed_gbp)+amount)*100)/100;
 if(total>Number(data.amount_gbp)) throw new Error("Reimbursement exceeds the outstanding balance.");
 const {error}=await supabase.from("startup_expenses").update({reimbursed_gbp:total,reimbursement_date:date,updated_at:new Date().toISOString()}).eq("id",id).eq("organisation_id",member.organisation_id).eq("reimbursed_gbp",data.reimbursed_gbp).select("id").single();
 if(error) throw new Error("Reimbursement could not be saved. Refresh and try again.");
 revalidatePath("/admin/startup-expenses");
 redirect("/admin/startup-expenses?reimbursed=1");
}
