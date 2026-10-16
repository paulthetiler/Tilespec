import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { roleLabels } from "@/lib/operations/types";
import { signOut } from "@/app/auth/actions";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { RoleTabs } from "@/components/admin/role-tabs";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Contract operations | TileSPEC Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { member } = await requireActor();
  const supervisor = member.role === "supervisor";
  // Behind FEATURE_ROLE_SHELL: at most four destinations for this role. Off by default.
  const roleShell = flagEnabled("roleShell", member.role);

  return (
    <div className={styles.admin}>
      <a className={styles.skipLink} href="#admin-main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.shell}>
          <Link href={supervisor ? "/admin/supervisor" : "/admin"} className={styles.brand} aria-label={supervisor ? "TileSPEC my sites" : "TileSPEC Admin overview"}>
            <img src="/tilespec-logo-animated.svg" alt="TileSPEC — Wall & Floor Tiling Contractors" width="280" height="75" style={{ width: "min(240px, 52vw)", height: "auto" }} />
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
      {roleShell && <div className={styles.shell}><RoleTabs role={member.role} financial={canReadFinancial(member)} /></div>}
      {!supervisor && !roleShell && (
        <>
          <nav className={`${styles.shell} ${styles.nav} ${styles.desktopNav}`} aria-label="Admin navigation">
            <Link href="/admin">Overview</Link>
            <Link href="/admin/contracts">Contracts</Link>
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/workforce">Workforce</Link>}
            <Link href="/admin/supervisor">Site dashboards</Link>
            <Link href="/admin/snags">Snag register</Link>
            <Link href="/admin/holds">Holds and releases</Link>
            <Link href="/admin/alerts">Site alerts</Link>
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/quality">Quality control</Link>}
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/tenders">Tenders</Link>}
            {member.role === "owner" && <Link href="/admin/team">User access</Link>}
            {canReadFinancial(member) && <Link href="/admin/estimator">Estimator</Link>}
          </nav>
          <nav className={`${styles.shell} ${styles.mobileNav}`} aria-label="Mobile admin navigation">
            <Link href="/admin/supervisor" className={styles.mobileSiteLink}>My sites</Link>
            <details className={styles.mobileMenu}>
              <summary>Office menu <span aria-hidden="true">☰</span></summary>
              <div className={styles.mobileMenuLinks}>
                <Link href="/admin">Overview</Link>
                <Link href="/admin/contracts">Contracts</Link>
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/workforce">Workforce</Link>}
                <Link href="/admin/supervisor">Site dashboards</Link>
                <Link href="/admin/snags">Snag register</Link>
                <Link href="/admin/holds">Holds and releases</Link>
                <Link href="/admin/alerts">Site alerts</Link>
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/quality">Quality control</Link>}
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/tenders">Tenders</Link>}
                {member.role === "owner" && <Link href="/admin/team">User access</Link>}
                {canReadFinancial(member) && <Link href="/admin/estimator">Estimator</Link>}
              </div>
            </details>
          </nav>
        </>
      )}
      <main id="admin-main" className={`${styles.shell} ${styles.main}`} tabIndex={-1} style={roleShell ? { paddingBottom: "96px" } : undefined}>
        {children}
      </main>
    </div>
  );
}
