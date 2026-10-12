import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { SeoPage, ContentSection } from "@/lib/seo/types";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { PageHero, EnquiryCallout, RelatedPages } from "./content-page";
import styles from "./industry-page.module.css";

function SectionCopy({ section }: { section: ContentSection }) {
  return <>
    {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    {section.links?.map(link => <a className="underlined-link" href={link.href} key={link.href}>{link.label} <ArrowUpRight size={17} /></a>)}
  </>;
}

function IndustryHeading({ page }: { page: SeoPage }) {
  const headings: Record<string, React.ReactNode> = {
    "/industries/retail-showrooms": <>TILING FOR <br />RETAIL & <br /><em>SHOWROOMS.</em></>,
    "/industries/hospitality-leisure": <>TILING FOR <br />HOSPITALITY <br /><em>& LEISURE.</em></>,
    "/industries/commercial-developments": <>TILING FOR <br />COMMERCIAL <br /><em>DEVELOPMENTS.</em></>,
    "/industries/public-communal-spaces": <>TILING FOR PUBLIC <br />& COMMUNAL <br /><em>SPACES.</em></>,
  };
  return <h1 className={styles.pageTitle}>{headings[page.path] ?? page.h1}</h1>;
}

/** Industry pages foreground operational constraints rather than a service-card catalogue. */
export function IndustryPage({ page }: { page: SeoPage }) {
  const considerations = page.sections.filter(section => !["coordination", "procurement", "enquiry"].includes(section.id));
  const coordination = page.sections.find(section => section.id === "coordination")!;
  const procurement = page.sections.find(section => section.id === "procurement")!;
  const photo = page.images.find(image => image.role === "supporting")!;

  return <main id="top" className={styles.industry}>
    <SiteHeader />
    <PageHero page={page} eyebrow="SECTOR REQUIREMENTS · COMMERCIAL TILING" description={page.description} ctaAnchor="#scope" ctaLabel="PROJECT CONSIDERATIONS">
      <IndustryHeading page={page} />
    </PageHero>

    <section className={`statement ${styles.introduction}`} aria-labelledby="sector-introduction">
      <div className={`shell ${styles.introGrid}`}>
        <div className={styles.introLabel}><div className="eyebrow"><span className="eyebrow-line" /> THE ENVIRONMENT</div><h2 id="sector-introduction">THE SPACE<br /><span>SETS THE BRIEF.</span></h2></div>
        <p>{page.intro}</p>
      </div>
    </section>

    <section id="scope" className={styles.considerations} aria-labelledby="considerations-title">
      <div className="shell">
        <div className={styles.editorialHeading}><div className="eyebrow"><span className="eyebrow-line" /> PROJECT CONSIDERATIONS</div><h2 id="considerations-title">UNDERSTAND THE USE.<br /><em>PLAN THE WORK.</em></h2></div>
        <div className={styles.rows}>
          {considerations.map((section, index) => <article id={section.id} className={styles.row} key={section.id}>
            <div className={styles.rowHeading}><span className={styles.number}>0{index + 1}</span><h3>{section.heading}</h3></div>
            <div className={styles.rowCopy}><SectionCopy section={section} /></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className={`sectors ${styles.sequence}`} aria-labelledby="coordination-title">
      <div className={`shell ${styles.sequenceGrid}`}>
        <figure className={styles.photo}>
          <div className={styles.photoFrame}><Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 42vw, 570px" /></div>
          <figcaption>Illustrative architectural imagery, shown to explain the environment rather than as evidence of a completed TileSPEC project.</figcaption>
        </figure>
        <div className={styles.sequenceCopy}><div className="eyebrow light"><span className="eyebrow-line" /> THE WORKING SEQUENCE</div><h2 id="coordination-title">{coordination.heading}</h2><SectionCopy section={coordination} /><div className={styles.sequenceNote}>AREA RELEASE <span aria-hidden="true">→</span> INSTALLATION <span aria-hidden="true">→</span> AGREED HANDOVER</div></div>
      </div>
    </section>

    <section className={`statement ${styles.procurement}`} aria-labelledby="procurement-title">
      <div className={`shell ${styles.procurementGrid}`}>
        <div><div className="eyebrow"><span className="eyebrow-line" /> FOR THE PROCUREMENT TEAM</div><h2 id="procurement-title">{procurement.heading}</h2></div>
        <div className={styles.procurementCopy}><SectionCopy section={procurement} /><nav className={styles.hubLink} aria-label="Commercial tiling overview"><a className="underlined-link" href="/commercial-tiling">Explore the commercial tiling package <ArrowUpRight size={17} /></a></nav></div>
      </div>
      <div className={`shell ${styles.relatedSections}`}>
        <div><h3>Relevant tiling services</h3><RelatedPages paths={page.relatedServices} /></div>
        {page.relatedIndustries.length > 0 && <div><h3>Connected commercial environments</h3><RelatedPages paths={page.relatedIndustries} /></div>}
        <div><h3>Project location & coverage</h3><RelatedPages paths={page.relatedLocations} /></div>
      </div>
    </section>
    <EnquiryCallout page={page} />
    <SiteFooter showCommercialHub />
  </main>;
}
