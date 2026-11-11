import { requireFinancialActor } from "@/lib/auth";
import { addStartupExpense,recordStartupReimbursement } from "./actions";
import styles from "../admin.module.css";
export const dynamic="force-dynamic";
type Expense={id:string;expense_date:string;supplier:string;description:string;category:string;amount_gbp:number;payment_source:string;reimbursed_gbp:number;receipt_status:string;date_confirmed:boolean;notes:string|null};
const categories=["formation","premises","equipment","software","insurance","marketing","training","travel","professional_fees","other"];
const pounds=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(n);
export default async function StartupExpenses({searchParams}:{searchParams:Promise<{saved?:string;reimbursed?:string}>}) {
 const {supabase,member}=await requireFinancialActor();
 const {data,error}=await supabase.from("startup_expenses").select("id,expense_date,supplier,description,category,amount_gbp,payment_source,reimbursed_gbp,receipt_status,date_confirmed,notes").eq("organisation_id",member.organisation_id).order("expense_date",{ascending:false}).order("created_at",{ascending:false});
 if(error) throw new Error("Could not load startup expenses: "+error.message);
 const expenses=(data??[]) as Expense[], params=await searchParams;
 const total=expenses.reduce((t,e)=>t+Number(e.amount_gbp),0);
 const owed=expenses.reduce((t,e)=>t+(e.payment_source==="personal"?Number(e.amount_gbp)-Number(e.reimbursed_gbp):0),0);
 return <div>
 <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Spec Contracting Ltd · TileSPEC</p><h1 className={styles.title}>Startup costs & expenses</h1><p className={styles.description}>Company setup costs, personal payments and reimbursements. Separate from job costing. Retain receipts for your accountant.</p></div></div>
 {(params.saved||params.reimbursed)&&<p role="status" className={styles.panel}>{params.saved?"Expense saved.":"Reimbursement recorded."}</p>}
 <div className={styles.metrics}><div className={styles.metric}><span className={styles.metricLabel}>Total recorded expenses</span><strong className={styles.metricValue}>{pounds(total)}</strong></div><div className={styles.metric}><span className={styles.metricLabel}>Personally funded — outstanding</span><strong className={styles.metricValue}>{pounds(owed)}</strong></div></div>
 <section className={styles.panel}><h2>Record an expense</h2><form action={addStartupExpense} style={{display:"grid",gap:14,maxWidth:700}}>
 <label>Date paid<input name="expense_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
 <label>Supplier<input name="supplier" required maxLength={160} placeholder="Who was paid?"/></label>
 <label>Description<input name="description" required maxLength={500} placeholder="What was purchased?"/></label>
 <label>Category<select name="category" defaultValue="other">{categories.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
 <label>Amount (£)<input name="amount_gbp" type="number" min="0.01" max="10000000" step="0.01" required/></label>
 <label>Paid from<select name="payment_source" defaultValue="personal"><option value="personal">My personal money</option><option value="company">Company account</option></select></label>
 <label>Receipt<select name="receipt_status"><option value="awaiting">Receipt to add / locate</option><option value="held">Receipt retained separately</option></select></label>
 <label>Notes (optional)<textarea name="notes" maxLength={1000}/></label>
 <button type="submit" className={styles.button}>Save expense</button></form></section>
 <section className={styles.panel}><h2>Expense register ({expenses.length})</h2>
 {expenses.length===0?<p>No expenses recorded yet.</p>:<div style={{display:"grid",gap:14}}>{expenses.map(e=>{const due=e.payment_source==="personal"?Number(e.amount_gbp)-Number(e.reimbursed_gbp):0;return <article key={e.id} style={{border:"1px solid #d7e2e5",borderRadius:8,padding:16,background:"#fff"}}>
 <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{e.supplier} · {e.description}</strong><p className={styles.muted}>{e.expense_date}{!e.date_confirmed?" (date to confirm)":""} · {e.category.replaceAll("_"," ")} · {e.payment_source==="personal"?"Personally paid":"Company paid"}</p></div><strong>{pounds(Number(e.amount_gbp))}</strong></div>
 <p className={styles.small}>Receipt: {e.receipt_status==="held"?"retained separately":"outstanding"}{e.payment_source==="personal"?` · Still owed: ${pounds(due)}`:""}</p>
 {e.notes&&<p className={styles.small}>{e.notes}</p>}
 {due>0&&<details><summary>Record money paid back</summary><form action={recordStartupReimbursement} style={{display:"grid",gap:10,maxWidth:350}}><input type="hidden" name="id" value={e.id}/><label>Amount reimbursed (£)<input name="reimbursement_amount" type="number" min="0.01" max={due} step="0.01" required defaultValue={due.toFixed(2)}/></label><label>Reimbursement date<input name="reimbursement_date" type="date" required/></label><button type="submit" className={styles.secondaryButton}>Record reimbursement</button></form></details>}
 </article>})}</div>}</section>
 </div>;
}