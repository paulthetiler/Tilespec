import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/stoke-on-trent-commercial-tiling";

export const metadata: Metadata = {
  title: "Stoke-on-Trent Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Stoke-on-Trent contractors. TileSPEC offers coordinated preparation, tile supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Stoke-on-Trent Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling for Stoke-on-Trent industrial and business premises, retail, hospitality and education facilities, with substrate preparation and installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Durable large-format porcelain and other specified floor finishes for commercial premises, public areas and high-traffic circulation routes.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Commercial washroom and wall finishes with considered setting-out, consistent joints and clean transitions to adjacent finishes.", icon: Check },
  { title: "Substrate preparation", detail: "Levelling, repairs, boarding and specified waterproofing, selected to suit the actual substrate and intended finish.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Tile procurement, preparation, fitting and site coordination brought together within an agreed specialist package.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review drawings, substrate information, finish schedules and programme constraints before returning a Stoke-on-Trent tender." },
  { title: "Plan the work", detail: "Coordinate material requirements, access and preparation work with the wider refurbishment or construction sequence." },
  { title: "Manage installation", detail: "Monitor installation, agreed details and handover items, communicating site queries as they arise." },
];

const faq = [
  { q: "Can TileSPEC price factory office or commercial washroom tiling?", a: "We consider tiling for offices, washrooms, circulation areas and other specified commercial interiors. We review substrate conditions and performance requirements before defining the installation scope." },
  { q: "Do you cover Newcastle-under-Lyme as well as Stoke-on-Trent?", a: "We consider relevant enquiries in Newcastle-under-Lyme and neighbouring North Staffordshire, subject to the project scope and programme." },
  { q: "Can the quote include preparation of older floors?", a: "Yes. Repairs, suitable levelling systems, boarding and other substrate work can be incorporated where appropriate to the specification and existing condition." },
  { q: "What do you need to price a Stoke-on-Trent project?", a: "Please send drawings, the finishes schedule, areas or quantities, programme details and any photographs or substrate information you have." },
];

export default function StokeOnTrentCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Stoke-on-Trent commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Stoke-on-Trent","Staffordshire","West Midlands"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling for Stoke-on-Trent, including preparation and supply-and-install packages.",
  };

  return <main className="nw-page">
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · STOKE-ON-TRENT</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>STOKE-ON-TRENT.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for contractors working in Stoke-on-Trent and North Staffordshire. TileSPEC coordinates substrate preparation, material supply and installation for practical, hard-wearing commercial finishes.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · STOKE-ON-TRENT COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Commercial interiors across Stoke-on-Trent include manufacturing-related workplaces, business premises, education buildings and retail refurbishments. The right installation starts by understanding how the spaces will be used and what condition the existing backgrounds are in.</p><p>TileSPEC works with main contractors and fit-out teams to assess preparation, sequencing and installation requirements. We aim to deliver a clearly scoped tiling package that fits the project programme and specification.</p></div>
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
        <div><div className="nw-kicker">STOKE-ON-TRENT COVERAGE</div><h2>STOKE-ON-TRENT &<br/><em>NORTH STAFFORDSHIRE.</em></h2><p className="nw-coverage-intro">We consider Stoke-on-Trent commercial tiling enquiries and suitable projects across neighbouring North Staffordshire locations.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Stoke-on-Trent and nearby areas</h3><p>Hanley · Fenton · Longton · Burslem</p><p>Also considering Newcastle-under-Lyme and surrounding North Staffordshire commercial sites.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
      </div>
    </section>

    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <footer className="nw-footer"><div className="nw-wrap nw-footer-row"><Link href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC" width={164} height={45}/></Link><p>Commercial wall & floor tiling · Stoke-on-Trent, Staffordshire</p><div><Link href="/">Homepage</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer>
  </main>;
}
