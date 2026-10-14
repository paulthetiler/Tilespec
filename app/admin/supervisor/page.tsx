import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { siteRoles } from "./site-access";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

// A supervisor with one site goes straight to it. Anyone with several chooses,
// and can jump directly to a site's workforce.
export default async function SupervisorHub() {
  const { supabase, member } = await requireActor();
  if (!(siteRoles as readonly string[]).includes(member.role)) {
    return <p className={styles.empty}>The Supervisor Hub is for supervisors and the office. Your allocated work is on the contract page.</p>;
  }
  const contracts = await contractsFor(supabase);
  if (member.role === "supervisor" && contracts.length === 1) redirect(`/admin/supervisor/sites/${contracts[0].id}`);
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Site operations</p><h1 className={styles.title}>Choose your site</h1>
      <p className={styles.description}>Welcome, {member.display_name}. Open the site you are working on today.</p></div>
      <Link className={styles.secondaryButton} href="/admin/supervisor/inspections">Issues and inspections</Link></div>
    {contracts.length === 0 ? <p className={styles.empty}>No sites are assigned to you. Ask the office to assign you to a contract.</p>
      : <div className={styles.cardList}>{contracts.map(contract => <article key={contract.id} className={styles.card}>
        <h2>{contract.name}</h2><p className={styles.small}>{[contract.reference, contract.address].filter(Boolean).join(" · ")}</p>
        <div className={`${styles.rowActions} ${styles.cardActions}`}>
          <Link className={styles.button} href={`/admin/supervisor/sites/${contract.id}`}>Open site dashboard</Link>
          <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${contract.id}/workforce`}>Today&apos;s workforce</Link>
        </div>
      </article>)}</div>}
  </>;
}
