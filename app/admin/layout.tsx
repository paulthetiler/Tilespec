import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { roleLabels } from "@/lib/operations/types";
import { signOut } from "@/app/auth/actions";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Contract operations | TileSPEC Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { member } = await requireActor();

  return (
    <div className={styles.admin}>
      <a className={styles.skipLink} href="#admin-main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.shell}>
          <Link href="/admin" className={styles.brand} aria-label="TileSPEC Admin overview">
            <svg width="34" height="38" viewBox="0 0 34 38" fill="none" aria-hidden="true" focusable="false">
              <path d="M1 7 33 1v8L1 15Z" fill="#0f2a3a" />
              <path d="M1 18 33 12v8L1 26Z" fill="#7b8790" />
              <path d="M1 29 33 23v8L1 37Z" fill="#7fb8b0" />
            </svg>
            <span>
              <strong>Tile<span>SPEC</span></strong>
              <span className={styles.brandMeta}>Contract operations</span>
            </span>
          </Link>
          <div className={styles.identity}>
            <div>
              <strong>{member.display_name}</strong>
              <span>{roleLabels[member.role]}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className={styles.secondaryButton}>Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <nav className={`${styles.shell} ${styles.nav}`} aria-label="Admin navigation">
        <Link href="/admin">Overview</Link>
        <Link href="/admin/contracts">Contracts</Link>
        {member.role === "owner" && <Link href="/admin/team">Team</Link>}
        {canReadFinancial(member) && <Link href="/admin/estimator">Estimator</Link>}
      </nav>
      <main id="admin-main" className={`${styles.shell} ${styles.main}`} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
