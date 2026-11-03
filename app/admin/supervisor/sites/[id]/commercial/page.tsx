import Link from "next/link";
import { canManageContracts, canReadFinancial } from "@/lib/auth";
import { dayworksFor } from "@/lib/operations/daywork-data";
import { currentLines, dayworkReference, dayworkStatuses, goAheadLine, kindWords } from "@/lib/operations/dayworks";
import { dayLabel } from "@/lib/operations/planning";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

// Variations and dayworks are essential site records, so each job keeps a way in. This page lists
// them once their database updates are applied (dayworks M4, variations C2). Until then it has no
// form and no submit button: it says what to do today.
const pages = {
  variations: {
    label: "Variations",
    now: [
      "Do not start work outside the agreed scope until the office confirms the variation.",
      "Record what changed, where, who asked for it and photos, using your current agreed site process.",
      "Write it in today's handover under \"Important information for the office\".",
    ],
    planned: [
      "The change to the agreed scope, and where",
      "Who requested or instructed it, and when",
      "Associated costs: labour, materials and other costs (office and owner only)",
      "Supporting photos and documents",
      "Approval status: requested, priced, approved or rejected, with who decided and when",
    ],
  },
  dayworks: {
    label: "Dayworks",
    now: [
      "Get the office's authorisation before starting extra work on day rates.",
      "Record who instructed it, what was done, the people and hours, the materials and photos, using your current agreed site process.",
      "Write it in today's handover under \"Important information for the office\".",
    ],
    planned: [
      "The extra work, and where it was done",
      "Who instructed it, and when",
      "People on the work and their labour hours",
      "Materials used",
      "Photos of the work",
      "Authorisation and sign-off: who approved it and when",
    ],
  },
} as const;

export default async function AdditionalWork({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const { kind } = await searchParams;
  const wanted = kind === "dayworks" ? "daywork" : "variation", words = kindWords[wanted];
  const page = pages[wanted === "daywork" ? "dayworks" : "variations"];
  const base = `/admin/supervisor/sites/${id}`;
  const loaded = await dayworksFor(supabase, id, undefined, { office: canManageContracts(member) });
  // Variations need their own database update; until it is applied this page says what to do instead.
  const records = loaded && (wanted === "daywork" || loaded.variations) ? loaded : null;
  if (records) {
    const list = records.dayworks.filter(daywork => daywork.kind === wanted);
    return <>
      <div className={styles.pageHeader}><div><h1 className={styles.title}>{words.plural}</h1>
        <p className={styles.description}>{wanted === "variation"
          ? "Changes to the agreed work on this job. Raise one before starting the change: it goes ahead only once TileSPEC says so."
          : "Extra work paid by the hour on this job. Recording one is not permission to proceed or an agreement to pay."}</p></div>
        <Link className={styles.button} href={`${base}/dayworks/new${wanted === "variation" ? "?kind=variation" : ""}`}>{wanted === "variation" ? "Raise a variation" : "Record a daywork"}</Link></div>
      {canReadFinancial(member) && <p className={styles.small}><Link href={`/admin/contracts/${id}#daywork-rates`}>Day rates for this job</Link></p>}
      <section className={styles.cardList} aria-label={`${words.plural} on this job`}>
        {[...list].reverse().map(daywork => {
          const statuses = dayworkStatuses(daywork, records.office?.get(daywork.id)), lines = currentLines(daywork, records.lines);
          return <article key={daywork.id} className={styles.card} data-daywork-id={daywork.id}>
            <p className={styles.eyebrow}>{dayworkReference(daywork)} · {dayLabel(daywork.instructed_on)}</p>
            <h2><Link href={`${base}/dayworks/${daywork.id}`}>{daywork.description}</Link></h2>
            <p className={styles.small}>{[statuses.office, wanted === "daywork" ? statuses.signature : null, statuses.client, statuses.charge].filter(Boolean).join(" · ")}</p>
            <p className={styles.small}>{lines.length} {lines.length === 1 ? "line" : "lines"} · asked for by {daywork.instructed_by_name}</p>
            <p className={styles.small} data-go-ahead={records.goAhead.get(daywork.id) ?? "unknown"}>{goAheadLine(records.goAhead.get(daywork.id))}</p>
          </article>;
        })}
        {!list.length && <p>No {words.plural.toLowerCase()} on this job yet.</p>}
      </section>
      <Link className={styles.secondaryButton} href={base}>Back to today</Link>
    </>;
  }
  return <>
    <h1 className={styles.title}>{page.label}</h1>
    <p className={styles.warningBadge} role="status">Not available yet. Nothing on this page is saved.</p>
    <section className={styles.panel} aria-labelledby="now-heading">
      <h2 id="now-heading">What to do now</h2>
      <ul>{page.now.map(line => <li key={line}>{line}</li>)}</ul>
      <div className={styles.rowActions}><Link className={styles.button} href={`${base}/finish`}>Write today&apos;s handover</Link></div>
    </section>
    <section className={styles.panel} aria-labelledby="planned-heading">
      <h2 id="planned-heading">What {page.label} will record once built</h2>
      <p className={styles.muted}>Available once the office applies the database update. None of this can be recorded in TileSPEC yet.</p>
      <ul>{page.planned.map(line => <li key={line}>{line}</li>)}</ul>
    </section>
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
}
