import type { Metadata } from "next";
import Link from "next/link";
import LandingFooter from "../../components/landing-footer";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/wrexham-commercial-tiling";

export const metadata: Metadata = {
  title: "Wrexham Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Wrexham contractors. TileSPEC offers coordinated preparation, tile supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Wrexham Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling for Wrexham industrial and business parks, education, hospitality and public-use commercial spaces, with substrate preparation and installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Commercial porcelain and large-format floor tiling for offices, business premises, public facilities and circulation spaces.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Tiled washrooms, hospitality areas and wall finishes with durable details suited to the intended use.", icon: Check },
  { title: "Substrate preparation", detail: "Floor repairs, levelling, suitable boarding and waterproofing where specified and appropriate for the substrate.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "An agreed specialist package covering tile procurement, preparation, installation and finishing checks.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review the Wrexham project specification, drawings, existing surfaces and any site or programme constraints." },
  { title: "Plan the work", detail: "Plan preparation and tiling around material delivery, access and coordination with the principal contractor." },
  { title: "Manage installation", detail: "Check the finished installation against the agreed scope and work through remaining handover details." },
];

const faq = [
  { q: "Does TileSPEC undertake commercial tiling in North Wales?", a: "We consider projects in Wrexham and nearby North East Wales locations, including suitable enquiries in Flintshire." },
  { q: "Can you provide wall and floor tiling for business premises?", a: "Yes. Our scope can include commercial floor tiling, washroom wall finishes, preparation and associated installation details." },
  { q: "Can a Wrexham tender include materials and preparation?", a: "Tile supply and suitable substrate preparation can form part of an agreed package alongside installation." },
  { q: "What details are needed for a Wrexham project enquiry?", a: "Please provide drawings, a finishes schedule, areas or quantities, site location and intended programme so we can assess the scope." },
];

export default function WrexhamCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Wrexham commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Wrexham","North Wales","Wales"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling for Wrexham, including preparation and supply-and-install packages.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · WREXHAM</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>WREXHAM.</em></h1>
        <p className="nw-lead">Commercial tiling for Wrexham and North East Wales. TileSPEC supports contractors with preparation, supply and installation of wall and floor finishes for commercial projects.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · WREXHAM COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Wrexham's business, industrial and public-use buildings can require durable, easily maintained floor and wall finishes. Working in existing spaces may also mean dealing with uneven substrates, restricted access and installation around live site activities.</p><p>TileSPEC considers Wrexham commercial tiling packages with substrate suitability and project sequencing in mind. We combine practical preparation advice with specified tile supply, installation and handover requirements.</p></div>
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
        <div><div className="nw-kicker">WREXHAM COVERAGE</div><h2>WREXHAM &<br/><em>NORTH EAST WALES.</em></h2><p className="nw-coverage-intro">We consider commercial tiling enquiries in Wrexham and the surrounding North East Wales area, subject to project suitability.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Wrexham and surrounding locations</h3><p>Wrexham city centre · Gwersyllt · Rhosllanerchrugog · Chirk</p><p>We can review suitable commercial enquiries in nearby Flintshire and North East Wales.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
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
