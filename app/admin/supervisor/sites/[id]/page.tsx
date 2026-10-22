import Link from "next/link";
import { emptySnagCounts, type SnagRegister } from "@/lib/operations/snags";
import { holdScope, holdTypes } from "@/lib/operations/holds";
import { checkDatabase, companyRecordsFor, contractsFor, siteDayFor, siteStatusFor } from "@/lib/operations/data";
import { insuranceSummary } from "@/lib/operations/companies";
import { insuranceTypeLabels } from "@/lib/operations/types";
import { outstandingQa, unacknowledgedInstructions } from "@/lib/operations/daily";
import { supervisorDailyFor } from "@/lib/operations/daily-data";
import { dayLabel, londonClock, londonDate } from "@/lib/operations/planning";
import { buildSiteDay } from "@/lib/operations/site-day";
import { WorkReleaseList } from "@/components/site/work-release-list";
import { qualityOverviewFor } from "@/lib/operations/quality-data";
import { requireSite } from "../../site-access";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { NextActionsToday } from "@/components/site/next-actions-today";
import styles from "../../../admin.module.css";
import dailyStyles from "@/components/site/daily.module.css";

export const dynamic = "force-dynamic";

export default async function SiteDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contract, member } = await requireSite(id);
  if (!contract) return null;
  // Behind FEATURE_NEXT_ACTIONS: the shared Next Action engine decides what comes next. The
  // original page below remains the default until the flag is switched on.
  if (member.role === "supervisor" && flagEnabled("nextActions", member.role)) {
    const sites = await contractsFor(supabase);
    return <NextActionsToday supabase={supabase} member={member} contract={contract} changeSite={sites.length > 1} />;
  }
  const day = londonDate();
  const base = `/admin/supervisor/sites/${id}`;
  const issuesHref = `${base}/snags`;
  const fullRegisterHref = `/admin/snags?contract_id=${id}`;
  const holdsHref = `/admin/holds?contract_id=${id}`;
  const [{ records, stale }, status, cover, details, documents, snagResult, quality, daily] = await Promise.all([
    siteDayFor(supabase, id, day), siteStatusFor(supabase, id, day), companyRecordsFor(supabase),
    supabase.from("contracts").select("client,site_contact,scope,exclusions,tile_specification,installation_system,access_restrictions,working_hours").eq("id", id).maybeSingle(),
    supabase.from("document_revisions").select("id,title,document_reference,revision").eq("contract_id", id).eq("classification", "operational").not("uploaded_at", "is", null),
    supabase.rpc("snag_register", { p_filters: { contract_id: id }, p_page: 0 }),
    qualityOverviewFor(supabase, { contract_id: id }), supervisorDailyFor(supabase, id),
  ]);
  checkDatabase(details.error);
  checkDatabase(documents.error);
  // Read active holds independently: historical releases must never hide a
  // current restriction from the supervisor's everyday view.
  const activeHolds = quality ? await supabase.from("work_holds")
    .select("id,hold_type,reason,activity,location_path,stage,status,work_package_id,work_packages(name)")
    .eq("contract_id", id).in("status", ["active", "correction_submitted", "awaiting_release"])
    .order("hold_type", { ascending: false }).order("raised_at", { ascending: false }).limit(10) : { data: [], error: null };
  checkDatabase(activeHolds.error);
  const snagUnavailable = !!snagResult.error && ["PGRST202", "42883"].includes(snagResult.error.code);
  if (!snagUnavailable) checkDatabase(snagResult.error);
  const snagCounts = snagUnavailable ? emptySnagCounts : (snagResult.data as SnagRegister).counts;
  const site = buildSiteDay(records);
  const companiesOnSite = new Set([...site.cards.flatMap(card => card.periods), ...site.unplanned]
    .filter(period => period.open && period.company).map(period => period.company!.id));
  const coverWarnings = records.companies.filter(company => companiesOnSite.has(company.id)).flatMap(company => {
    const summary = insuranceSummary(cover.insurances, company.id, day);
    if (summary.status === "none") return [`${company.name} is on site with no insurance recorded.`];
    if (summary.status === "valid" || !summary.attention) return [];
    const kind = insuranceTypeLabels[summary.attention.entry.insurance_type];
    return [`${company.name} is on site and its ${kind.toLowerCase()} insurance ${summary.status === "expired" ? "has expired" : "expires soon"}. Tell the office.`];
  });
  const qaRequests = daily ? outstandingQa(daily.items, daily.submissions) : [];
  const unread = daily ? unacknowledgedInstructions(daily.items, daily.acknowledgements, member.user_id).length : 0;
  const handover = daily?.handovers.find(row => row.work_date === day && row.actor_id === member.user_id);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  const next = !status.lastCheck
    ? { href: `${base}/checks`, label: "START MORNING CHECKS", detail: "A short check of your people, materials and work areas." }
    : stale.length > 0
      ? { href: `${base}/workforce#earlier-work`, label: "FINISH EARLIER WORK", detail: "Some earlier work still needs a finish time before you confirm today." }
      : site.summary.unconfirmed > 0
        ? { href: `${base}/workforce`, label: "WHO'S ON SITE?", detail: "Confirm the people here today. Use the same record for arrivals, moves and leaving times." }
        : qaRequests.length > 0
          ? { href: `${base}/tasks/${qaRequests[0].id}`, label: "INSPECT WORK", detail: `The office has asked you to check: ${qaRequests[0].title}.` }
          : { href: `${base}/inspections`, label: "CHECK WORKMANSHIP", detail: "Choose the area you are checking. Site requirements and work restrictions still apply." };
  const information: [string, string][] = [["Client", "client"], ["Site contact", "site_contact"], ["Scope", "scope"], ["Exclusions", "exclusions"],
    ["Tile specification", "tile_specification"], ["Installation system", "installation_system"], ["Access", "access_restrictions"], ["Working hours", "working_hours"]]
    .map(([label, key]) => [label, String((details.data as Record<string, unknown> | null)?.[key] ?? "")]);
  const actions = [
    { label: "Who's on site?", href: `${base}/workforce`, detail: `${site.summary.presentNow} ${site.summary.presentNow === 1 ? "person" : "people"} recorded here` },
    { label: "Check workmanship", href: `${base}/inspections`, detail: "Choose an area and check work" },
    { label: "Raise a snag", href: `/admin/snags/new?contract=${id}`, detail: "Photo, location and a short note" },
    { label: "Office messages", href: `${base}/messages`, detail: unread ? `${unread} to acknowledge` : "Instructions for this site" },
  ];

  return <div className={dailyStyles.day}>
    <header className={dailyStyles.intro}>
      <p className={dailyStyles.greeting}>{greeting}, {firstName}</p>
      <h1 className={dailyStyles.title}>{contract.name}</h1>
      <p className={dailyStyles.date}>{dayLabel(day, "long")}</p>
      <p className={dailyStyles.muted}>Here&apos;s what needs doing today.</p>
    </header>

    <section className={dailyStyles.actions} aria-label="Site actions">
      <div className={dailyStyles.urgent}>
        <p>Serious safety or quality concern? Stop affected work and tell the office.</p>
        <Link className={dailyStyles.stop} href={`/admin/holds/new?contract=${id}`}>STOP WORK</Link>
      </div>
      {!quality && <p className={styles.warning}>Work restrictions could not be checked. This page cannot confirm that affected work may go ahead. Contact the office.</p>}
      {!!quality?.counts.active_safety && <div className={`${dailyStyles.restriction} ${dailyStyles.safety}`} role="status">
        <h2>{quality.counts.active_safety} safety stop{quality.counts.active_safety === 1 ? " remains" : "s remain"} active</h2>
        <p>Keep the affected locations and activities stopped. Check each restriction and follow the principal contractor&apos;s site safety procedures.</p>
        <Link href={`${holdsHref}&hold_type=safety`}>Review safety stops</Link>
      </div>}
      {!!snagCounts.critical && <div className={`${dailyStyles.restriction} ${dailyStyles.safety}`}>
        <h2>{snagCounts.critical} critical defect{snagCounts.critical === 1 ? " needs" : "s need"} office attention</h2>
        <p>Stop affected work where necessary and use STOP WORK to record the restriction.</p>
        <Link href={`${fullRegisterHref}&severity=critical`}>Review critical defects</Link>
      </div>}
      {!!activeHolds.data?.length && <section className={dailyStyles.restrictions} aria-label="Active work restrictions">
        <h2>Affected work — active restrictions</h2>
        {activeHolds.data.map(hold => {
          const relation = hold.work_packages as unknown as { name: string } | { name: string }[] | null;
          const packageName = (Array.isArray(relation) ? relation[0] : relation)?.name;
          return <article key={hold.id} className={`${dailyStyles.restriction} ${hold.hold_type === "safety" ? dailyStyles.safety : ""}`}>
            <h3>{holdTypes[hold.hold_type as keyof typeof holdTypes]} — keep affected work stopped</h3>
            <strong>{holdScope({ ...hold, activity: hold.activity || "", work_package_name: packageName || null })}</strong>
            <p>{hold.reason}</p>
            {hold.hold_type === "safety" && <p>Follow the principal contractor&apos;s site safety procedures.</p>}
            <Link href={`/admin/holds/${hold.id}`}>View restriction</Link>
          </article>;
        })}
        {(quality!.counts.active_quality + quality!.counts.active_safety) > 10 && <p>Showing up to ten active restrictions, with safety stops first. <Link href={holdsHref}>View all affected work</Link>.</p>}
      </section>}
      <div className={dailyStyles.next}>
        {status.lastCheck && <p>Morning checks completed at {londonClock(status.lastCheck.created_at)} ✓</p>}
        <Link className={dailyStyles.primary} href={next.href}>{next.label}</Link>
        <p>{next.detail}</p>
      </div>
      <div className={dailyStyles.tiles} aria-label="Everyday tasks">
        {actions.map(action => <Link className={dailyStyles.tile} key={action.label} href={action.href} aria-label={action.label}>
          <span>{action.label}</span><small>{action.detail}</small>
        </Link>)}
      </div>
    </section>

    <section className={dailyStyles.tasks} aria-labelledby="qa-heading">
      <h2 id="qa-heading">Work awaiting sign-off</h2>
      {!daily ? <p>Office requests are not available yet. Contact the office if a check has been requested.</p>
        : qaRequests.length === 0 ? <p className={dailyStyles.muted}>No inspection requests from the office are waiting for your result.</p>
          : qaRequests.slice(0, 3).map(request => <article className={dailyStyles.task} key={request.id}>
            <h3>{request.title} — Inspection requested</h3>
            <p>{request.location_path.join(" → ")}<br />Office has requested QA confirmation.</p>
            <div className={dailyStyles.taskActions}>
              <Link className={styles.button} href={`${base}/tasks/${request.id}`}>INSPECT WORK</Link>
              <Link className={styles.secondaryButton} href={`${base}/snags?${new URLSearchParams({ ...(request.work_area_id ? { location_id: request.work_area_id } : {}), ...(request.stage ? { stage: request.stage } : {}), ...(request.work_package_id ? { package: request.work_package_id } : {}) })}`}>VIEW OUTSTANDING SNAGS</Link>
            </div>
          </article>)}
      {qaRequests.length > 3 && <Link className={styles.secondaryButton} href={`${base}/messages?kind=qa_request`}>View all {qaRequests.length} inspection requests</Link>}
    </section>

    <section className={dailyStyles.finish} aria-labelledby="finish-day-heading">
      <h2 id="finish-day-heading">At the end of the day</h2>
      <p>{handover ? `Your handover was saved at ${londonClock(handover.created_at)}. You can review it or add a later update.` : "Pass on what is finished, any problems and what you need tomorrow."}</p>
      <Link className={dailyStyles.finishButton} href={`${base}/finish`}>FINISH TODAY</Link>
    </section>

    <details className={dailyStyles.secondary}>
      <summary>Site details and earlier records</summary>
      <div className={dailyStyles.secondaryLinks}>
        <Link href={holdsHref}>Work restrictions and releases</Link>
        <Link href={issuesHref}>Outstanding snags ({snagUnavailable ? "unavailable" : snagCounts.open})</Link>
        <Link href={fullRegisterHref}>Detailed snag register</Link>
        <Link href={`${base}/history`}>Workforce history</Link>
        <Link href={`${base}/checks`}>Earlier morning checks</Link>
        <Link href="/admin/supervisor">Choose another site</Link>
      </div>
      {coverWarnings.length > 0 && <><h2>Insurance to check with the office</h2><ul>{coverWarnings.map(text => <li key={text}>{text}</li>)}</ul></>}
      {snagUnavailable && <p>Snag records are not available. Contact the office.</p>}
      {stale.length > 0 && <p>{stale.length} earlier {stale.length === 1 ? "work record needs" : "work records need"} a finish time. <Link href={`${base}/workforce#earlier-work`}>Review earlier work</Link></p>}
      {quality && <><h2>Location and activity restrictions</h2><WorkReleaseList rows={quality.work_statuses} truncated={quality.work_statuses_truncated} /></>}
      <h2>Site information</h2>
      <dl className={styles.detailGrid}>{information.map(([label, value]) => <div key={label} className={styles.detailItem}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl>
      <h2>Drawings and site documents</h2>
      {(documents.data ?? []).length ? <ul>{(documents.data ?? []).map(document => <li key={document.id}><a href={`/admin/documents/${document.id}`} target="_blank" rel="noopener noreferrer">{document.title} · {document.document_reference} · Rev {document.revision}</a></li>)}</ul>
        : <p>No approved site documents have been uploaded. Ask the office for the current drawings and safety instructions.</p>}
      <p>{contract.reference}{contract.address ? ` · ${contract.address}` : ""}</p>
    </details>
  </div>;
}
