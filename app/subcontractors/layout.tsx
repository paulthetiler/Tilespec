import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import css from "@/components/subcontractors/portal.module.css";

export const metadata: Metadata = {
  title: "Subcontractor portal | TileSPEC",
  description: "Send your invoice to TileSPEC and sign your subcontractor agreement.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className={css.portal}>
    <header className={css.header}><div className={css.headerInner}>
      <Link href="/subcontractors" aria-label="TileSPEC subcontractor portal home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tilespec-logo-animated.svg" alt="TileSPEC" width="280" height="75" /></Link>
      <span className={css.headerTag}>Subcontractor<br />portal</span>
    </div></header>
    <main className={css.main}>{children}</main>
    <div className={css.footer} role="contentinfo">
      <p>Need help? Call the TileSPEC office on <a href="tel:+443333393445">0333 339 3445</a> or email <a href="mailto:info@tilespec.uk">info@tilespec.uk</a>.</p>
      <p>TileSPEC will never ask you to change your bank details through a link or a message.</p>
    </div>
  </div>;
}
