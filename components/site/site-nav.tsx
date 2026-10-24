"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./daily.module.css";

// Today holds every site task, one tap away. Other site screens need only a way
// back to it and the one action that is always available: reporting an issue.
export function SiteNav({ base, contractId, siteName, reference, reportIssue = false }: { base: string; contractId: string; siteName: string; reference: string; reportIssue?: boolean }) {
  const path = usePathname();
  if (path === base) return null;
  return <div className={styles.siteBar}>
    <p className={styles.siteName}><strong>{siteName}</strong>{reference}</p>
    <nav className={styles.siteNav} aria-label="Site">
      <Link href={base}>← Today</Link>
      {reportIssue ? <Link href={`${base}/report`} data-report="">Report an issue</Link> : <Link href={`/admin/holds/new?contract=${contractId}`}>STOP WORK</Link>}
    </nav>
  </div>;
}
