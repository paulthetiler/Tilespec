import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireSite } from "@/app/admin/supervisor/site-access";
import { OperationsForm } from "@/components/operations/operations-form";
import { recordGangProgress } from "./actions";
import styles from "@/app/admin/admin.module.css";

export const dynamic="force-dynamic";
export default async function GangProgress({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const {supabase,contract}=await requireSite(id);
 if(!contract)return null;
 const [teams,areas,checks]=await Promise.all([
  supabase.from("teams").select("id,name").eq("active",true).order("name"),
  supabase.from("work_areas").select("id,name").eq("contract_id",id).is("archived_at",null).order("name"),
  supabase.from("gang_progress_checks").select("id,team_id,work_area_id,quantity_m2,quality_status,note,measured_on,checked_at").eq("contract_id",id).order("checked_at",{ascending:false}).limit(100)
 ]);
 const teamNames=new Map((teams.data||[]).map(t=>[t.id,t.name]));
 const areaNames=new Map((areas.data||[]).map(a=>[a.id,a.name]));
 return <><div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.reference}</p><h1 className={styles.title}>Verify gang progress</h1><p className={styles.description}>Record measured work and quality. Quantities only — no rates or payment approval.</p></div><Link href={`/admin/supervisor/sites/${id}`}>Back to site</Link></div>
 <section className={styles.panel}><h2>Record a site measurement</h2>
 <p className={styles.muted}>Record each area once for the measured period. Do not count previously recorded metres again. Corrected work must be checked before it is passed.</p>
 <OperationsForm action={recordGangProgress} submitLabel="Save measurement">
 <input type="hidden" name="contract_id" value={id}/>
 <label className={styles.field}>Gang<select name="team_id" required defaultValue=""><option value="">Choose gang</option>{(teams.data||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label className={styles.field}>Work area<select name="work_area_id" required defaultValue=""><option value="">Choose area</option>{(areas.data||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <label className={styles.field}>Measured work (m²)<input name="quantity_m2" type="number" min="0.01" max="99999" step="0.01" required inputMode="decimal"/></label>
 <label className={styles.field}>Quality check<select name="quality_status" defaultValue="passed"><option value="passed">Checked and passed</option><option value="correction_required">Correction required — not passed</option></select></label>
 <label className={styles.field}>Location details / notes<textarea name="note" maxLength={2000} rows={3} placeholder="Exact floor area, measurements or correction needed"/></label>
 </OperationsForm></section>
 <section className={styles.panel}><h2>Recorded measurements</h2>
 {checks.error?<p className={styles.warning}>Measurements are unavailable: {checks.error.message}</p>:
 (checks.data||[]).length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Date</th><th>Gang</th><th>Area</th><th>Measured</th><th>Quality</th><th>Notes</th></tr></thead><tbody>{(checks.data||[]).map(x=><tr key={x.id}><td>{x.measured_on}</td><td>{teamNames.get(x.team_id)||"Gang"}</td><td>{areaNames.get(x.work_area_id)||"Area"}</td><td>{x.quantity_m2} m²</td><td>{x.quality_status==="passed"?"Passed":"Correction needed"}</td><td>{x.note}</td></tr>)}</tbody></table></div>:<p>No gang measurements recorded yet.</p>}
 </section></>;
}
