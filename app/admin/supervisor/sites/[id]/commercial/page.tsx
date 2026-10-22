import Link from "next/link";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

// Variations and dayworks are essential commercial records, so each job keeps a way in. Nothing
// records them yet (New backend, awaiting approval). This page therefore has no form and no
// submit button: it says what to do today and what the record will hold once it is built.
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
  const { contract } = await requireSite(id);
  if (!contract) return null;
  const { kind } = await searchParams;
  const page = pages[kind === "dayworks" ? "dayworks" : "variations"];
  const base = `/admin/supervisor/sites/${id}`;
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
