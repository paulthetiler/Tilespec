import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, type Member } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { buildQueue, compute, configFromEnv, flagEnabled, siteSummaryCopy } from "@/lib/operations/next-actions";
import { loadSiteSnapshot } from "@/lib/operations/next-actions/snapshot-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteRoles } from "./site-access";
import styles from "../admin.module.css";
import dailyStyles from "@/components/site/daily.module.css";

export const dynamic = "force-dynamic";

// A supervisor with several sites sees what is waiting at each, from the same shared engine as
// Today. The site is not treated as attended here, so the daily routine starts when it is opened.
const SUMMARY_LIMIT = 10;
async function siteSummary(supabase: SupabaseClient, member: Member, contractId: string) {
  try {
    const config = configFromEnv(process.env);
    const { snapshot, viewer } = await loadSiteSnapshot(supabase, member, contractId, config.planHorizonDays, { attended: false });
    const queue = buildQueue(compute(snapshot, viewer, config));
    const stopped = snapshot.work_holds.filter(hold => ["active", "correction_submitted", "awaiting_release"].includes(hold.status)).length;
    return siteSummaryCopy({ next: queue.next?.title ?? null, todo: (queue.next ? 1 : 0) + queue.then.length, stopped });
  } catch {
    // A summary is a convenience. The site itself still opens and reports its own errors.
    return null;
  }
}

export default async function SupervisorHub({ searchParams }: { searchParams: Promise<{ site?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  if (!(siteRoles as readonly string[]).includes(member.role)) {
    return <p className={styles.empty}>Site dashboards are for supervisors and the office. Your allocated work is on the contract page.</p>;
  }
  const contracts = await contractsFor(supabase);
  if (member.role === "supervisor" && contracts.length === 1) redirect(`/admin/supervisor/sites/${contracts[0].id}`);
  const { site } = await searchParams;
  if (typeof site === "string" && contracts.some(contract => contract.id === site)) redirect(`/admin/supervisor/sites/${site}`);
  const summarise = member.role === "supervisor" && flagEnabled("nextActions", member.role) && contracts.length <= SUMMARY_LIMIT;
  const summaries = summarise ? await Promise.all(contracts.map(contract => siteSummary(supabase, member, contract.id))) : [];
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Your working day</p><h1 className={styles.title}>Choose your site</h1>
      <p className={styles.description}>Hello, {firstName}. Where are you working today?</p></div>
      {member.role !== "supervisor" && <Link className={styles.secondaryButton} href="/admin/quality">Quality control</Link>}</div>
    {contracts.length === 0 ? <p className={styles.empty}>No sites are assigned to you. Ask the office to assign your site.</p>
      : <div className={dailyStyles.siteList}>{contracts.map((contract, index) => {
        const summary = summaries[index];
        return <Link key={contract.id} className={dailyStyles.siteChoice} href={`/admin/supervisor/sites/${contract.id}`}>
          <strong>{contract.name}</strong><span>{[contract.reference, contract.address].filter(Boolean).join(" · ")}</span>
          {summary && <span className={dailyStyles.siteNext}>{summary.line}</span>}
          {summary?.stopped && <span className={dailyStyles.siteStopped}>{summary.stopped}</span>}
          <span>Open today →</span>
        </Link>;
      })}</div>}
  </>;
}
