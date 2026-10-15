import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { isRecordId } from "@/lib/operations/daily-input";
import { installationStageLabels, installationStages, type InstallationStage } from "@/lib/operations/types";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
type OutstandingSnag = {
  id: string; check_label: string; description: string; state: string; snag_status: string | null;
  location_path: string[] | null; severity: string | null; target_date: string | null; created_at: string;
  inspection_id: string | null; stage: InstallationStage | null;
};
const plainStatuses: Record<string, string> = {
  open: "Needs attention", assigned: "Repair arranged", rectification_submitted: "Ready to check",
  reinspection: "Recheck in progress", rectification_reported: "Repair reported", reinspection_required: "Needs another check",
};
export default async function OutstandingSnags({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ location_id?: string; stage?: string; package?: string; page?: string }>;
}) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const filters = await searchParams, base = `/admin/supervisor/sites/${id}`;
  if ((filters.location_id && !isRecordId(filters.location_id)) || (filters.package && !isRecordId(filters.package))
    || (filters.stage && !(installationStages as readonly string[]).includes(filters.stage))
    || (filters.page && (!/^\d+$/.test(filters.page) || Number(filters.page) > 100000))) notFound();
  const page = Number(filters.page || 0), perPage = 20;
  const [locationResult, packageResult] = await Promise.all([
    filters.location_id ? supabase.from("work_areas").select("id,name,path_ids").eq("contract_id", id).eq("id", filters.location_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    filters.package ? supabase.from("work_packages").select("id,name").eq("contract_id", id).eq("id", filters.package).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  checkDatabase(locationResult.error);
  checkDatabase(packageResult.error);
  if ((filters.location_id && !locationResult.data) || (filters.package && !packageResult.data)) notFound();

  // Use the signed-in session and the existing issue RLS. The relation filter
  // checks each issue location's ancestor path in PostgreSQL, avoiding a capped
  // client-side location list or a very long list of descendant IDs.
  const columns = "id,check_label,description,state,snag_status,location_path,severity,target_date,created_at,inspection_id,stage";
  let query = supabase.from("supervisor_issues").select(filters.location_id ? `${columns},area:work_areas!snag_area!inner(path_ids)` : columns, { count: "exact" })
    .eq("contract_id", id)
    .or("and(snag_status.is.null,state.neq.closed),snag_status.in.(open,assigned,rectification_submitted,reinspection)");
  if (filters.location_id) query = query.contains("area.path_ids", [filters.location_id]);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.package) query = query.eq("work_package_id", filters.package);
  const result = await query.order("escalated", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id")
    .range(page * perPage, page * perPage + perPage - 1);
  checkDatabase(result.error);
  if (result.count === null) throw new Error("The outstanding snag count could not be confirmed. Refresh and try again.");
  const snags = (result.data || []) as unknown as OutstandingSnag[];
  const total = result.count, narrowed = Boolean(filters.location_id || filters.stage || filters.package);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (filters.location_id) next.set("location_id", filters.location_id);
    if (filters.stage) next.set("stage", filters.stage);
    if (filters.package) next.set("package", filters.package);
    next.set("page", String(nextPage));
    return `${base}/snags?${next}`;
  };
  return <>
    <h2 className={styles.title}>Outstanding snags</h2>
    <p>{locationResult.data ? `${locationResult.data.name} and the areas inside it` : "This site"}{filters.stage ? ` · ${installationStageLabels[filters.stage as InstallationStage]}` : ""}{packageResult.data ? ` · ${packageResult.data.name}` : ""}.</p>
    <div className={styles.cardButtons}>
      <Link className={styles.button} href={`/admin/snags/new?contract=${id}${filters.location_id ? `&location=${filters.location_id}` : ""}`}>Raise a snag</Link>
      <Link className={styles.secondaryButton} href={`/admin/holds/new?contract=${id}`}>STOP WORK</Link>
    </div>
    <p role="status">{total} outstanding {total === 1 ? "problem" : "problems"}{total > perPage ? ` · Page ${page + 1}` : ""}.</p>
    <section className={styles.cardList} aria-label="Outstanding site problems">
      {snags.map(snag => <article className={styles.card} key={snag.id}>
        <h3>{snag.check_label}</h3>
        <p className={styles.small}>{snag.location_path?.length ? snag.location_path.join(" → ") : "Morning check — location not specified"}{snag.stage ? ` · ${installationStageLabels[snag.stage]}` : ""}</p>
        <p><strong>{plainStatuses[snag.snag_status || snag.state] || "Needs attention"}</strong>{snag.severity === "critical" ? " · Serious problem — contact the office now" : ""}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{snag.description}</p>
        {snag.target_date && <p className={styles.small}>Repair needed by {new Date(`${snag.target_date}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "Europe/London" })}.</p>}
        <div className={styles.rowActions}><Link className={styles.button} href={`/admin/snags/${snag.id}`}>View snag</Link>
          {!snag.snag_status && snag.inspection_id && <Link className={styles.secondaryButton} href={`${base}/checks?inspection=${snag.inspection_id}#morning-${snag.inspection_id}`}>View morning check</Link>}
        </div>
      </article>)}
      {!snags.length && <p>{total ? "There are no more problems on this page. Use the previous page." : narrowed ? "No outstanding snags match this area and work." : "No outstanding snags or morning-check problems recorded for this site."}</p>}
    </section>
    {(page > 0 || (page + 1) * perPage < total) && <nav className={styles.rowActions} aria-label="Outstanding snag pages">
      {page > 0 && <Link className={styles.secondaryButton} href={pageHref(page - 1)}>Previous page</Link>}
      {(page + 1) * perPage < total && <Link className={styles.secondaryButton} href={pageHref(page + 1)}>Next page</Link>}
    </nav>}
    {narrowed && <p><Link href={`${base}/snags`}>View all outstanding problems for this site</Link>, including morning checks without a location.</p>}
    <div className={styles.rowActions}><Link className={styles.secondaryButton} href={base}>Back to today</Link>
      <Link className={styles.secondaryButton} href={`/admin/snags?contract_id=${id}`}>{canManageContracts(member) ? "Open office snag register" : "All snags and history"}</Link>
    </div>
  </>;
}
