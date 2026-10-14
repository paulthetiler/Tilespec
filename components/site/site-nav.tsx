"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/admin/admin.module.css";

// The same short route back to every part of the site, on every site screen.
export function SiteNav({ base, contractId }: { base: string; contractId: string }) {
  const path = usePathname();
  const items: [string, string][] = [[base, "Site dashboard"], [`${base}/checks`, "Morning checks"], [`${base}/workforce`, "Today's workforce"],
    [`${base}/inspections`, "Location inspections"], [`${base}/history`, "Workforce history"], [`/admin/snags?contract_id=${contractId}`, "Snag register"]];
  return <nav aria-label="Site"><ul className={styles.siteNav}>
    {items.map(([href, label]) => <li key={href}><Link href={href} aria-current={path === href ? "page" : undefined}>{label}</Link></li>)}
  </ul></nav>;
}
