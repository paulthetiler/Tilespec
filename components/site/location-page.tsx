import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { ContentSection, SeoPage } from "@/lib/seo/types";
import { getSeoPage } from "@/lib/seo/registry";
import { isPageRoutable } from "@/lib/seo/config";
import { EnquiryCallout, PageHero, RelatedPages } from "./content-page";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import styles from "./location-page.module.css";

function SectionCopy({ section }: { section: ContentSection }) {
  return <>
    {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    {section.links?.length ? <nav className={styles.sectionLinks} aria-label={`Further reading: ${section.heading}`}>
      {section.links.map(link => <a className="underlined-link" key={link.href} href={link.href}>{link.label} <ArrowUpRight size={17} /></a>)}
    </nav> : null}
  </>;
}

function CoverageLinks({ page }: { page: SeoPage }) {
  const children = page.children.map(getSeoPage).filter(entry => isPageRoutable(entry));
  return <aside className={styles.coverageAside} aria-label={page.category === "region" ? "North West project locations" : "Regional coverage"}>
    <span className={styles.kicker}>WARRINGTON, CHESHIRE</span>
    <h3>OUR BASE.<br /><em>YOUR PROJECT.</em></h3>
    <p>Project suitability is assessed from our Warrington base against the agreed scope, dates and delivery arrangements.</p>
    {children.length ? <nav aria-label="Explore North West locations" className={styles.cityLinks}>
      {children.map((entry, index) => <a key={entry.path} href={entry.path}><span>0{index + 1}</span><strong>{entry.path.split("/").at(-1)}</strong><ArrowUpRight size={22} /></a>)}
    </nav> : <a className="underlined-link" href="/locations/north-west">NORTH WEST COVERAGE <ArrowUpRight size={17} /></a>}
  </aside>;
}

/** Region coverage and city procurement briefs share the approved brand but use different compositions. */
export function LocationPage({ page }: { page: SeoPage }) {
  const regional = page.category === "region";
  const location = regional ? "North West England" : page.path.split("/").at(-1)!.replace(/^./, character => character.toUpperCase());
  const [opening, workTypes, ...details] = page.sections.filter(section => section.id !== "enquiry");
  const photo = page.images.find(image => image.role === "supporting");

  return <main id="top" className={styles.page}>
    <SiteHeader />
    <PageHero page={page} eyebrow={regional ? "NORTH WEST · PROJECT-LED COVERAGE" : "COMMERCIAL PROJECTS · NORTH WEST"} description={page.intro} ctaAnchor="#scope" ctaLabel={regional ? "EXPLORE OUR COVERAGE" : "PLAN THE PACKAGE"}>
      <h1>COMMERCIAL TILING<br />IN <em>{location.toUpperCase()}.</em></h1>
    </PageHero>

    <section id="scope" className={`section-pad ${styles.opening}`} aria-labelledby="location-brief-title">
      <div className={`shell ${styles.openingGrid}`}>
        <div className={styles.editorialCopy}>
          <div className="eyebrow"><span className="eyebrow-line" /> {regional ? "REGIONAL COVERAGE" : "THE LOCATION BRIEF"}</div>
          <h2 id="location-brief-title">{opening.heading}</h2>
          <SectionCopy section={opening} />
        </div>
        <CoverageLinks page={page} />
      </div>
    </section>

    <section className={`${regional ? styles.regionWork : styles.cityWork} section-pad`} aria-labelledby="work-types-title">
      <div className={`shell ${styles.workGrid}`}>
        {photo && <figure className={styles.supportingPhoto}>
          <div className={styles.photoFrame}><Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 42vw, 550px" /></div>
          <figcaption>Illustrative architectural imagery. This is not a photograph of a completed {location} project.</figcaption>
        </figure>}
        <div className={styles.editorialCopy}>
          <div className={`eyebrow ${regional ? "" : "light"}`}><span className="eyebrow-line" /> PROJECT TYPES & REQUIREMENTS</div>
          <h2 id="work-types-title">{workTypes.heading}</h2>
          <SectionCopy section={workTypes} />
        </div>
      </div>
    </section>

    <section className={`section-pad ${styles.planning}`} aria-labelledby="planning-title">
      <div className="shell">
        <div className={`section-head ${styles.planningHead}`}><div><div className="eyebrow"><span className="eyebrow-line" /> {regional ? "ASSESS THE DELIVERY" : "BRIEF THE SITE TEAM"}</div><h2 id="planning-title">{regional ? <>SCOPE. ACCESS.<br /><em>HANDOVER.</em></> : <>THE PRACTICAL<br /><em>PROJECT DETAILS.</em></>}</h2></div><p>{regional ? "Location is the starting point. The specification and the site programme establish how the work can be delivered." : "Include the decisions that affect installation so the tender can be assessed against a usable work area and a realistic sequence."}</p></div>
        <div className={styles.detailRows}>{details.map((section, index) => <article key={section.id} id={section.id} className={styles.detailRow}>
          <div className={styles.detailHeading}><span className={styles.rowNumber}>0{index + 1}</span><h3>{section.heading}</h3></div>
          <div className={styles.detailCopy}><SectionCopy section={section} /></div>
        </article>)}</div>
      </div>
    </section>

    <section className={styles.connections} aria-labelledby="connections-title"><div className="shell">
      <div className="eyebrow"><span className="eyebrow-line" /> DEVELOP YOUR BRIEF</div>
      <h2 id="connections-title">The services and environments behind the enquiry.</h2>
      <div className={styles.connectionColumns}>
        <div><h3>Related tiling services</h3><RelatedPages paths={page.relatedServices} /></div>
        <div><h3>Relevant commercial environments</h3><RelatedPages paths={page.relatedIndustries} /></div>
      </div>
      {regional && <a className="underlined-link" href="/commercial-tiling">COMMERCIAL TILING & UK PROJECT ENQUIRIES <ArrowUpRight size={17} /></a>}
    </div></section>
    <EnquiryCallout page={page} />
    <SiteFooter showCommercialHub />
  </main>;
}
