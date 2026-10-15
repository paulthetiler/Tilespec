import Link from "next/link";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
export default async function AdditionalWork({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const { contract } = await requireSite(id);
  if (!contract) return null;
  const { kind } = await searchParams;
  const dayworks = kind === "dayworks", label = dayworks ? "Dayworks" : "Variations";
  return <>
    <h2 className={styles.title}>{label}</h2>
    <section className={styles.panel}><h3>Contact the office before starting extra work</h3>
      <p>{dayworks ? "Daywork recording and approval will be added in the next delivery stage." : "Variation recording and approval will be added in the next delivery stage."} TileSPEC does not yet record {label.toLowerCase()} or approve their rates.</p>
      <p>Use your current agreed site process to record who instructed the work, what is required and any evidence. Ask the office to confirm authorisation and commercial terms.</p>
      <p>You can read instructions from the office here and include extra-work concerns in your daily handover.</p>
      <div className={styles.rowActions}><Link className={styles.button} href={`/admin/supervisor/sites/${id}/messages`}>Office messages</Link><Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}/finish`}>Daily handover</Link></div>
    </section>
    <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}`}>Back to today</Link>
  </>;
}
