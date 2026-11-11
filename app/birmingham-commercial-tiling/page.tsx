import { RegionalConnections } from "../../components/regional-links";
import type { Metadata } from "next";
import Link from "next/link";
import LandingFooter from "../../components/landing-footer";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://www.tilespec.uk";
const pagePath = "/birmingham-commercial-tiling";

export const metadata: Metadata = {
  title: "Birmingham Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Birmingham contractors. TileSPEC offers coordinated preparation, tile supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Birmingham Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling for Birmingham office fit-outs, hotels, retail interiors and large mixed-use buildings, with substrate preparation and installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Specified porcelain and large-format flooring for Birmingham offices, receptions, retail units and high-use commercial areas.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Wall tiling for hotels, washrooms, communal spaces and fit-outs, with care taken over corners, trims and junctions.", icon: Check },
  { title: "Substrate preparation", detail: "Substrate repairs, levelling, suitable boards and waterproofing in line with the project's design and site conditions.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "A coordinated tiling package incorporating tile supply, floor preparation, installation and quality checks.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review the Birmingham tender documents, floor build-ups, finish schedules, access arrangements and proposed sequencing." },
  { title: "Plan the work", detail: "Plan tile supply and installation around live project milestones, other trades and any phased possession of areas." },
  { title: "Manage installation", detail: "Communicate progress and site constraints, check finishing details and work towards a clear handover." },
];

const faq = [
  { q: "Does TileSPEC work on large Birmingham commercial floor areas?", a: "We consider large-format and high-traffic commercial floors, with the proposed system assessed against substrates, expected use and project drawings." },
  { q: "Can you price a Birmingham hotel or office refurbishment?", a: "Yes. Send the relevant plans, finishes information, quantities, access requirements and expected programme through the tender enquiry form." },
  { q: "Will you supply tiles as part of the package?", a: "Material procurement can be included, together with agreed preparation and installation, depending on the tender scope." },
  { q: "Do you take on phased commercial tiling work?", a: "Phasing and sequencing can be considered during tender review, including access to areas and coordination with the principal contractor." },
];

export default function BirminghamCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Birmingham commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Birmingham","West Midlands","West Midlands"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling for Birmingham, including preparation and supply-and-install packages.",
  };

  return <main className="nw-page" id="top">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    <header className="nw-header">
      <div className="nw-wrap nw-header-row">
        <Link className="nw-brand" href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width={230} height={62} /></Link>
        <nav className="nw-nav" aria-label="Page navigation"><Link href="/">Home</Link><a href="#nw-services">Services</a><a href="#nw-coverage">Coverage</a><Link href="/#about">About</Link></nav>
        <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
      </div>
    </header>

    <section className="nw-hero">
      <div className="nw-hero-photo" role="img" aria-label="Commercial interior with large-format tiled flooring" />
      <div className="nw-wrap nw-hero-content">
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · BIRMINGHAM</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>BIRMINGHAM.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for Birmingham contractors, developers and fit-out teams. TileSPEC provides coordinated preparation, tile procurement and installation for larger commercial packages.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · BIRMINGHAM COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Birmingham's city-centre office, hospitality and mixed-use construction environments demand reliable finishes and careful coordination. Interfaces between trades, site access, large tiled areas and phased handovers all need consideration before fitting begins.</p><p>TileSPEC supports commercial tiling packages with a practical focus on substrate readiness, accurate setting-out and installation quality. We review each tender against its specification, construction programme and working conditions.</p></div>
      </div>
    </section>

    <section className="nw-services nw-space" id="nw-services">
      <div className="nw-wrap">
        <div className="nw-section-heading"><div className="nw-kicker">WHAT WE DELIVER</div><h2>COMMERCIAL TILING<br/><em>SERVICES.</em></h2></div>
        <div className="nw-capabilities">
          {capabilities.map((item) => <article className="nw-capability" key={item.title}>
            <span className="nw-icon"><item.icon size={23} strokeWidth={1.6} aria-hidden="true"/></span>
            <h3>{item.title}</h3><p>{item.detail}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="nw-photo-band" aria-label="Commercial tiling installation">
      <div className="nw-photo-band-image" role="img" aria-label="Large open-plan commercial floor tiling installation"/>
      <div className="nw-wrap nw-photo-content"><div className="nw-kicker nw-kicker-light">FROM PREPARATION TO FINISH</div><h2>BUILT AROUND<br/>THE PROJECT.</h2><p>Suitable substrates. Considered setting-out. Clear coordination. A finished installation that meets the agreed specification.</p></div>
    </section>

    <section className="nw-approach nw-space">
      <div className="nw-wrap">
        <div className="nw-section-heading"><div className="nw-kicker">HOW WE WORK</div><h2>STRAIGHTFORWARD<br/><em>FROM THE START.</em></h2></div>
        <div className="nw-steps">{approach.map((item)=><article key={item.title}><span className="nw-rule"/><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
      </div>
    </section>

    <section className="nw-coverage nw-space" id="nw-coverage">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">BIRMINGHAM COVERAGE</div><h2>BIRMINGHAM PROJECTS.<br/><em>WEST MIDLANDS REACH.</em></h2><p className="nw-coverage-intro">We consider Birmingham commercial tiling enquiries where the scale, access and programme suit a specialist package.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Birmingham and surrounding commercial areas</h3><p>City centre · Edgbaston · Digbeth · Jewellery Quarter</p><p>We also consider suitable projects elsewhere in the wider West Midlands conurbation.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
      </div>
    </section>

    <RegionalConnections slug="birmingham-commercial-tiling"/>
    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <LandingFooter />
  </main>;
}
