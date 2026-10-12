import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { EnquiryCallout, PageHero, RelatedPages } from "./content-page";
import { serializeJsonLd, serviceJsonLd } from "@/lib/seo/structured-data";
import type { ContentSection, SeoPage } from "@/lib/seo/types";
import styles from "./service-page.module.css";

const compositions = {
  "commercial-floor-tiling": {
    style: "floor", title: ["Commercial", "floor tiling."],
    hero: "Specified tiled floors for showrooms, entrances and circulation areas, with levels, layouts and site access considered before installation.",
    label: "FLOOR FINISHES · COMMERCIAL INTERIORS", intro: ["BUILT AROUND", "THE BUILDING."],
    scope: ["SPECIFY THE FLOOR.", "RESOLVE THE LEVELS."],
    detail: ["THE LAYOUT", "AND THE JOINTS."], delivery: ["PLAN THE ACCESS.", "CHECK THE FINISH."],
  },
  "commercial-wall-tiling": {
    style: "wall", title: ["Commercial", "wall tiling."],
    hero: "Commercial wall finishes with considered setting out, suitable backgrounds and clear responsibilities at corners, fittings and wet-area junctions.",
    label: "WALL FINISHES · JUNCTIONS & BACKGROUNDS", intro: ["THE DETAIL", "AT EVERY EDGE."],
    scope: ["A SUITABLE BACKGROUND.", "A CONSIDERED LAYOUT."],
    detail: ["WET AREAS", "AND TRADE INTERFACES."], delivery: ["RELEASE THE AREA.", "COMPLETE THE DETAIL."],
  },
  "floor-preparation": {
    style: "preparation", title: ["Floor preparation", "for tiling."],
    hero: "Uplift, adhesive removal, repairs and levelling assessed against the actual substrate and the requirements of the proposed tiled finish.",
    label: "SUBSTRATE REVIEW · PREPARATION", intro: ["UNDERSTAND", "WHAT IS BELOW."],
    scope: ["ASSESS THE FLOOR.", "DEFINE THE WORK."],
    detail: ["MOISTURE, REPAIRS", "AND LEVELS."], delivery: ["RESOLVE THE MOVEMENT.", "RELEASE THE FLOOR."],
  },
  "complete-tiling-packages": {
    style: "package", title: ["Complete commercial", "tiling packages."],
    hero: "Preparation, floor and wall tiling brought into an agreed tender scope, with practical trade interfaces and a clear route to handover.",
    label: "TENDER PACKAGES · COORDINATED DELIVERY", intro: ["ONE AGREED", "SCOPE OF WORK."],
    scope: ["CLARITY AT", "TENDER STAGE."],
    detail: ["FROM THE DETAILS", "TO THE PROGRAMME."], delivery: ["KEEP DECISIONS CLEAR.", "AGREE THE HANDOVER."],
  },
} as const;

type ServiceSlug = keyof typeof compositions;

function SectionCopy({ section }: { section: ContentSection }) {
  return <article id={section.id} className={styles.article}>
    <h3>{section.heading}</h3>
    {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    {section.links?.map(link => <a key={link.href} className={styles.contextLink} href={link.href}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></a>)}
  </article>;
}

function DisplayHeading({ id, lines }: { id: string; lines: readonly [string, string] }) {
  return <h2 id={id}>{lines[0]}<br /><em>{lines[1]}</em></h2>;
}

export function ServicePage({ page }: { page: SeoPage }) {
  const slug = page.path.split("/").at(-1) as ServiceSlug;
  const composition = compositions[slug];
  const photo = page.images.find(image => image.role === "supporting")!;
  const scope = page.sections.slice(0, 2);
  const detail = page.sections.slice(2, 4);
  const delivery = page.sections.slice(4, 6);

  return <main id="top" className={`${styles.page} ${styles[composition.style]}`}>
    <SiteHeader />
    <PageHero page={page} eyebrow={composition.label} description={composition.hero} ctaAnchor="#scope">
      <h1>{composition.title[0]}<br /><em>{composition.title[1]}</em></h1>
    </PageHero>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(serviceJsonLd(page)) }} />

    <section className={`statement ${styles.intro}`} aria-labelledby="intro-title">
      <div className={`shell ${styles.introGrid}`}>
        <div><div className="eyebrow"><span className="eyebrow-line" /> THE INSTALLATION SCOPE</div><h2 id="intro-title">{composition.intro[0]}<br /><span>{composition.intro[1]}</span></h2></div>
        <div><p>{page.intro}</p><a className="underlined-link" href="/commercial-tiling">THE COMMERCIAL TILING PACKAGE <ArrowUpRight size={17} aria-hidden="true" /></a></div>
      </div>
      {composition.style === "package" && <div className={`shell ${styles.packageFlow}`} aria-label="Package coordination"><span>SCOPE & SPECIFICATION</span><span aria-hidden="true">→</span><span>BACKGROUND READINESS</span><span aria-hidden="true">→</span><span>INSTALLATION</span><span aria-hidden="true">→</span><span>INSPECTION & HANDOVER</span></div>}
    </section>

    <section id="scope" className={`section-pad ${styles.scope}`} aria-labelledby="scope-title">
      <div className="shell">
        <div className={`section-head ${styles.sectionHead}`}><div><div className="eyebrow"><span className="eyebrow-line" /> BEFORE INSTALLATION</div><DisplayHeading id="scope-title" lines={composition.scope} /></div></div>
        <div className={styles.scopeGrid}>
          <div className={styles.scopeCopy}>{scope.map(section => <SectionCopy key={section.id} section={section} />)}</div>
          <figure className={styles.photo}><div className={styles.photoFrame}><Image src={photo.src} alt={photo.alt} fill sizes={composition.style === "preparation" ? "(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 64px), 1320px" : "(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 45vw, 560px"} /></div><figcaption>Illustrative architectural imagery. Installation and preparation requirements are assessed on the actual site.</figcaption></figure>
        </div>
      </div>
    </section>

    <section className={`approach section-pad ${styles.details}`} aria-labelledby="details-title">
      <div className="shell"><div className={`section-head ${styles.sectionHead}`}><div><div className="eyebrow"><span className="eyebrow-line" /> SPECIFICATION & COORDINATION</div><DisplayHeading id="details-title" lines={composition.detail} /></div></div><div className={styles.detailGrid}>{detail.map(section => <SectionCopy key={section.id} section={section} />)}</div></div>
    </section>

    <section className={`sectors section-pad ${styles.delivery}`} aria-labelledby="delivery-title">
      <div className={`shell ${styles.deliveryGrid}`}><div className={styles.deliveryHeading}><div className="eyebrow light"><span className="eyebrow-line" /> ON SITE & AT COMPLETION</div><DisplayHeading id="delivery-title" lines={composition.delivery} /></div><div className={styles.deliveryCopy}>{delivery.map(section => <SectionCopy key={section.id} section={section} />)}</div></div>
    </section>

    <section className={styles.relatedSection} aria-labelledby="related-title"><div className={`shell ${styles.relatedGrid}`}><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR PROJECT CONTEXT</div><h2 id="related-title">Related services & environments</h2><p>Follow the parts of the scope that matter to your enquiry.</p></div><RelatedPages paths={[...page.relatedServices, ...page.relatedIndustries, ...page.relatedLocations]} /></div></section>
    <EnquiryCallout page={page} />
    <SiteFooter showCommercialHub />
  </main>;
}
