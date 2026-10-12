import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHero, EnquiryCallout, RelatedPages } from "@/components/site/content-page";
import { commercialTiling as page } from "@/lib/seo/registry";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";
import { serviceJsonLd, serializeJsonLd } from "@/lib/seo/structured-data";
import styles from "./page.module.css";

export const metadata = pageMetadata(page);

export default function CommercialTilingPage() {
  if (!isPageRoutable(page)) notFound();
  const servicePaths = ["/services/commercial-floor-tiling", "/services/commercial-wall-tiling", "/services/floor-preparation", "/services/complete-tiling-packages"];
  const industryPaths = ["/industries/retail-showrooms", "/industries/hospitality-leisure", "/industries/commercial-developments", "/industries/public-communal-spaces"];
  const scope = page.sections.slice(0, 4);
  const delivery = page.sections.slice(4, 7);
  const sectors = page.sections.slice(7, 11);
  const coverage = page.sections.find(section => section.id === "coverage")!;
  const photo = page.images.find(image => image.role === "supporting")!;

  return <main id="top">
    <SiteHeader />
    <PageHero page={page}><h1>COMMERCIAL<br />TILING<br /><em>CONTRACTORS.</em></h1></PageHero>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(serviceJsonLd(page)) }} />
    <section className={`statement section-pad ${styles.intro}`} aria-labelledby="intro-title"><div className={`shell ${styles.introGrid}`}>
      <div><div className="eyebrow"><span className="eyebrow-line" /> SCOPE. SITE. PROGRAMME.</div><h2 id="intro-title">CONSIDERED<br /><span>FROM THE START.</span></h2></div>
      <div><p>{page.intro}</p><p className={styles.audience}>For main contractors, fit-out teams, commercial property owners and businesses planning their next project.</p></div>
    </div></section>
    <section id="scope" className={`${styles.scope} section-pad`} aria-labelledby="scope-title"><div className="shell">
      <div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line" /> THE TILING PACKAGE</div><h2 id="scope-title">DEFINE THE SCOPE.<br /><em>RESOLVE THE DETAIL.</em></h2></div><p>From an individual floor or wall area to a coordinated preparation and installation package.</p></div>
      <div className={styles.scopeGrid}><div className={styles.serviceList}>{scope.map((section, index) => <article id={section.id} key={section.id}><span className={styles.number}>0{index + 1}</span><div><h3><a href={servicePaths[index]}>{section.heading}</a></h3>{section.paragraphs.map(p => <p key={p}>{p}</p>)}</div></article>)}<a className="underlined-link" href="/#expertise">OUR TILING EXPERTISE <ArrowUpRight size={17} /></a></div>
        <figure className={styles.scopePhoto}><div className={styles.photoFrame}><Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 40vw, 480px" /></div><figcaption>Illustrative architectural imagery. This is not presented as a completed TileSPEC project.</figcaption></figure>
      </div>
    </div></section>
    <section className="approach section-pad" aria-labelledby="delivery-title"><div className="shell"><div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line" /> PLANNING & DELIVERY</div><h2 id="delivery-title">BEFORE THE<br /><em>FIRST TILE.</em></h2></div><p>Early decisions about the substrate and sequence help establish a workable route to installation and handover.</p></div><div className={`process-grid ${styles.delivery}`}>{delivery.map(section => <article key={section.id}><h3>{section.heading}</h3>{section.paragraphs.map(p => <p key={p}>{p}</p>)}</article>)}</div><a className="underlined-link" href="/#approach">OUR DELIVERY APPROACH <ArrowUpRight size={17} /></a></div></section>
    <section className={`sectors section-pad ${styles.sectors}`} aria-labelledby="sectors-title"><div className={`shell ${styles.sectorGrid}`}><div><div className="eyebrow light"><span className="eyebrow-line" /> COMMERCIAL ENVIRONMENTS</div><h2 id="sectors-title">DIFFERENT SITES.<br /><em>DIFFERENT DEMANDS.</em></h2><p>The setting shapes the installation. Access, operation and the specification need to be understood together.</p></div><div className={styles.sectorRows}>{sectors.map((section, index) => <article key={section.id}><h3><a href={industryPaths[index]}>{section.heading}</a></h3>{section.paragraphs.map(p => <p key={p}>{p}</p>)}</article>)}</div></div></section>
    <section className={`statement section-pad ${styles.coverage}`} aria-labelledby="coverage-title"><div className={`shell ${styles.coverageGrid}`}><div><div className="eyebrow"><span className="eyebrow-line" /> PROJECT SUITABILITY</div><h2 id="coverage-title">WARRINGTON BASED.<br /><span>PROJECT LED.</span></h2></div><div>{coverage.paragraphs.map(p => <p key={p}>{p}</p>)}<a className="underlined-link" href="/#tender">DISCUSS LOCATION & SCOPE <ArrowUpRight size={17} /></a><RelatedPages paths={page.relatedLocations} /></div></div></section>
    <EnquiryCallout page={page} />
    <SiteFooter showCommercialHub />
  </main>;
}
