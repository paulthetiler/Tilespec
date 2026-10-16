"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./daily.module.css";

// The daily page already presents the common tasks. Other site screens have
// one route home and secondary links, without a second row of daily actions.
export function SiteNav({ base, contractId, siteName, reference, reportIssue = false }: { base: string; contractId: string; siteName: string; reference: string; reportIssue?: boolean }) {
  const path = usePathname();
  if (path === base) return null;
  const items: [string, string][] = [[`${base}/checks`, "Morning checks"], [`${base}/workforce`, "Who's on site?"],
    [`${base}/inspections`, "Check workmanship"], [`${base}/messages`, "Office messages"],
    [`${base}/snags`, "Outstanding snags"], [`/admin/holds?contract_id=${contractId}`, "Work restrictions"],
    [`${base}/history`, "Workforce history"], [`${base}/finish`, "Finish today"], ["/admin/supervisor", "Choose another site"]];
  return <div className={styles.siteBar}>
    <p className={styles.siteName}><strong>{siteName}</strong>{reference}</p>
    <nav className={styles.siteNav} aria-label="Site">
      <Link href={base}>Today</Link>
      <details className={styles.more} key={path}><summary>More</summary><div className={styles.moreLinks}>
        {items.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}
      </div></details>
      {reportIssue ? <Link href={`${base}/report`} data-report="">Report an issue</Link> : <Link href={`/admin/holds/new?contract=${contractId}`}>STOP WORK</Link>}
    </nav>
  </div>;
}
