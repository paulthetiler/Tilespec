"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentMenuHref, type MenuSection } from "@/lib/operations/role-nav";
import styles from "./office-nav.module.css";

export function SearchBox({ id, autoFocus = false }: { id: string; autoFocus?: boolean }) {
  return <form action="/admin/search" method="get" role="search" className={styles.search}>
    <label htmlFor={id} className={styles.srOnly}>Search jobs, customers, gangs, invoices and records</label>
    <input id={id} name="q" type="search" placeholder="Search jobs, gangs, invoices…" maxLength={80} autoComplete="off" autoFocus={autoFocus} />
  </form>;
}

export function MenuLinks({ sections, onNavigate }: { sections: MenuSection[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const current = currentMenuHref(sections, pathname);
  return <>{sections.map(section => <div key={section.title} className={styles.section}>
    <h2>{section.title}</h2>
    {section.links.map(link => <Link key={link.href} href={link.href} className={styles.link} onClick={onNavigate}
      aria-current={link.href === current ? "page" : undefined}>{link.label}</Link>)}
  </div>)}</>;
}

/** The office's complete, grouped menu on a desk: the same on every page, beside the content. */
export function OfficeSidebar({ sections }: { sections: MenuSection[] }) {
  return <nav className={styles.sidebar} aria-label="Office menu">
    <SearchBox id="sidebar-search" />
    <MenuLinks sections={sections} />
  </nav>;
}
