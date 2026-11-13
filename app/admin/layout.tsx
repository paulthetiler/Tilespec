import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { roleLabels } from "@/lib/operations/types";
import { signOut } from "@/app/auth/actions";
import { RoleTabs } from "@/components/admin/role-tabs";
import { OfficeSidebar } from "@/components/admin/office-nav";
import { isGang, isOffice, officeMenu } from "@/lib/operations/role-nav";
import nav from "@/components/admin/office-nav.module.css";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Contract operations | TileSPEC Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
 * One navigation for every role (lib/operations/role-nav.ts): at most four destinations in a bottom bar on a
 * phone or tablet, tabs or a sidebar on a desk. The office also has its complete grouped menu: the sidebar on
 * a desk and the "Menu" tab on a phone or tablet. The same on every page.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { member } = await requireActor();
  const office = isOffice(member.role);
  const financial = canReadFinancial(member);
  const sections = office ? officeMenu(member.role, financial) : [];
  const home = member.role === "supervisor" ? "/admin/supervisor" : isGang(member.role) ? "/admin/gang" : "/admin";

  return (
    <div className={styles.admin}>
      <a className={styles.skipLink} href="#admin-main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.shell}>
          <Link href={home} className={styles.brand} aria-label={member.role === "supervisor" ? "TileSPEC my sites" : "TileSPEC home"}>
            <img className={styles.logo} src="/tilespec-logo-animated.svg" alt="TileSPEC — Wall & Floor Tiling Contractors" width="280" height="75" />
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
      <div className={`${styles.shell} ${office ? nav.frame : ""}`}>
        {office && <OfficeSidebar sections={sections} />}
        <div className={nav.content}>
          <RoleTabs role={member.role} financial={financial} sections={sections} />
          <main id="admin-main" className={`${styles.main} ${styles.withTabs}`} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
