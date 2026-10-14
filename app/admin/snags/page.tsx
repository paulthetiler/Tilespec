import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { checkRpc, contractsFor, locationsFor } from "@/lib/operations/data";
import { snagRegisterFor } from "@/lib/operations/snags-data";
import { defectCategories, snagFilters, snagStatuses, statusLabels, responsibilityLabels } from "@/lib/operations/snags";
import { installationStages, installationStageLabels } from "@/lib/operations/types";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { ConnectionStatus } from "@/components/site/connection-status";
import styles from "../admin.module.css";
import css from "@/components/snags/snags.module.css";
export const dynamic="force-dynamic";
export default async function SnagRegister({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {supabase,member}=await requireActor(),q=await searchParams,filters=snagFilters(q);
 const page=typeof q.page==="string"&&/^\d+$/.test(q.page)?Math.min(Number(q.page),100000):0;
 const [register,contracts,teams,operatives,locations]=await Promise.all([
  snagRegisterFor(supabase,filters,page),contractsFor(supabase),supabase.from("teams").select("id,name").order("name"),
  supabase.from("operatives").select("id,display_name").order("display_name"),
  typeof filters.contract_id==="string"?locationsFor(supabase,filters.contract_id):Promise.resolve([]),
 ]);checkRpc(teams.error);checkRpc(operatives.error);
 const index=indexLocations(locations),staff=["owner","contracts_manager","supervisor"].includes(member.role);
 const defaultValue=(key:string)=>typeof filters[key]==="string"?String(filters[key]):"";
 const pageLink=(p:number)=>{const query=new URLSearchParams();for(const [key,value] of Object.entries(filters))query.set(key,String(value));query.set("page",String(p));return `/admin/snags?${query}`;};
 const selectedContract=contracts.find(c=>c.id===filters.contract_id);
 return <><ConnectionStatus/><h1 className={styles.title}>Snag register</h1>
  <p>{selectedContract?`${selectedContract.reference} · ${selectedContract.name}`:"Authorised sites"}. Saved findings, responsibility decisions and every repair attempt stay in the history.</p>
  {staff&&<div className={styles.rowActions}><Link className={styles.bigButton} href={`/admin/snags/new${filters.contract_id?`?contract=${filters.contract_id}`:""}`}>Raise snag</Link></div>}
  {register.counts.critical>0&&<div className={css.critical} role="status"><strong>{register.counts.critical} critical defect{register.counts.critical===1?"":"s"} require immediate office review.</strong><p>Escalation does not create a formal stop-work hold or authorise release.</p></div>}
  <section aria-label="Snag counts" className={styles.metrics}>{Object.entries(register.counts).map(([key,count])=><div className={styles.metric} key={key}><span className={styles.metricLabel}>{({open:"Open snags",critical:"Critical",awaiting_rectification:"Awaiting rectification",awaiting_reinspection:"Awaiting reinspection",disputed:"Disputed responsibility",overdue:"Overdue",closed:"Closed"} as Record<string,string>)[key]}</span><strong className={styles.metricValue}>{count}</strong></div>)}</section>
  <details className={styles.details} open><summary>Find and filter snags</summary><form method="get" className={styles.form}>
   <div className={css.filters}>
    <label>Site<select name="contract_id" defaultValue={defaultValue("contract_id")}><option value="">All authorised sites</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.reference} · {c.name}</option>)}</select></label>
    <label>Location<select name="location_id" defaultValue={defaultValue("location_id")}><option value="">All locations</option>{orderLocations(locations).map(l=><option key={l.id} value={l.id}>{locationPath(index,l.id)}</option>)}</select></label>
    <label>Stage<select name="stage" defaultValue={defaultValue("stage")}><option value="">All stages</option>{installationStages.map(stage=><option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
    <label>Responsible gang<select name="team_id" defaultValue={defaultValue("team_id")}><option value="">All / unknown</option>{(teams.data||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Defect category<select name="category" defaultValue={defaultValue("category")}><option value="">All categories</option>{defectCategories.map(category=><option key={category}>{category}</option>)}</select></label>
    <label>Severity<select name="severity" defaultValue={defaultValue("severity")}><option value="">All severities</option>{["minor","major","critical"].map(s=><option key={s}>{s}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={defaultValue("status")}><option value="">All statuses</option>{[...snagStatuses,"rectification_reported","reinspection_required"].map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
    <label>Assigned repair gang<select name="assigned_team_id" defaultValue={defaultValue("assigned_team_id")}><option value="">All gangs</option>{(teams.data||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Assigned repair operative<select name="assigned_operative_id" defaultValue={defaultValue("assigned_operative_id")}><option value="">All operatives</option>{(operatives.data||[]).map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}</select></label>
    <label>Search finding<input type="search" name="search" maxLength={200} defaultValue={defaultValue("search")}/></label>
   </div>
   {[["overdue","Overdue"],["awaiting_reinspection","Awaiting reinspection"],["disputed","Disputed responsibility"]].map(([key,label])=><label className={styles.checkboxRow} key={key}><input type="checkbox" name={key} defaultChecked={!!filters[key]}/>{label}</label>)}
   <div className={styles.rowActions}><button className={styles.button}>Apply filters</button><Link className={styles.secondaryButton} href="/admin/snags">Clear filters</Link></div>
  </form></details>
  <p>{register.total} matching record{register.total===1?"":"s"} · Page {page+1}. Counts above are totals for the selected authorised site scope.</p>
  {register.rows.map(snag=><article key={snag.id} className={snag.severity==="critical"&&!['closed','cancelled','draft'].includes(snag.snag_status||snag.state)?css.critical:css.card}>
   <h2>{snag.check_label}</h2><p>{snag.contract_reference} · {snag.contract_name} · {snag.location_path?.join(" › ")||"Legacy morning-check finding (location not classified)"}</p>
   <div className={css.badges}><span>{statusLabels[snag.snag_status||snag.state]}</span>{snag.severity&&<span>{snag.severity}</span>}{snag.overdue&&<span>Overdue</span>}{snag.escalated&&<span>Escalated to office</span>}</div>
   <p>{snag.description}</p><p>{snag.responsibility_state&&`Responsibility: ${responsibilityLabels[snag.responsibility_state]}${snag.responsible_team?` · ${snag.responsible_team}`:""}`}</p>
   {(snag.repair_team||snag.repair_operative)&&<p>Repair: {snag.repair_team||snag.repair_operative} · target {snag.target_date}</p>}
   <Link className={styles.button} href={`/admin/snags/${snag.id}`}>{snag.snag_status==="draft"?"Resume draft":"Open snag"}</Link>
  </article>)}
  {!register.rows.length&&<p>No matching snags.</p>}
  <nav aria-label="Snag register pages" className={styles.rowActions}>{page>0&&<Link className={styles.secondaryButton} href={pageLink(page-1)}>Previous page</Link>}{(page+1)*50<register.total&&<Link className={styles.secondaryButton} href={pageLink(page+1)}>Next page</Link>}</nav>
 </>;
}
