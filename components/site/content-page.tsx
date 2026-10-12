import Image from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { SeoPage } from "@/lib/seo/types";
import { getSeoPage } from "@/lib/seo/registry";
import { isPageRoutable } from "@/lib/seo/config";
import { breadcrumbJsonLd, serializeJsonLd } from "@/lib/seo/structured-data";
import styles from "./content-page.module.css";

export function Breadcrumbs({ page }: { page: SeoPage }) {
  const ancestors: SeoPage[] = [];
  let parent = page.parent;
  while (parent) { const entry = getSeoPage(parent); ancestors.unshift(entry); parent = entry.parent; }
  const schema = breadcrumbJsonLd(page, ancestors);
  return <>
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol>{ancestors.map(entry => <li key={entry.path}><a href={entry.path}>{entry.path === "/" ? "Home" : entry.h1}</a><span aria-hidden="true">/</span></li>)}<li aria-current="page">{page.category === "national" ? "Commercial tiling" : page.h1}</li></ol>
    </nav>
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />}
  </>;
}

export function PageHero({ page, children }: { page: SeoPage; children: React.ReactNode }) {
  const photo = page.images.find(image => image.role === "hero");
  return <section className={`hero ${styles.hero}`}>
    {photo && <Image className={styles.heroImage} src={photo.src} alt={photo.alt} fill priority sizes="100vw" />}
    <div className={styles.heroOverlay} />
    <div className={`shell ${styles.heroContent}`}>
      <Breadcrumbs page={page} />
      <div className="eyebrow light"><span className="eyebrow-line" /> COMMERCIAL PROJECTS · UK ENQUIRIES</div>
      {children}
      <p>Floor and wall tiling, preparation and complete packages for contractors, developers and commercial clients.</p>
      <div className="hero-actions"><a className="button button-teal" href="/#tender">DISCUSS YOUR PROJECT <ArrowUpRight size={19} /></a><a className="text-link light-link" href="#scope">EXPLORE THE SCOPE <ArrowDown size={17} /></a></div>
      <div className={styles.heroFoot}><span>WARRINGTON BASED · NORTH WEST & SUITABLE UK PROJECTS</span><span>ILLUSTRATIVE ARCHITECTURAL IMAGERY</span></div>
    </div>
  </section>;
}

/** Only render available pages; proposed registry entries cannot become broken links. */
export function RelatedPages({ paths }: { paths: readonly string[] }) {
  const pages = paths.map(getSeoPage).filter(page => isPageRoutable(page));
  if (!pages.length) return null;
  return <nav className={styles.related} aria-label="Related pages">{pages.map(page => <a className="underlined-link" key={page.path} href={page.path}>{page.h1.replace(/\.$/, "")} <ArrowUpRight size={17} /></a>)}</nav>;
}

export function EnquiryCallout({ page }: { page: SeoPage }) {
  const section = page.sections.find(entry => entry.id === "enquiry")!;
  return <section className={`tender section-pad ${styles.enquiry}`} aria-labelledby="enquiry-title">
    <div className={`shell tender-grid ${styles.enquiryGrid}`}>
      <div className="tender-intro"><div className="eyebrow"><span className="eyebrow-line" /> THE NEXT STEP</div><h2 id="enquiry-title">START WITH<br />THE <em>PROJECT BRIEF.</em></h2><p>{section.paragraphs[0]}</p><a className="button button-dark" href="/#tender">DISCUSS YOUR COMMERCIAL TILING PROJECT <ArrowUpRight size={19} /></a></div>
      <div className={styles.brief}><span className={styles.kicker}>HELP US UNDERSTAND THE SCOPE</span><dl><div><dt>Location & access</dt><dd>Town or postcode, working hours and site restrictions.</dd></div><div><dt>Specification & area</dt><dd>Tile type, format, approximate quantity and substrate information.</dd></div><div><dt>Programme & deadline</dt><dd>Anticipated dates, phasing and tender return requirements.</dd></div><div><dt>Drawings & details</dt><dd>Mention the documents available; we can arrange a secure way to receive them.</dd></div></dl><p>The enquiry form opens a prepared email in your email app. Send it there to submit your enquiry.</p></div>
    </div>
  </section>;
}
