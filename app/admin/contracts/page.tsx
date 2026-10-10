import Link from "next/link";
import { canManageContracts, requireActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { calendarDate } from "@/components/operations/format";
import styles from "../admin.module.css";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 160) : "";
  const contracts = await contractsFor(supabase);
  const filtered = q ? contracts.filter(c => [c.reference, c.name, c.client, c.address].some(value => value.toLowerCase().includes(q.toLowerCase()))) : contracts;
  return (
    <>
      <div className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>Project register</p><h1 className={styles.title}>{canManageContracts(member) ? "Contracts" : "My contracts"}</h1><p className={styles.description}>Your authorised contracts and current mobilisation records.</p></div>
        {canManageContracts(member) && <Link href="/admin/contracts/new" className={styles.button}>New contract</Link>}
      </div>
      <form method="get" className={styles.search}>
        <label className={styles.field}>Search contracts<input name="q" defaultValue={q} maxLength={160} placeholder="Reference, project, client or site" type="search" /></label>
        <button className={styles.secondaryButton} type="submit">Search</button>
        {q && <Link href="/admin/contracts" className={styles.secondaryButton}>Clear</Link>}
      </form>
      <p className={styles.small}>{filtered.length} {filtered.length === 1 ? "contract" : "contracts"}{q ? " matching your search" : " available"}</p>
      <div className={styles.contractList}>
        {filtered.map(c => <Link key={c.id} href={`/admin/contracts/${c.id}`} className={styles.contractCard}>
          <div className={styles.cardTop}><span className={styles.eyebrow}>{c.reference}</span><span className={styles.warningBadge}>Draft · unreleased</span></div>
          <h2>{c.name}</h2><p>{c.client}</p><p className={styles.muted}>{c.address}</p>
          <div className={styles.meta}><span>Start: {calendarDate(c.start_date)}</span><span>End: {calendarDate(c.end_date)}</span></div>
        </Link>)}
        {filtered.length === 0 && <div className={styles.empty}><h2>{q ? "No matching contracts" : "No contracts available"}</h2><p>{q ? "Try a different project name or reference." : canManageContracts(member) ? "Create a draft contract to record scope, work areas and project documents." : "An owner or contracts manager needs to allocate your contract or work package."}</p></div>}
      </div>
    </>
  );
}
