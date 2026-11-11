import type { Metadata } from "next";
import Link from "next/link";
import LandingFooter from "../../components/landing-footer";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/nottingham-commercial-tiling";

export const metadata: Metadata = {
  title: "Nottingham Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Nottingham contractors. TileSPEC provides tile supply, preparation and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Nottingham Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling in Nottingham for office fit-outs, retail refurbishments, leisure buildings and communal interiors, with tile supply and preparation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Porcelain flooring for Nottingham office receptions, retail areas and high-use commercial interiors.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Washroom and other commercial wall tiling, including careful joints, corners and interfaces.", icon: Check },
  { title: "Substrate preparation", detail: "Repairs, levelling, specified waterproofing and suitable board preparation where needed.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Tile supply and installation coordinated with substrate work and site handover.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review Nottingham project drawings, finishes, substrate conditions and construction programme before pricing." },
  { title: "Plan the work", detail: "Coordinate access, preparation, material supply and installation with the wider site team." },
  { title: "Manage installation", detail: "Monitor workmanship, address practical site queries and prepare for agreed handover checks." },
];

const faq = [
  { q: "Can you quote a Nottingham office or retail fit-out?", a: "Yes. Share drawings, quantities, finishes information, existing surface details and the intended programme through our enquiry form." },
  { q: "Can you supply tiles as well as fit them?", a: "Yes. Tile procurement, suitable substrate preparation and installation can be included in the agreed commercial package." },
  { q: "Do you undertake commercial washroom tiling?", a: "We consider commercial wall and floor tiling to washrooms and shared spaces, with the system reviewed against the specified use." },
  { q: "What do you need to price a project?", a: "Send the drawings, finishes schedule, quantities and programme through our tender enquiry form so we can assess scope and access." },
];

export default function NottinghamCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Nottingham commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Nottingham","East Midlands"],
    url: origin + pagePath,
    description: "Commercial tiling for Nottingham including substrate preparation and supply-and-install packages.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · NOTTINGHAM</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>NOTTINGHAM.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for Nottingham main contractors, developers and fit-out teams. TileSPEC offers coordinated preparation, tile procurement and installation.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · NOTTINGHAM COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Nottingham's commercial fit-outs and refurbishments involve offices, retail settings, hospitality spaces and communal facilities. Access constraints, existing substrates and the finishes schedule all affect installation planning.</p><p>TileSPEC considers wall and floor tiling as a coordinated commercial package, including preparation, tile procurement, installation and quality checks.</p></div>
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
        <div><div className="nw-kicker">NOTTINGHAM COVERAGE</div><h2>NOTTINGHAM PROJECTS.<br/><em>EAST MIDLANDS REACH.</em></h2><p className="nw-coverage-intro">We consider commercial tiling enquiries in Nottingham and surrounding areas, based on project scope, access and programme.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Nottingham city centre and nearby Nottinghamshire business districts</h3><p>City centre · Lace Market · Lenton · Beeston</p><p>Suitable projects elsewhere in the East Midlands can be reviewed individually.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
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
