import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actionHref, buildQueue, classChip, classNote, compute, configFromEnv, ctaLabel, idleCopy, type ViewerAction } from "@/lib/operations/next-actions";
import { loadSiteSnapshot } from "@/lib/operations/next-actions/snapshot-data";
import { WorkReleaseList } from "@/components/site/work-release-list";
import { qualityOverviewFor } from "@/lib/operations/quality-data";
import { holdScope, holdTypes } from "@/lib/operations/holds";
import { dayLabel, londonDate } from "@/lib/operations/planning";
import { checkDatabase } from "@/lib/operations/data";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import type { Member } from "@/lib/auth";
import adminStyles from "@/app/admin/admin.module.css";
import styles from "./next-actions.module.css";

type Props = {
  supabase: SupabaseClient; member: Member; contract: { id: string; reference: string; name: string; address: string };
  /** The supervisor has more than one site, so "Change site" leads somewhere. */
  changeSite?: boolean;
};

const dueText = (a: ViewerAction, today: string) => (!a.due ? "" : a.due < today ? `Overdue since ${a.due}` : a.due === today ? "Due today" : `Due ${a.due}`);

function Chips({ a, today }: { a: ViewerAction; today: string }) {
  const chip = classChip(a);
  return <span className={styles.chips}>
    <span className={`${styles.chip} ${chip.tone === "must" ? styles.must : chip.tone === "alert" ? styles.alert : ""}`}>{chip.text}</span>
    {a.overdue && <span className={`${styles.chip} ${styles.late}`}>{dueText(a, today)}</span>}
  </span>;
}

