import type { Metadata } from "next";
import Link from "next/link";
import LandingFooter from "../../components/landing-footer";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "./north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/north-west-commercial-tiling";

export const metadata: Metadata = {
  title: "North West Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling across the North West. TileSPEC supports main contractors and developers with tile supply, substrate preparation, installation and handover.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "North West Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling packages for contractors and developers, from preparation to finished installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Large-format porcelain, high-traffic floors, careful setting-out and installation over properly prepared backgrounds.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Commercial wall finishes, washrooms, public areas and consistent detailing around corners, edges and interfaces.", icon: Check },
  { title: "Substrate preparation", detail: "Assessment of existing conditions, levelling, boarding, repairs and waterproofing where required by the specification.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "A joined-up package covering tile procurement, preparation, installation, supervision and handover.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "We review drawings, specifications, site conditions and the proposed programme before pricing." },
  { title: "Plan the work", detail: "We consider substrate readiness, access, sequencing, materials and coordination with other trades." },
  { title: "Manage installation", detail: "We focus on clear site communication, workmanship and quality checks as the installation progresses." },
];

const faq = [
  { q: "What commercial tiling work does TileSPEC undertake?", a: "We focus on commercial wall and floor tiling packages, including preparation, installation and associated finishing details. The exact scope is agreed from the drawings and project specification." },
  { q: "Can you price a project from drawings?", a: "Yes. Send the relevant plans, tiling specification, quantities or pricing schedule and programme information through our enquiry form so we can review the requirements." },
  { q: "Do you cover work outside Warrington?", a: "We consider commercial tiling enquiries across the North West, including Greater Manchester, Merseyside, Cheshire and Lancashire. Coverage depends on the project location, scope and programme." },
  { q: "Can TileSPEC include substrate preparation?", a: "Yes. Preparation can form part of the tiling package, subject to the existing substrate condition and the agreed specification." },
];

export default function NorthWestCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "North West commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["North West England", "Cheshire", "Greater Manchester", "Merseyside", "Lancashire"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling packages for main contractors and developers, including substrate preparation, tile supply and installation.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · NORTH WEST ENGLAND</div>
        <h1>COMMERCIAL<br/>WALL & FLOOR<br/><em>TILING.</em></h1>
        <p className="nw-lead">Commercial tiling packages for main contractors, developers and fit-out teams across the North West. From substrate preparation and tile supply to installation and handover.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · PROJECT ENQUIRIES ACROSS THE NORTH WEST</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Commercial tiling is about more than putting tiles down. A successful installation depends on suitable backgrounds, practical sequencing, consistent detailing and good communication with the wider site team.</p><p>TileSPEC brings preparation and installation together in a clear, project-led service. We work from the agreed drawings and specifications, with attention to buildability, quality and programme requirements.</p></div>
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
        <div><div className="nw-kicker">NORTH WEST COVERAGE</div><h2>BASED IN WARRINGTON.<br/><em>WORKING REGIONALLY.</em></h2><p className="nw-coverage-intro">We welcome enquiries for commercial tiling projects across the North West, with project suitability assessed individually.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Areas we consider</h3><p>Cheshire · Greater Manchester · Merseyside · Lancashire</p><p>Including Warrington, Manchester, Liverpool, Chester and surrounding areas.</p><span>LOCATION, SCOPE AND PROGRAMME SUBJECT TO REVIEW</span></div>
      </div>
    </section>

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
