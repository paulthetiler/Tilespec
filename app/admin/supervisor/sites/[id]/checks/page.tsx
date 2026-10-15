import Link from "next/link";
import { checkDatabase, siteStatusFor } from "@/lib/operations/data";
import { londonClock, londonDate } from "@/lib/operations/planning";
import MorningReadiness from "../../../morning-readiness";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

type MorningRecord = { id: string; actor_id: string; created_at: string; issues_count: number; answers: { item: string; status: string; note: string; response?: string }[] };
export default async function MorningChecks({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; inspection?: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  const query = await searchParams;
  const page = /^\d+$/.test(query.page || "") ? Math.min(Number(query.page), 10000) : 0;
  const selectedId = typeof query.inspection === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.inspection) ? query.inspection : null;
  const columns = "id,actor_id,created_at,issues_count,answers";
  const [status, history, selected] = await Promise.all([siteStatusFor(supabase, id, londonDate()), supabase.from("supervisor_inspections").select(columns).eq("contract_id", id).order("created_at", { ascending: false }).order("id").range(page * 20, page * 20 + 20), selectedId ? supabase.from("supervisor_inspections").select(columns).eq("id", selectedId).eq("contract_id", id).maybeSingle() : Promise.resolve({ data: null, error: null })]);
  checkDatabase(history.error);
  checkDatabase(selected.error);
  const pageChecks = (history.data || []).slice(0, 20) as MorningRecord[];
  const savedChecks = selected.data && !pageChecks.some(record => record.id === selectedId) ? [selected.data as MorningRecord, ...pageChecks] : pageChecks;
  const hasMore = (history.data || []).length > 20;
  return <>
    {status.lastCheck && <div className={styles.success} role="status">
      <h1>Morning checks complete</h1>
      <p>Morning checks were recorded at {londonClock(status.lastCheck.created_at)} today{status.lastCheck.issues_count ? ` with ${status.lastCheck.issues_count} issue${status.lastCheck.issues_count === 1 ? "" : "s"}` : ""}.</p>
      <Link className={styles.button} href={`${base}/workforce`}>Who’s on site?</Link>
      {!!status.lastCheck.issues_count && <p><Link className={styles.secondaryButton} href={`/admin/holds/new?contract=${id}&morning=${status.lastCheck.id}`}>STOP WORK — today’s finding</Link></p>}
    </div>}
    {status.lastCheck ? <details className={styles.details}><summary>Record another morning check</summary><MorningReadiness contractId={id} contractReference={contract.reference} dashboardHref={base} workforceHref={`${base}/workforce`} /></details> : <MorningReadiness contractId={id} contractReference={contract.reference} dashboardHref={base} workforceHref={`${base}/workforce`} />}
    <details open={Boolean(selectedId || page)} className={styles.details}><summary>Saved morning checks</summary><section aria-labelledby="checks-history-heading"><h2 id="checks-history-heading">Morning check history</h2>
      {selectedId && !selected.data && <p className={styles.warning}>The requested morning record is unavailable in this authorised site.</p>}
      {savedChecks.map(record => <details key={record.id} id={`morning-${record.id}`} open={record.id === selectedId} className={styles.details}><summary>{new Date(record.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })} · {record.issues_count} issue{record.issues_count === 1 ? "" : "s"}</summary>
        <p className={styles.small}>Recorded by {record.actor_id === member.user_id ? member.display_name : record.actor_id} · Reference {record.id}</p>
        <ul>{record.answers.map((answer, index) => <li key={index}><strong>{answer.item}: {answer.response ? answer.response === "na" ? "NOT APPLICABLE" : answer.response.toUpperCase() : answer.status === "issue" ? "Problem" : answer.status === "na" ? "Not applicable" : "Pass"}</strong>{answer.note && <p>{answer.note}</p>}</li>)}</ul>
        {record.issues_count > 0 && <Link className={styles.secondaryButton} href={`/admin/holds/new?contract=${id}&morning=${record.id}`}>STOP WORK — this finding</Link>}
      </details>)}
      {!savedChecks.length && <p>No saved morning checks in this history page.</p>}
      <nav className={`${styles.rowActions} ${styles.cardActions}`} aria-label="Morning check history pages">{page > 0 && <Link className={styles.secondaryButton} href={`${base}/checks?page=${page - 1}`}>Previous page</Link>}{hasMore && <Link className={styles.secondaryButton} href={`${base}/checks?page=${page + 1}`}>Next page</Link>}</nav>
    </section></details>
  </>;
}
