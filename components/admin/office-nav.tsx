"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentMenuHref, type MenuSection } from "@/lib/operations/role-nav";
import styles from "./office-nav.module.css";

function SearchBox({ id }: { id: string }) {
  return <form action="/admin/search" method="get" role="search" className={styles.search}>
    <label htmlFor={id} className={styles.srOnly}>Search jobs, customers, gangs, invoices and records</label>
    <input id={id} name="q" type="search" placeholder="Search everything" maxLength={80} autoComplete="off" />
  </form>;
}

function Links({ sections }: { sections: MenuSection[] }) {
  const pathname = usePathname() ?? "";
  const current = currentMenuHref(sections, pathname);
  return <>{sections.map(section => <div key={section.title} className={styles.section}>
    <h2>{section.title}</h2>
    {section.links.map(link => <Link key={link.href} href={link.href} className={styles.link} aria-current={link.href === current ? "page" : undefined}>{link.label}</Link>)}
  </div>)}</>;
}

/** The office's complete, grouped menu on a desk: the same on every page, beside the content. */
export function OfficeSidebar({ sections }: { sections: MenuSection[] }) {
  return <nav className={styles.sidebar} aria-label="Office menu">
    <SearchBox id="sidebar-search" />
    <Links sections={sections} />
  </nav>;
}

/** The same menu on a phone or tablet, opened from above the content. */
export function OfficeMenu({ sections }: { sections: MenuSection[] }) {
  return <details className={styles.mobileMenu}>
    <summary>Menu and search</summary>
    <div className={styles.mobileMenuBody}>
      <SearchBox id="menu-search" />
      <Links sections={sections} />
    </div>
  </details>;
}
