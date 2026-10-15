import Link from "next/link";
import { emptySnagCounts, type SnagRegister } from "@/lib/operations/snags";
import { holdScope, holdStatusLabels, holdTypes } from "@/lib/operations/holds";
import css from "@/components/snags/snags.module.css";
import { insuranceSummary } from "@/lib/operations/companies";
import { checkDatabase, companyRecordsFor, siteDayFor, siteStatusFor } from "@/lib/operations/data";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { buildSiteDay, nextAction } from "@/lib/operations/site-day";
import { insuranceTypeLabels } from "@/lib/operations/types";
import { ExceptionList } from "@/components/site/workforce-day";
import { WorkReleaseList } from "@/components/site/work-release-list";
import { qualityOverviewFor, holdNotificationsFor } from "@/lib/operations/quality-data";
import { requireSite } from "../../site-access";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

// The supervisor's start of day: what is planned, who is actually here, and
// the one thing to do next, all from saved records.
export default async function SiteDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const day = londonDate();
  const base = `/admin/supervisor/sites/${id}`;
  const issuesHref = `/admin/snags?contract_id=${id}`;
  const holdsHref = `/admin/holds?contract_id=${id}`;
  const [{ records, stale }, status, cover, details, documents, snagResult, quality, alerts] = await Promise.all([
    siteDayFor(supabase, id, day), siteStatusFor(supabase, id, day), companyRecordsFor(supabase),
    supabase.from("contracts").select("client,site_contact,scope,exclusions,tile_specification,installation_system,access_restrictions,working_hours").eq("id", id).maybeSingle(),
    supabase.from("document_revisions").select("id,title,document_reference,revision,classification").eq("contract_id", id).eq("classification", "operational").not("uploaded_at", "is", null),
    supabase.rpc("snag_register", { p_filters: { contract_id: id }, p_page: 0 }),
    qualityOverviewFor(supabase, { contract_id: id }), holdNotificationsFor(supabase, id, true),
  ]);
  checkDatabase(details.error);
  checkDatabase(documents.error);
  // Select active rows independently of the register's mixed-status page: old
  // released safety records must never hide a current quality restriction.
  const activeHolds = quality ? await supabase.from("work_holds")
    .select("id,hold_type,reason,activity,location_path,stage,status,work_package_id,work_packages(name)")
    .eq("contract_id", id).in("status", ["active", "correction_submitted", "awaiting_release"])
    .order("raised_at", { ascending: false }).limit(10) : { data: [], error: null };
  checkDatabase(activeHolds.error);
  const snagUnavailable = !!snagResult.error && ["PGRST202", "42883"].includes(snagResult.error.code);
  if (!snagUnavailable) checkDatabase(snagResult.error);
  const snagCounts = snagUnavailable ? emptySnagCounts : (snagResult.data as SnagRegister).counts;
  const site = buildSiteDay(records);
  const next = nextAction({ siteHref: base, issuesHref, checksDone: status.lastCheck !== null, staleOpen: stale.length, openIssues: snagUnavailable ? status.openIssues : snagCounts.open, day: site, snags: snagCounts,
    holds: quality ? { href: holdsHref, ...quality.counts, ...quality.quality_counts } : undefined });

  // Warnings worth acting on today, most urgent first.
  const companiesOnSite = new Set([...site.cards.flatMap(card => card.periods), ...site.unplanned].filter(period => period.open && period.company).map(period => period.company!.id));
  const coverWarnings = records.companies.filter(company => companiesOnSite.has(company.id)).flatMap(company => {
    const summary = insuranceSummary(cover.insurances, company.id, day);
    if (summary.status === "none") return [`${company.name} is on site with no insurance recorded.`];
    if (summary.status === "valid" || !summary.attention) return [];
    const kind = insuranceTypeLabels[summary.attention.entry.insurance_type];
    return [`${company.name} is on site and its ${kind.toLowerCase()} insurance ${summary.status === "expired" ? "has expired" : "expires soon"}. Tell the office.`];
  });
  const warnings = site.exceptions.filter(item => ["team_absent", "operative_missing", "provisional"].includes(item.kind));
  const dataDetails = details.data ?? {};
  const information: [string, string][] = [["Client", "client"], ["Site contact", "site_contact"], ["Scope", "scope"], ["Exclusions", "exclusions"],
    ["Tile specification", "tile_specification"], ["Installation system", "installation_system"], ["Access", "access_restrictions"], ["Working hours", "working_hours"]]
    .map(([label, key]) => [label, String((dataDetails as Record<string, unknown>)[key] ?? "")]);
  const steps = [
    { title: "Morning readiness checks", done: status.lastCheck !== null, status: status.lastCheck ? `Recorded at ${londonClock(status.lastCheck.created_at)}` : "Not recorded today", href: `${base}/checks`, label: "Morning checks" },
    { title: "Today's workforce", done: site.summary.unconfirmed === 0 && stale.length === 0,
      status: site.summary.plannedTeams ? `${site.summary.confirmedTeams + site.summary.notOnSite} of ${site.summary.plannedTeams} planned teams confirmed` : "Nothing planned today", href: `${base}/workforce`, label: "Today's workforce" },
    { title: "Outstanding snags", done: snagCounts.open === 0, status: `${snagCounts.open} open · ${snagCounts.awaiting_reinspection} awaiting reinspection`, href: issuesHref, label: "Open snag register" },
  ];
  return <>
    <section className={styles.panel} aria-label="Site actions">
      <div className={styles.cardButtons}>
        <Link className={styles.bigButton} href={`/admin/holds/new?contract=${id}`}>Stop work</Link>
        <Link className={`${styles.bigButton} ${styles.quietButton}`} href={`/admin/snags/new?contract=${id}`}>Raise snag</Link>
      </div>
      <div className={`${styles.rowActions} ${styles.cardActions}`}>
        <Link className={styles.secondaryButton} href={`${base}/checks`}>Start today&apos;s checks</Link>
        <Link className={styles.secondaryButton} href={`${base}/workforce`}>Confirm workforce</Link>
        <Link className={styles.secondaryButton} href={`${base}/inspections`}>Inspect location</Link>
        <Link className={styles.secondaryButton} href={holdsHref}>Review holds</Link>
        <Link className={styles.secondaryButton} href={`${base}/workforce#finish-heading`}>Finish today</Link>
      </div>
      <p>Stop affected work or raise a snag immediately. Earlier checklist steps do not block urgent reporting. Only a confirmed database save records a hold.</p>
      {snagUnavailable && <p>The snag workflow needs the reviewed Phase 3B migration before it can be used. Existing morning checks and workforce records remain available.</p>}
      {!quality && <p className={styles.warning}>Hold and work-release status are unavailable until the reviewed Phase 3C migration is applied. This screen cannot confirm permission to proceed.</p>}
      {!!quality?.counts.active_safety && <div className={css.critical} role="status"><strong>{quality.counts.active_safety} active safety stop{quality.counts.active_safety === 1 ? "" : "s"}.</strong><p>Affected work must remain stopped. Review each recorded location and activity; follow the principal contractor&apos;s site-safety procedures.</p><Link className={styles.button} href={`${holdsHref}&hold_type=safety`}>Review safety stops</Link></div>}
      {!!snagCounts.critical && <div className={css.critical}><strong>{snagCounts.critical} critical defects require immediate office review.</strong><p>Raise a linked, scoped hold where affected work must stop.</p></div>}
      {!!activeHolds.data?.length && <section aria-label="Active work restrictions"><h2>Affected work — active restrictions</h2>
        {activeHolds.data.map(hold => {
          const relation = hold.work_packages as unknown as { name: string } | { name: string }[] | null;
          const packageName = (Array.isArray(relation) ? relation[0] : relation)?.name;
          return <article key={hold.id} className={hold.hold_type === "safety" ? css.critical : css.card}>
            <h3>{holdTypes[hold.hold_type as keyof typeof holdTypes]}</h3>
            <strong>{holdScope({ ...hold, activity: hold.activity || "", work_package_name: packageName || null })}</strong>
            <p>{hold.reason}</p><p>{holdStatusLabels[hold.status]}</p>
            <Link className={styles.button} href={`/admin/holds/${hold.id}`}>Review this restriction</Link>
          </article>;
        })}
        {(quality!.counts.active_quality + quality!.counts.active_safety) > 10 && <p>Showing the ten most recent active restrictions. <Link href={holdsHref}>Review every hold and its scope</Link>.</p>}
      </section>}
      {quality && <div className={styles.metrics} aria-label="Quality and release counts">{[["Active quality holds",quality.counts.active_quality],["Active safety stops",quality.counts.active_safety],["Pending release authorisations",quality.counts.awaiting_release],["Inspections due",quality.quality_counts.inspections_due],["Failed inspections",quality.quality_counts.failed_inspections],["Failed mandatory inspections",quality.quality_counts.failed_mandatory]].map(([label,count])=><div className={styles.metric} key={label}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{count}</strong></div>)}</div>}
      <div className={styles.metrics}>{[["Outstanding snags",snagCounts.open],["Critical defects",snagCounts.critical],["Awaiting reinspection",snagCounts.awaiting_reinspection],["Disputed responsibility",snagCounts.disputed],["Overdue repairs",snagCounts.overdue]].map(([label,count])=><div className={styles.metric} key={label}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{count}</strong></div>)}</div>
      <div className={styles.rowActions}><Link className={styles.secondaryButton} href={issuesHref}>Open snag register</Link><Link className={styles.secondaryButton} href={`${issuesHref}&awaiting_reinspection=true`}>Reinspect repairs</Link><Link className={styles.secondaryButton} href={`/admin/alerts?contract_id=${id}`}>{alerts ? `Site alerts (${alerts.unread} unread)` : "Site alerts"}</Link></div>
    </section>
    <section className={styles.nextAction} aria-labelledby="next-heading">
      <h2 id="next-heading">Next: {dayLabel(day, "long")}</h2>
      <Link className={styles.bigButton} href={next.href}>{next.label}</Link>
      <p>{next.detail}</p>
    </section>

    <section aria-label="Today on site" className={styles.metrics}>
      {[["Planned teams", site.summary.plannedTeams], ["Teams confirmed", site.summary.confirmedTeams], ["Not confirmed", site.summary.unconfirmed],
        ["People on site now", site.summary.presentNow], ["Locations in use", site.summary.activeLocations]].map(([label, value]) =>
        <div key={label} className={styles.metric}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong></div>)}
    </section>

    {(stale.length > 0 || warnings.length > 0 || coverWarnings.length > 0) && <section className={styles.panel} aria-labelledby="warnings-heading">
      <h2 id="warnings-heading">Site warnings</h2>
      <ul className={styles.exceptionList}>
        {stale.length > 0 && <li><strong>Unfinished work:</strong> {stale.length} {stale.length === 1 ? "period" : "periods"} of work from an earlier day {stale.length === 1 ? "was" : "were"} never finished. <Link href={`${base}/workforce#earlier-work`}>Finish {stale.length === 1 ? "it" : "them"}</Link></li>}
        {coverWarnings.map(text => <li key={text}><strong>Insurance:</strong> {text}</li>)}
      </ul>
      {warnings.length > 0 && <div className={styles.cardActions}><ExceptionList exceptions={warnings} empty="" /></div>}
    </section>}

    <section className={styles.panel} aria-labelledby="day-heading">
      <h2 id="day-heading">Your day</h2>
      <ol className={styles.steps}>
        {steps.map((step, index) => <li key={step.title} className={`${styles.step} ${step.done ? styles.stepDone : step.href === next.href ? styles.stepNext : ""}`}>
          <div><span className={styles.stepTitle}>{index + 1}. {step.title}{step.done ? " ✓" : ""}</span><p>{step.status}</p></div>
          <Link className={styles.secondaryButton} href={step.href}>{step.label}</Link>
        </li>)}
        <li className={styles.step}><div><span className={styles.stepTitle}>4. Location inspections</span><p>Record checks against a location and its actual workforce history.</p></div><Link className={styles.secondaryButton} href={`${base}/inspections`}>Location inspections</Link></li>
        <li className={styles.step}><div><span className={styles.stepTitle}>5. Review holds and release requests</span><p>{quality ? `${quality.counts.active_quality} quality holds · ${quality.counts.active_safety} safety stops · ${quality.counts.awaiting_release} awaiting independent release` : "Hold status is not available."}</p></div><Link className={styles.secondaryButton} href={holdsHref}>Review holds</Link></li>
        <li className={styles.step}><div><span className={styles.stepTitle}>6. Finish today</span><p>Record when today&apos;s work stopped; outstanding defects and holds stay in their own history.</p></div><Link className={styles.secondaryButton} href={`${base}/workforce#finish-heading`}>Finish today</Link></li>
      </ol>
      <div className={`${styles.rowActions} ${styles.cardActions}`}>
        <Link className={styles.secondaryButton} href={`${base}/history`}>Workforce history</Link>
        <p className={styles.small}>Who worked where and when, and who recorded it.</p>
      </div>
    </section>

    {quality && <section className={styles.panel} aria-labelledby="release-heading"><h2 id="release-heading">Location and activity restrictions</h2><WorkReleaseList rows={quality.work_statuses} truncated={quality.work_statuses_truncated} /></section>}

    <section className={styles.panel} aria-labelledby="job-heading">
      <h2 id="job-heading">Job information</h2>
      <details className={styles.details}><summary>Contract details</summary>
        <dl className={styles.detailGrid}>{information.map(([label, value]) => <div key={label} className={styles.detailItem}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl>
      </details>
      <details className={styles.details}><summary>Drawings and RAMS ({(documents.data ?? []).length})</summary>
        {(documents.data ?? []).length ? <ul className={styles.documentList}>{(documents.data ?? []).map(document => <li key={document.id} className={styles.documentRow}>
          <div>{document.title} · {document.document_reference} · Rev {document.revision}</div></li>)}</ul>
          : <p className={styles.small}>No approved operational documents uploaded. Do not work from unverified drawings.</p>}
      </details>
      <p className={styles.small}>{records.locations.filter(location => !location.archived_at).length} locations recorded on this site.</p>
    </section>
  </>;
}
