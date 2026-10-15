import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { siteRoles } from "./site-access";
import styles from "../admin.module.css";
import dailyStyles from "@/components/site/daily.module.css";

export const dynamic = "force-dynamic";

export default async function SupervisorHub({ searchParams }: { searchParams: Promise<{ site?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  if (!(siteRoles as readonly string[]).includes(member.role)) {
    return <p className={styles.empty}>Site dashboards are for supervisors and the office. Your allocated work is on the contract page.</p>;
  }
  const contracts = await contractsFor(supabase);
  if (member.role === "supervisor" && contracts.length === 1) redirect(`/admin/supervisor/sites/${contracts[0].id}`);
  const { site } = await searchParams;
  if (typeof site === "string" && contracts.some(contract => contract.id === site)) redirect(`/admin/supervisor/sites/${site}`);
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Your working day</p><h1 className={styles.title}>Choose your site</h1>
      <p className={styles.description}>Hello, {firstName}. Where are you working today?</p></div>
      {member.role !== "supervisor" && <Link className={styles.secondaryButton} href="/admin/quality">Quality control</Link>}</div>
    {contracts.length === 0 ? <p className={styles.empty}>No sites are assigned to you. Ask the office to assign your site.</p>
      : <div className={dailyStyles.siteList}>{contracts.map(contract => <Link key={contract.id} className={dailyStyles.siteChoice} href={`/admin/supervisor/sites/${contract.id}`}>
        <strong>{contract.name}</strong><span>{[contract.reference, contract.address].filter(Boolean).join(" · ")}</span><span>Open today →</span>
      </Link>)}</div>}
  </>;
}