// The supervisor's Today. Every task, in every list, comes from the one shared rules engine.
// Nothing on this page decides what is next on its own.
export async function NextActionsToday({ supabase, member, contract, changeSite = false }: Props) {
  const base = `/admin/supervisor/sites/${contract.id}`;
  const config = configFromEnv(process.env);
  // With the role shell on, People, Inspect and Issues are already in the tab bar.
  const tabs = flagEnabled("roleShell", member.role);
  const { snapshot, viewer } = await loadSiteSnapshot(supabase, member, contract.id, config.planHorizonDays, { attended: true });
  const actions = compute(snapshot, viewer, config);
  const queue = buildQueue(actions);
  const hero = queue.next;
  const banner = queue.alerts.filter(a => a.state !== "ready");
  const waiting = queue.waiting.filter(a => !banner.includes(a));
  const today = snapshot.today;
  const [quality, details, documents] = await Promise.all([
    qualityOverviewFor(supabase, { contract_id: contract.id }),
    supabase.from("contracts").select("client,site_contact,scope,exclusions,tile_specification,installation_system,access_restrictions,working_hours").eq("id", contract.id).maybeSingle(),
    supabase.from("document_revisions").select("id,title,document_reference,revision").eq("contract_id", contract.id).eq("classification", "operational").not("uploaded_at", "is", null),
  ]);
  checkDatabase(details.error);
  checkDatabase(documents.error);
  const holds = snapshot.work_holds.filter(h => ["active", "correction_submitted", "awaiting_release"].includes(h.status));
  const idle = idleCopy({ activeRestrictions: holds.length > 0, waitingOnOthers: waiting.length + banner.length > 0 });
  const areaName = (id: string | null) => (id ? snapshot.work_areas.find(a => a.id === id)?.path_ids.map(p => snapshot.work_areas.find(x => x.id === p)?.name).filter(Boolean).join(" › ") : null) || "Whole site";
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  const information: [string, string][] = [["Client", "client"], ["Site contact", "site_contact"], ["Scope", "scope"], ["Exclusions", "exclusions"], ["Tile specification", "tile_specification"],
    ["Installation system", "installation_system"], ["Access", "access_restrictions"], ["Working hours", "working_hours"]]
    .map(([label, key]) => [label, String((details.data as Record<string, unknown> | null)?.[key] ?? "")]);

  const row = (a: ViewerAction) => {
    const where = [a.location].filter(Boolean).join(" › ");
    const inner = <>
      <strong>{a.title}</strong>
      {where && <span>{where}</span>}
      {a.state === "blocked" && <span>{a.blockedBy}</span>}
      {a.state === "waiting" && <span>Waiting on {a.responsible.who ?? a.responsible.label}</span>}
      <Chips a={a} today={today} />
    </>;
    return a.state === "ready" ? <Link key={a.id} className={styles.row} href={actionHref(a, base)}>{inner}</Link> : <div key={a.id} className={styles.row}>{inner}</div>;
  };

  return <div className={styles.today}>
    <header className={styles.head}>
      <div>
        <p className={styles.hello}>{firstName}</p>
        <h1 className={styles.title}>{contract.name}</h1>
        <p className={styles.sub}>{dayLabel(londonDate(), "long")}</p>
        {changeSite && <Link className={styles.change} href="/admin/supervisor">Change site</Link>}
      </div>
      <Link className={styles.report} href={`${base}/report`}>Report an issue</Link>
    </header>

    {holds.length > 0 && <section className={styles.section} aria-label="Work that is stopped">
      <h2>Work that is stopped</h2>
      {holds.map(hold => <article key={hold.id} className={`${adminStyles.warning}`}>
        <strong>{holdTypes[hold.hold_type]}: {areaName(hold.work_area_id)}</strong>
        <p>{holdScope({ ...hold, location_path: hold.location_path?.length ? hold.location_path : hold.work_area_id ? [areaName(hold.work_area_id)] : [], stage: hold.stage ?? null, activity: hold.activity ?? "" })}</p>
        <p>{hold.reason}</p>
        <p>Keep the work in this recorded scope stopped. Other restrictions still apply. {hold.hold_type === "safety" ? "Follow the principal contractor's site safety procedures. " : ""}</p>
        <p><Link className={adminStyles.secondaryButton} href={`/admin/holds/${hold.id}`}>View restriction</Link></p>
      </article>)}
    </section>}

    {banner.map(a => <section key={a.id} className={styles.alertBanner} role="status">
      <Chips a={a} today={today} />
      <strong>{a.title}</strong>
      <p>{a.why}</p>
      <p className={styles.fine}>{classNote(a)}</p>
    </section>)}

    <div className={styles.layout}>
      <div>
        {hero ? <section className={`${styles.hero} ${hero.kind === "gate" ? styles.gate : hero.kind === "alert" ? styles.alert : ""}`} aria-labelledby="next-title">
          <p className={styles.eyebrow}>Do this next</p>
          <Chips a={hero} today={today} />
          <h2 id="next-title" className={styles.heroTitle}>{hero.title}</h2>
          {hero.location && <p className={styles.where}>{hero.location}</p>}
          <p className={styles.why}>{hero.why}</p>
          <Link className={styles.cta} href={actionHref(hero, base)}>{ctaLabel(hero)}</Link>
          {hero.requires.length > 0 && <p className={styles.fine}>You will need: {hero.requires.join(", ")}.</p>}
          {hero.kind !== "reminder" && <p className={styles.fine}>{classNote(hero)}</p>}
        </section> : <section className={styles.empty}>
          <h2>{idle.title}</h2>
          <p className={styles.sub}>{idle.text}</p>
        </section>}

        {queue.then.length > 0 && <section className={styles.section} aria-label="Then">
          <h2>Then ({queue.then.length})</h2>
          <div className={styles.list}>{queue.then.map(row)}</div>
        </section>}
      </div>
      <div>
        {waiting.length > 0 && <section className={styles.section} aria-label="Waiting on others">
          <h2>Waiting on others ({waiting.length})</h2>
          <div className={styles.list}>{waiting.map(row)}</div>
        </section>}
        <section className={styles.section} aria-label="More">
          <h2>More</h2>
          <div className={styles.list}>
            {!tabs && <>
              <Link className={styles.row} href={`${base}/workforce`}><strong>Who is on site</strong><span>Arrivals, moves and leaving times</span></Link>
              <Link className={styles.row} href={`${base}/inspections`}><strong>Check workmanship</strong><span>Choose an area and check work</span></Link>
              <Link className={styles.row} href={`${base}/snags`}><strong>Outstanding snags</strong><span>Everything open on this site</span></Link>
            </>}
            <Link className={styles.row} href={`${base}/messages`}><strong>Office messages</strong><span>Instructions and requests</span></Link>
            <Link className={styles.row} href={`${base}/finish`}><strong>Finish today</strong><span>Send the handover</span></Link>
          </div>
        </section>
        <section className={styles.section} aria-label="Drawings and documents">
          <h2>Drawings and documents ({(documents.data ?? []).length})</h2>
          {(documents.data ?? []).length ? <div className={styles.list}>
            {(documents.data ?? []).map(d => <a key={d.id} className={styles.row} href={`/admin/documents/${d.id}`} target="_blank" rel="noopener noreferrer">
              <strong>{d.title}</strong><span>{d.document_reference} · Rev {d.revision} · Opens the file</span>
            </a>)}
          </div> : <p className={styles.sub}>No drawings have been uploaded for this site yet. Ask the office for the current drawings and safety instructions.</p>}
        </section>
      </div>
    </div>

    <details className={adminStyles.panel}>
      <summary><strong>Site details and earlier records</strong></summary>
      <div className={styles.list}>
        <Link className={styles.row} href={`/admin/holds?contract_id=${contract.id}`}><strong>Work restrictions and releases</strong><span>Every stop on this site, including released ones</span></Link>
        <Link className={styles.row} href={`${base}/checks`}><strong>Earlier morning checks</strong><span>Saved answers by day</span></Link>
        <Link className={styles.row} href={`${base}/history`}><strong>Workforce history</strong><span>Who worked where, and when</span></Link>
      </div>
      {quality ? <><h2>Location and activity restrictions</h2><WorkReleaseList rows={quality.work_statuses} truncated={quality.work_statuses_truncated} /></>
        : <p className={adminStyles.warning}>Work restrictions could not be checked. This page cannot confirm that affected work may go ahead. Contact the office.</p>}
      <h2>Site information</h2>
      <dl className={adminStyles.detailGrid}>{information.map(([label, value]) => <div key={label} className={adminStyles.detailItem}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl>
      <p>{contract.reference}{contract.address ? ` · ${contract.address}` : ""}</p>
    </details>
  </div>;
}
