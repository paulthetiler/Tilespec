"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentDestination, destinationsFor, type Destination, type MenuSection } from "@/lib/operations/role-nav";
import type { MemberRole } from "@/lib/operations/next-actions/types";
import { MenuLinks, SearchBox } from "./office-nav";
import styles from "./role-tabs.module.css";

const ICONS: Record<Destination["icon"] | "menu", string> = {
  home: "M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  briefcase: "M3 7h18v13H3zM9 7V5a2 2 0 012-2h2a2 2 0 012 2v2",
  pound: "M12 3a9 9 0 100 18 9 9 0 000-18zM15 8.5a3 3 0 00-5.5 1.5v2.5M8.5 12.5h5M8.5 12.5V15c0 1-.6 2-2 2.5h8.5",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  users: "M9 8m-3.5 0a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0M2 20c0-4 3-6 7-6s7 2 7 6",
  clipboard: "M5 4h14v17H5zM9 4h6v3H9zM9 13l2 2 4-4",
  alert: "M12 3l10 18H2zM12 10v5M12 18v.5",
  wrench: "M14.5 6a4 4 0 005.5 5l-9 9a2.1 2.1 0 01-3-3l9-9a4 4 0 00-2.5-2z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  menu: "M4 6h16M4 12h16M4 18h16",
};
const Icon = ({ name }: { name: keyof typeof ICONS }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;

/**
 * The role's destinations (never more than four): a bottom bar on a phone or tablet, tabs on a desk. The office
 * also gets a "Menu" tab that opens its complete grouped menu with search; on a wide screen the sidebar shows that
 * menu instead and this bar is hidden. A gang's other pages (work restrictions) are linked from its Today page.
 */
export function RoleTabs({ role, financial, sections = [] }: { role: MemberRole; financial: boolean; sections?: MenuSection[] }) {
  const pathname = usePathname() ?? "";
  const items = destinationsFor(role, pathname, financial);
  const current = currentDestination(items, pathname);
  const hasMenu = sections.length > 0;
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // Close the menu whenever the page changes, and with Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return <>
    <nav className={`${styles.tabs} ${hasMenu ? styles.officeTabs : ""}`} aria-label="Main">
      {items.map(item => <Link key={item.key} href={item.href} className={styles.tab} aria-current={item.key === current && !open ? "page" : undefined}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </Link>)}
      {hasMenu && <button ref={toggle} type="button" className={styles.tab} aria-expanded={open} aria-controls="office-menu-sheet" onClick={() => setOpen(value => !value)}>
        <Icon name="menu" /><span>{open ? "Close" : "Menu"}</span>
      </button>}
    </nav>
    {hasMenu && open && <div id="office-menu-sheet" ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-label="Menu and search">
      <div className={styles.sheetHead}>
        <strong>Menu</strong>
        <button type="button" className={styles.close} onClick={() => { setOpen(false); toggle.current?.focus(); }}>Close</button>
      </div>
      <SearchBox id="menu-search" />
      <nav aria-label="Office menu" className={styles.sheetLinks}><MenuLinks sections={sections} onNavigate={() => setOpen(false)} /></nav>
    </div>}
  </>;
}
