import Link from "next/link";
import { canManageContracts, requireActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { calendarDate } from "@/components/operations/format";
import { jobStage, stageLabels } from "@/lib/operations/command-centre";
import { londonDate } from "@/lib/operations/planning";
import { isDemoRecord } from "@/lib/operations/demo";
import styles from "../admin.module.css";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; invoice?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  const today = londonDate();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 160) : "";
  const invoiceMode = params.invoice === "1";
  const contracts = await contractsFor(supabase);
  const filtered = q ? contracts.filter(c => [c.reference, c.name, c.client, c.address].some(value => value.toLowerCase().includes(q.toLowerCase()))) : contracts;
  return (
    <>
      <div className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>Project register</p><h1 className={styles.title}>{invoiceMode ? "Choose a contract to invoice" : canManageContracts(member) ? "Contracts" : "My contracts"}</h1><p className={styles.description}>{invoiceMode ? "Select a contract to open its accounts and invoicing directly." : "Your authorised contracts and current mobilisation records."}</p></div>
        {invoiceMode ? <Link href="/admin/invoices" className={styles.secondaryButton}>Back to invoices</Link> : canManageContracts(member) && <Link href="/admin/contracts/new" className={styles.button}>New contract</Link>}
      </div>
      <form method="get" className={styles.search}>
        {invoiceMode && <input type="hidden" name="invoice" value="1" />}
        <label className={styles.field}>Search contracts<input name="q" defaultValue={q} maxLength={160} placeholder="Reference, project, client or site" type="search" /></label>
        <button className={styles.secondaryButton} type="submit">Search</button>
        {q && <Link href={invoiceMode ? "/admin/contracts?invoice=1" : "/admin/contracts"} className={styles.secondaryButton}>Clear</Link>}
      </form>
      <p className={styles.small}>{filtered.length} {filtered.length === 1 ? "contract" : "contracts"}{q ? " matching your search" : " available"}</p>
      <div className={styles.contractList}>
        {filtered.map(c => <Link key={c.id} href={invoiceMode ? `/admin/contracts/${c.id}/accounts` : `/admin/contracts/${c.id}`} className={styles.contractCard}>
          <div className={styles.cardTop}><span className={styles.eyebrow}>{c.reference}</span>{isDemoRecord(c) && <span className={styles.warningBadge}>Demo record</span>}{!invoiceMode && (() => { const { stage, confirmed } = jobStage((c as { lifecycle_stage?: string | null }).lifecycle_stage, c.start_date, c.end_date, today);
            return <span className={["on_hold", "lost"].includes(stage) ? styles.warningBadge : styles.badge}>{stageLabels[stage]}{confirmed ? "" : " (by dates)"}</span>; })()}</div>
          <h2>{c.name}</h2><p>{c.client}</p><p className={styles.muted}>{c.address}</p>
          <div className={styles.meta}><span>Start: {calendarDate(c.start_date)}</span><span>End: {calendarDate(c.end_date)}</span></div>
        </Link>)}
        {filtered.length === 0 && <div className={styles.empty}><h2>{q ? "No matching contracts" : "No contracts available"}</h2><p>{q ? "Try a different project name or reference." : canManageContracts(member) ? "Create a draft contract to record scope, work areas and project documents." : "An owner or contracts manager needs to allocate your contract or work package."}</p></div>}
      </div>
    </>
  );
}
