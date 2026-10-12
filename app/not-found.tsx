import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { isPageRoutable } from "@/lib/seo/config";
import { commercialTiling } from "@/lib/seo/registry";

export default function NotFound() {
  return <main id="top"><SiteHeader /><section className="statement section-pad"><div className="shell"><div className="eyebrow"><span className="eyebrow-line" /> PAGE NOT FOUND</div><h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(52px, 8vw, 96px)", lineHeight: 1, margin: "28px 0" }}>LET'S GET YOU<br />BACK ON SITE.</h1><p>The page you requested is unavailable.</p><Link className="button button-dark" style={{ width: "auto" }} href="/">RETURN TO TILESPEC</Link></div></section><SiteFooter showCommercialHub={isPageRoutable(commercialTiling)} /></main>;
}
