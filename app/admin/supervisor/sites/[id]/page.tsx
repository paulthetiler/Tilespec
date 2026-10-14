import Link from "next/link";
import { emptySnagCounts, type SnagRegister } from "@/lib/operations/snags";
import css from "@/components/snags/snags.module.css";
import { insuranceSummary } from "@/lib/operations/companies";
import { checkDatabase, companyRecordsFor, siteDayFor, siteStatusFor } from "@/lib/operations/data";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { buildSiteDay, nextAction } from "@/lib/operations/site-day";
import { insuranceTypeLabels } from "@/lib/operations/types";
import { ExceptionList } from "@/components/site/workforce-day";
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
  const [{ records, stale }, status, cover, details, documents, snagResult] = await Promise.all([
    siteDayFor(supabase, id, day), siteStatusFor(supabase, id, day), companyRecordsFor(supabase),
    supabase.from("contracts").select("client,site_contact,scope,exclusions,tile_specification,installation_system,access_restrictions,working_hours").eq("id", id).maybeSingle(),
    supabase.from("document_revisions").select("id,title,document_reference,revision,classification").eq("contract_id", id).eq("classification", "operational").not("uploaded_at", "is", null),
    supabase.rpc("snag_register", { p_filters: { contract_id: id }, p_page: 0 }),
  ]);
  checkDatabase(details.error);
  checkDatabase(documents.error);
  const snagUnavailable = !!snagResult.error && ["PGRST202", "42883"].includes(snagResult.error.code);
  if (!snagUnavailable) checkDatabase(snagResult.error);
  const snagCounts = snagUnavailable ? emptySnagCounts : (snagResult.data as SnagRegister).counts;
  const site = buildSiteDay(records);
  const next = nextAction({ siteHref: base, issuesHref, checksDone: status.lastCheck !== null, staleOpen: stale.length, openIssues: snagUnavailable ? status.openIssues : snagCounts.open, day: site, snags: snagCounts });

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
    <section className={styles.panel} aria-label="Snag actions">
      <div className={styles.rowActions}><Link className={styles.bigButton} href={`/admin/snags/new?contract=${id}`}>Raise snag</Link><Link className={styles.secondaryButton} href={issuesHref}>Open snag register</Link><Link className={styles.secondaryButton} href={`${issuesHref}&awaiting_reinspection=true`}>Reinspect repairs</Link></div>
      <p>Report urgent findings immediately; morning checks never block snag reporting.</p>
      {snagUnavailable && <p>The snag workflow needs the reviewed Phase 3B migration before it can be used. Existing morning checks and workforce records remain available.</p>}
      {!!snagCounts.critical && <div className={css.critical}><strong>{snagCounts.critical} critical defects require immediate office review.</strong><p>Escalation does not authorise a formal hold or release.</p></div>}
      <div className={styles.metrics}>{[["Outstanding snags",snagCounts.open],["Critical defects",snagCounts.critical],["Awaiting reinspection",snagCounts.awaiting_reinspection],["Disputed responsibility",snagCounts.disputed],["Overdue repairs",snagCounts.overdue]].map(([label,count])=><div className={styles.metric} key={label}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{count}</strong></div>)}</div>
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
        <li className={`${styles.step} ${styles.comingLater}`}><div><span className={styles.stepTitle}>5. Daily handover</span><p>Not available yet.</p></div></li>
      </ol>
      <div className={`${styles.rowActions} ${styles.cardActions}`}>
        <Link className={styles.secondaryButton} href={`${base}/history`}>Workforce history</Link>
        <p className={styles.small}>Who worked where and when, and who recorded it.</p>
      </div>
    </section>

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
