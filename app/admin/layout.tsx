import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { roleLabels } from "@/lib/operations/types";
import { signOut } from "@/app/auth/actions";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { RoleTabs } from "@/components/admin/role-tabs";
import { OfficeMenu, OfficeSidebar } from "@/components/admin/office-nav";
import { officeMenu } from "@/lib/operations/role-nav";
import nav from "@/components/admin/office-nav.module.css";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Contract operations | TileSPEC Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { member } = await requireActor();
  const supervisor = member.role === "supervisor";
  const gang = member.role === "lead_installer" || member.role === "subcontract_installer";
  // Behind FEATURE_ROLE_SHELL: at most four destinations for this role. Off by default.
  const roleShell = flagEnabled("roleShell", member.role);
  const office = member.role === "owner" || member.role === "contracts_manager";
  // The office's grouped menu: a sidebar on a desk, "Menu and search" on a phone. Same on every page.
  const sections = roleShell && office ? officeMenu(member.role, canReadFinancial(member)) : [];

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
      {roleShell && !office && <div className={styles.shell}><RoleTabs role={member.role} financial={canReadFinancial(member)} /></div>}
      {roleShell && office && <div className={`${styles.shell} ${nav.tabsWrap}`}>
        <RoleTabs role={member.role} financial={canReadFinancial(member)} menu={false} />
        <OfficeMenu sections={sections} />
      </div>}
      {!supervisor && !roleShell && (
        <>
          <nav className={`${styles.shell} ${styles.nav} ${styles.desktopNav}`} aria-label="Admin navigation">
            {gang && <Link href="/admin/gang">Your invoices</Link>}
            <Link href="/admin">Overview</Link>
            <Link href="/admin/contracts">Contracts</Link>
            {canReadFinancial(member) && <Link href="/admin/invoices">Invoices</Link>}
            {canReadFinancial(member) && <Link href="/admin/gang-invoices">Gang invoices</Link>}
            {canReadFinancial(member) && <Link href="/admin/startup-expenses">Startup expenses</Link>}
            {canReadFinancial(member) && <Link href="/admin/subcontractors">Subcontractors</Link>}
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/workforce">Workforce</Link>}
            <Link href="/admin/supervisor">Site dashboards</Link>
            <Link href="/admin/snags">Snag register</Link>
            <Link href="/admin/holds">Holds and releases</Link>
            <Link href="/admin/alerts">Site alerts</Link>
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/quality">Quality control</Link>}
            {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/tenders">Tenders</Link>}
            {member.role === "owner" && <Link href="/admin/team">User access</Link>}
            {canReadFinancial(member) && <Link href="/admin/estimator">Estimator</Link>}
            {canReadFinancial(member) && <Link href="/admin/documents">Documents</Link>}
          </nav>
          <nav className={`${styles.shell} ${styles.mobileNav}`} aria-label="Mobile admin navigation">
            {gang ? <Link href="/admin/gang" className={styles.mobileSiteLink}>Your invoices</Link>
              : <Link href="/admin/supervisor" className={styles.mobileSiteLink}>My sites</Link>}
            <details className={styles.mobileMenu}>
              <summary>Office menu <span aria-hidden="true">☰</span></summary>
              <div className={styles.mobileMenuLinks}>
                <Link href="/admin">Overview</Link>
                <Link href="/admin/contracts">Contracts</Link>
                {canReadFinancial(member) && <Link href="/admin/gang-invoices">Gang invoices</Link>}
                {canReadFinancial(member) && <Link href="/admin/subcontractors">Subcontractors</Link>}
                {canReadFinancial(member) && <Link href="/admin/startup-expenses">Startup expenses</Link>}
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/workforce">Workforce</Link>}
                <Link href="/admin/supervisor">Site dashboards</Link>
                <Link href="/admin/snags">Snag register</Link>
                <Link href="/admin/holds">Holds and releases</Link>
                <Link href="/admin/alerts">Site alerts</Link>
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/quality">Quality control</Link>}
                {(member.role === "owner" || member.role === "contracts_manager") && <Link href="/admin/tenders">Tenders</Link>}
                {member.role === "owner" && <Link href="/admin/team">User access</Link>}
                {canReadFinancial(member) && <Link href="/admin/estimator">Estimator</Link>}
            {canReadFinancial(member) && <Link href="/admin/documents">Documents</Link>}
              </div>
            </details>
          </nav>
        </>
      )}
      {roleShell && office ? <div className={`${styles.shell} ${nav.frame}`}>
        <OfficeSidebar sections={sections} />
        <main id="admin-main" className={styles.main} tabIndex={-1} style={{ paddingBottom: "96px", minWidth: 0 }}>
          {children}
        </main>
      </div> : <main id="admin-main" className={`${styles.shell} ${styles.main}`} tabIndex={-1} style={roleShell ? { paddingBottom: "96px" } : undefined}>
        {children}
      </main>}
    </div>
  );
}
