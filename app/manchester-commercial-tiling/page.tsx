import { RegionalConnections } from "../../components/regional-links";
import type { Metadata } from "next";
import Link from "next/link";
import LandingFooter from "../../components/landing-footer";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://www.tilespec.uk";
const pagePath = "/manchester-commercial-tiling";

export const metadata: Metadata = {
  title: "Manchester Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling in Manchester for main contractors and fit-out teams. TileSPEC provides preparation, tile supply, site coordination and installation.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Manchester Commercial Tiling | TileSPEC",
    description: "Commercial tiling services for Manchester offices, hospitality, retail and mixed-use developments.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Porcelain and large-format floors for Manchester offices, retail spaces, reception areas and other high-traffic interiors.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Wall finishes for commercial washrooms, hospitality areas and shared spaces, with careful attention to edges and interfaces.", icon: Check },
  { title: "Substrate preparation", detail: "Levelling, repairs, suitable boards and waterproofing, assessed against the existing background and project requirements.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Tile procurement, preparation, installation and site supervision brought together for main contractors and fit-out teams.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review Manchester project drawings, specification, substrate conditions, access and programme before developing a scope." },
  { title: "Plan the work", detail: "Coordinate preparation, materials and installation sequence with the demands of the wider site and other trades." },
  { title: "Manage installation", detail: "Maintain clear site communication and quality checks through installation, snagging and handover." },
];

const faq = [
  { q: "What types of commercial property do you tile in Manchester?", a: "We consider commercial floors and walls for offices, retail units, hospitality interiors, washrooms and communal areas. The installation method depends on the building, use and specification." },
  { q: "Can you quote a Manchester office or retail refurbishment?", a: "Yes. Share drawings, photos or a schedule of areas, the expected programme and relevant substrate information through the tender enquiry form." },
  { q: "Can you work alongside other fit-out trades?", a: "The tiling package can be planned around access, sequencing and the agreed interfaces with other trades. These requirements are reviewed when we assess the tender." },
  { q: "Do you provide tiling materials as well as labour?", a: "Tile procurement and substrate preparation can be included alongside installation, subject to the project scope and specification." },
];

export default function NorthWestCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Manchester commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Manchester","Greater Manchester","North West England"],
    url: origin + pagePath,
    description: "Commercial tiling services for Manchester offices, hospitality, retail and mixed-use developments.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · MANCHESTER</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>MANCHESTER.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for Manchester main contractors, developers and fit-out teams. We help coordinate substrate preparation, tile supply and installation for demanding commercial environments.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · MANCHESTER & GREATER MANCHESTER PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Manchester projects often involve complex working environments, whether that is a busy commercial refurbishment, a hospitality fit-out or a mixed-use building with multiple trades. The tiling package needs practical sequencing, sound substrates and clear communication.</p><p>TileSPEC supports contractors with commercial wall and floor installations planned around drawings, site conditions and the wider programme. From the first substrate checks to final detailing, we focus on a coordinated specialist package.</p></div>
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
        <div><div className="nw-kicker">MANCHESTER COVERAGE</div><h2>MANCHESTER PROJECTS.<br/><em>REGIONAL SUPPORT.</em></h2><p className="nw-coverage-intro">We consider commercial tiling enquiries across Manchester and the wider Greater Manchester area, with the scope and programme reviewed for each project.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Manchester and surrounding areas</h3><p>Manchester city centre · Trafford · Salford · Stockport</p><p>Including commercial fit-outs, refurbishments and new developments across Greater Manchester.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
      </div>
    </section>

    <RegionalConnections slug="manchester-commercial-tiling"/>
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
