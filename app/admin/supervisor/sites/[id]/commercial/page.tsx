import Link from "next/link";
import { canReadFinancial } from "@/lib/auth";
import { dayworksFor } from "@/lib/operations/daywork-data";
import { currentLines, dayworkReference, dayworkStatuses, dayworkWarning } from "@/lib/operations/dayworks";
import { dayLabel } from "@/lib/operations/planning";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

// Variations and dayworks are essential commercial records, so each job keeps a way in. Once the
// dayworks migration (M4) is applied, this page lists the job's dayworks. Until then, and for
// variations until M5, it has no form and no submit button: it says what to do today.
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
  const page = pages[kind === "dayworks" ? "dayworks" : "variations"];
  const base = `/admin/supervisor/sites/${id}`;
  const records = kind === "dayworks" ? await dayworksFor(supabase, id) : null;
  if (records) return <>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Dayworks</h1>
      <p className={styles.description}>Extra work paid by the hour on this job. Recording one is not permission to proceed or an agreement to pay.</p></div>
      <Link className={styles.button} href={`${base}/dayworks/new`}>Record a daywork</Link></div>
    {canReadFinancial(member) && <p className={styles.small}><Link href={`/admin/contracts/${id}#daywork-rates`}>Daywork rates for this job</Link></p>}
    <section className={styles.cardList} aria-label="Dayworks on this job">
      {[...records.dayworks].reverse().map(daywork => {
        const statuses = dayworkStatuses(daywork), lines = currentLines(daywork, records.lines), warning = dayworkWarning(daywork);
        return <article key={daywork.id} className={styles.card} data-daywork-id={daywork.id}>
          <p className={styles.eyebrow}>{dayworkReference(daywork)} · {dayLabel(daywork.instructed_on)}</p>
          <h2><Link href={`${base}/dayworks/${daywork.id}`}>{daywork.description}</Link></h2>
          <p className={styles.small}>{statuses.office} · {statuses.signature} · {statuses.charge} · {statuses.client}</p>
          <p className={styles.small}>{lines.length} {lines.length === 1 ? "line" : "lines"} · asked for by {daywork.instructed_by_name}</p>
          {warning && <p className={styles.small}>{warning}</p>}
        </article>;
      })}
      {!records.dayworks.length && <p>No dayworks on this job yet.</p>}
    </section>
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
  return <>
    <h1 className={styles.title}>{page.label}</h1>
    <p className={styles.warningBadge} role="status">Not built yet. Nothing on this page is saved.</p>
    <section className={styles.panel} aria-labelledby="now-heading">
      <h2 id="now-heading">What to do now</h2>
      <ul>{page.now.map(line => <li key={line}>{line}</li>)}</ul>
      <div className={styles.rowActions}><Link className={styles.button} href={`${base}/finish`}>Write today&apos;s handover</Link></div>
    </section>
    <section className={styles.panel} aria-labelledby="planned-heading">
      <h2 id="planned-heading">What {page.label} will record once built</h2>
      <p className={styles.muted}>New backend, awaiting approval. None of this can be recorded in TileSPEC yet.</p>
      <ul>{page.planned.map(line => <li key={line}>{line}</li>)}</ul>
    </section>
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
}
