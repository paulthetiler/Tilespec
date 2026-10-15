import Link from "next/link";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase, checkRpc, contractsFor, locationsFor } from "@/lib/operations/data";
import { qualityOverviewFor } from "@/lib/operations/quality-data";
import { qualityFilters, qualityStatusLabel } from "@/lib/operations/quality";
import { holdStatusLabels, holdTypes } from "@/lib/operations/holds";
import { installationStageLabels, installationStages, type InstallationStage } from "@/lib/operations/types";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { WorkReleaseList } from "@/components/site/work-release-list";
import { ConnectionStatus } from "@/components/site/connection-status";
import styles from "../admin.module.css";
import css from "@/components/snags/snags.module.css";

export const dynamic = "force-dynamic";

export default async function QualityControl({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) return <p className={styles.empty}>Quality control is for authorised office owners and managers. <Link href="/admin/supervisor">Open your site dashboard</Link> to review affected work.</p>;
  const q = await searchParams, filters = qualityFilters(q);
  const page = typeof q.page === "string" && /^\d+$/.test(q.page) ? Math.min(Number(q.page), 100000) : 0;
  const [overview, contracts, teams, locations] = await Promise.all([
    qualityOverviewFor(supabase, filters, page), contractsFor(supabase),
    supabase.from("teams").select("id,name").order("name"),
    filters.contract_id ? locationsFor(supabase, filters.contract_id) : Promise.resolve([]),
  ]);
  checkRpc(teams.error);
  const blockers = filters.contract_id ? await supabase.from("supervisor_issues")
    .select("id,inspection_id,check_label,description,created_at")
    .eq("contract_id", filters.contract_id).is("snag_status", null).neq("state", "closed")
    .order("created_at", { ascending: false }).limit(20) : { data: [], error: null };
  checkDatabase(blockers.error);
  const index = indexLocations(locations);
  const pageHref = (next: number) => { const query = new URLSearchParams(filters); query.set("page", String(next)); return `/admin/quality?${query}`; };
  return <>
    <ConnectionStatus />
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Office oversight</p><h1 className={styles.title}>Quality control</h1><p className={styles.description}>Saved restrictions, independent release requests and inspection requirements across your authorised sites.</p></div><Link className={styles.secondaryButton} href="/admin/alerts">Site alerts</Link></div>
    <details className={styles.details} open><summary>Filter affected work</summary><form method="get" className={styles.form}>
      <div className={css.filters}>
        <label>Site<select name="contract_id" defaultValue={filters.contract_id || ""}><option value="">All authorised sites</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.reference} · {c.name}</option>)}</select></label>
        <label>Location<select name="location_id" defaultValue={filters.location_id || ""}><option value="">All locations</option>{orderLocations(locations).map(l => <option key={l.id} value={l.id}>{locationPath(index, l.id)}</option>)}</select><small>Select and apply a site first to choose its location.</small></label>
        <label>Assigned team<select name="team_id" defaultValue={filters.team_id || ""}><option value="">All teams</option>{(teams.data || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Stage<select name="stage" defaultValue={filters.stage || ""}><option value="">All stages</option>{installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
        <label>Hold status<select name="status" defaultValue={filters.status || ""}><option value="">All statuses</option>{Object.entries(holdStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
        <label>Hold type<select name="hold_type" defaultValue={filters.hold_type || ""}><option value="">Quality and safety</option>{Object.entries(holdTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label>Work-release status<select name="work_status" defaultValue={filters.work_status || ""}><option value="">All location activities</option>{["not_assessed", "awaiting_inspection", "blocked_quality", "stopped_safety", "awaiting_release", "released"].map(status => <option key={status} value={status}>{qualityStatusLabel(status)}</option>)}</select></label>
      </div>
      <label className={styles.checkboxRow}><input type="checkbox" name="overdue" defaultChecked={filters.overdue === "true"} />Overdue corrective actions</label>
      <label className={styles.checkboxRow}><input type="checkbox" name="rejected" defaultChecked={filters.rejected === "true"} />Release requests returned for further work</label>
      <div className={styles.rowActions}><button className={styles.button}>Apply filters</button><Link className={styles.secondaryButton} href="/admin/quality">Clear filters</Link></div>
    </form></details>
    <section className={styles.panel} aria-labelledby="daily-updates-heading"><h2 id="daily-updates-heading">Daily site updates</h2>
      <p>Send site instructions, request inspections and read the supervisors’ permanent handovers.</p>
      <div className={styles.rowActions}>{contracts.filter(contract => !filters.contract_id || contract.id === filters.contract_id).map(contract => <Link key={contract.id} className={styles.secondaryButton} href={`/admin/supervisor/sites/${contract.id}/messages`}>{contract.name} — office messages</Link>)}<Link className={styles.secondaryButton} href={`/admin/snags${filters.contract_id ? `?contract_id=${filters.contract_id}` : ""}`}>View site snags</Link></div>
      {!!blockers.data?.length && <><h3>Morning blockers needing attention</h3><p className={styles.small}>Latest 20 open morning findings for the selected site.</p><div className={styles.cardList}>{blockers.data.map(issue => <article className={styles.card} key={issue.id}><h4>{issue.check_label}</h4><p>{issue.description}</p><Link href={`/admin/supervisor/sites/${filters.contract_id}/checks?inspection=${issue.inspection_id}#morning-${issue.inspection_id}`}>View saved morning check</Link></article>)}</div><Link href={`/admin/snags?contract_id=${filters.contract_id}`}>View all site issues</Link></>}
    </section>
    {!overview ? <p className={styles.warning}>Quality holds and work-release status are unavailable until the reviewed Phase 3C migration is applied. No permission to proceed is implied.</p> : <>
      <section aria-label="Office quality counts" className={styles.metrics}>{[
        ["Safety stops", overview.counts.active_safety], ["Quality holds", overview.counts.active_quality], ["Awaiting release", overview.counts.awaiting_release],
        ["Overdue corrective actions", overview.counts.overdue], ["Rejected release requests", overview.counts.rejected], ["Critical snags", overview.quality_counts.critical_snags],
        ["Inspections due", overview.quality_counts.inspections_due], ["Failed inspections", overview.quality_counts.failed_inspections], ["Failed mandatory inspections", overview.quality_counts.failed_mandatory],
        ["Blocked locations", overview.quality_counts.blocked_locations], ["Released locations", overview.quality_counts.released_locations],
      ].map(([label, count]) => <div className={styles.metric} key={label}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{count}</strong></div>)}</section>
      <p className={styles.small}>Counts use saved records within the selected scope. Critical snags use the site, location, stage and team selections. A team may be involved through responsibility or assigned correction work. Release status is assessed separately for each location and stage.</p>
      <section className={styles.panel} aria-labelledby="attention-heading"><h2 id="attention-heading">Hold decisions requiring attention</h2>
        <p>{overview.total} matching hold{overview.total === 1 ? "" : "s"} · Page {page + 1}.</p>
        <div className={styles.cardList}>{overview.rows.map(hold => <article key={hold.id} className={hold.hold_type === "safety" && !["released", "superseded", "entered_in_error"].includes(hold.status) ? css.critical : styles.card}>
          <p className={styles.eyebrow}>{hold.contract_reference} · {hold.contract_name}</p><h3>{hold.reason}</h3>
          <p>{hold.location_path?.join(" › ") || "Entire site"} · {hold.stage ? installationStageLabels[hold.stage as InstallationStage] || hold.stage : "All installation activities"}</p>
          <p><span className={hold.hold_type === "safety" ? styles.dangerBadge : styles.warningBadge}>{holdTypes[hold.hold_type as keyof typeof holdTypes]}</span> <span className={styles.badge}>{qualityStatusLabel(hold.status)}</span>{hold.overdue && <> <span className={styles.dangerBadge}>Overdue</span></>}</p>
          {(hold.assigned_team_name || hold.assigned_operative_name) && <p>Correction: {hold.assigned_team_name || hold.assigned_operative_name}{hold.target_date ? ` · target ${hold.target_date}` : ""}</p>}
          <Link className={styles.button} href={`/admin/holds/${hold.id}`}>Review hold and audit trail</Link>
        </article>)}</div>
        {!overview.rows.length && <p>No matching holds.</p>}
        <nav className={`${styles.rowActions} ${styles.cardActions}`} aria-label="Quality control pages">{page > 0 && <Link className={styles.secondaryButton} href={pageHref(page - 1)}>Previous page</Link>}{(page + 1) * 50 < overview.total && <Link className={styles.secondaryButton} href={pageHref(page + 1)}>Next page</Link>}</nav>
      </section>
      <section className={styles.panel} aria-labelledby="locations-heading"><h2 id="locations-heading">Location activity release status</h2><WorkReleaseList rows={overview.work_statuses} truncated={overview.work_statuses_truncated} contracts={contracts} /></section>
    </>}
    <div className={styles.rowActions}><Link className={styles.secondaryButton} href={`/admin/snags?${filters.contract_id ? `contract_id=${filters.contract_id}&` : ""}severity=critical`}>Review critical snags</Link><Link className={styles.secondaryButton} href="/admin/supervisor">Choose site dashboard</Link></div>
  </>;
}
