import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/preston-commercial-tiling";

export const metadata: Metadata = {
  title: "Preston Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Preston and Central Lancashire. TileSPEC supports contractors with preparation, supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Preston Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling packages for Preston and Central Lancashire contractors.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Commercial porcelain and large-format floor installations for education, leisure, retail and shared-use interiors in Preston.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Wall tiling for commercial washrooms, public areas and refurbishment projects, with practical setting-out and edge details.", icon: Check },
  { title: "Substrate preparation", detail: "Floor preparation, levelling, repairs, mechanically fixed boarding where appropriate and specified waterproofing.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Coordinated packages that can include tile materials, substrate preparation, installation and final checks.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Assess the Preston project's drawings, access, programme and suitability of existing walls and floor backgrounds." },
  { title: "Plan the work", detail: "Plan material requirements and preparation work before tiling, including coordination with other site activities." },
  { title: "Manage installation", detail: "Monitor workmanship, raise practical site queries and complete agreed quality and handover checks." },
];

const faq = [
  { q: "What types of Preston commercial projects can you price?", a: "We consider wall and floor tiling in education, retail, leisure and public-use buildings, as well as general commercial refurbishments and developments." },
  { q: "Can you quote from specifications and drawings?", a: "Yes. Send the tiling plans, finish schedule, quantities and programme through our tender form. Existing substrate information is particularly helpful for refurbishments." },
  { q: "Do you consider work in Leyland and Chorley?", a: "We consider projects in Preston and the surrounding Central Lancashire area, including Leyland and Chorley, subject to the requirements of each job." },
  { q: "Can TileSPEC take responsibility for floor preparation?", a: "Substrate preparation and levelling can be included within the agreed tiling scope where suitable for the surface and specification." },
];

export default function NorthWestCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Preston commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Preston","Lancashire","North West England"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling packages for Preston and Central Lancashire contractors.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · PRESTON</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>PRESTON.</em></h1>
        <p className="nw-lead">Commercial tiling packages for contractors and developers in Preston and Central Lancashire. From the assessment of existing backgrounds to tile supply, installation and handover.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · PRESTON & CENTRAL LANCASHIRE ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Preston commercial projects can involve education buildings, public facilities, retail units, leisure spaces and general refurbishment. Whether work is in a new build or an existing property, background condition and site access affect the tiling programme.</p><p>TileSPEC provides a coordinated approach to wall and floor tiling, reviewing the substrates and specification before planning materials and installation. The aim is straightforward delivery and consistent finishes.</p></div>
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
        <div><div className="nw-kicker">PRESTON COVERAGE</div><h2>PRESTON &<br/><em>CENTRAL LANCASHIRE.</em></h2><p className="nw-coverage-intro">We consider commercial tiling work in Preston and nearby Central Lancashire locations, assessing each project's practical requirements before committing.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Preston and nearby Lancashire</h3><p>Preston city centre · Fulwood · Leyland · Chorley</p><p>Including education, public-use, retail, commercial fit-out and refurbishment enquiries.</p><span>SUBJECT TO PROJECT SCOPE, ACCESS AND PROGRAMME</span></div>
      </div>
    </section>

    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <footer className="nw-footer"><div className="nw-wrap nw-footer-row"><Link href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC" width={164} height={45}/></Link><p>Commercial wall & floor tiling · Preston, Lancashire</p><div><Link href="/">Homepage</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer>
  </main>;
}
