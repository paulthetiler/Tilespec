import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/liverpool-commercial-tiling";

export const metadata: Metadata = {
  title: "Liverpool Commercial Tiling Contractors | TileSPEC",
  description: "Commercial tiling contractors for Liverpool and Merseyside. TileSPEC delivers wall and floor tiling packages for retail, hospitality, commercial interiors and developers.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Liverpool Commercial Tiling | TileSPEC",
    description: "Coordinated commercial wall and floor tiling services for Liverpool and Merseyside projects.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Durable porcelain and large-format floors for Liverpool retail, hospitality, public areas and commercial developments.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Tiling to washrooms, hospitality interiors and circulation spaces with neat junctions, trims and consistent setting-out.", icon: Check },
  { title: "Substrate preparation", detail: "Floor levelling, background repairs, boarding and specified waterproofing before the final tile installation.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Commercial packages covering materials, preparation, installation, progress coordination and final checks.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Review the Liverpool project's drawings, finish schedule and condition of existing walls and floors before pricing." },
  { title: "Plan the work", detail: "Plan deliveries, preparation and tiled areas in line with access constraints and the wider fit-out sequence." },
  { title: "Manage installation", detail: "Manage installation quality and communicate outstanding decisions or site interfaces through to handover." },
];

const faq = [
  { q: "Does TileSPEC undertake Liverpool hospitality and leisure tiling?", a: "We consider wall and floor tiling packages for hotels, leisure facilities, hospitality areas and their washrooms or shared spaces, subject to the specification." },
  { q: "Can you price a Liverpool commercial refurbishment?", a: "Yes. Send available drawings, the finish schedule, site photographs and any notes about existing surfaces or access through our enquiry form." },
  { q: "Do you cover Merseyside outside Liverpool city centre?", a: "We consider enquiries across surrounding Merseyside areas, including Sefton and the Wirral, depending on the scope and programme." },
  { q: "Can preparation and waterproofing be included?", a: "Yes. Appropriate preparation, suitable boards, levelling and specified waterproofing can be included as part of the complete tiling scope." },
];

export default function NorthWestCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Liverpool commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Liverpool","Merseyside","North West England"],
    url: origin + pagePath,
    description: "Coordinated commercial wall and floor tiling services for Liverpool and Merseyside projects.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · LIVERPOOL</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>LIVERPOOL.</em></h1>
        <p className="nw-lead">Specialist commercial wall and floor tiling for Liverpool and Merseyside. TileSPEC supports tendering contractors with complete preparation, procurement and installation packages for commercial interiors.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · LIVERPOOL & MERSEYSIDE PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Liverpool's mix of established buildings and new commercial spaces calls for careful planning. Refurbishment backgrounds, public-facing finishes and programmes shared with other trades can all affect how a tiling package is delivered.</p><p>For retail, hospitality, leisure and commercial developments, TileSPEC works from the agreed specification and site conditions. We combine preparation, setting-out and installation with a clear focus on durability and finished detail.</p></div>
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
        <div><div className="nw-kicker">LIVERPOOL COVERAGE</div><h2>LIVERPOOL &<br/><em>MERSEYSIDE.</em></h2><p className="nw-coverage-intro">We welcome commercial tiling enquiries in Liverpool and surrounding Merseyside areas. Each project's location, access and programme is reviewed individually.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Liverpool and wider Merseyside</h3><p>Liverpool city centre · Baltic Triangle · Sefton · Wirral</p><p>Retail, leisure, hospitality and commercial properties across the wider Liverpool area.</p><span>PROJECT LOCATION AND SCOPE SUBJECT TO REVIEW</span></div>
      </div>
    </section>

    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <footer className="nw-footer"><div className="nw-wrap nw-footer-row"><Link href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC" width={164} height={45}/></Link><p>Commercial wall & floor tiling · Liverpool, Merseyside</p><div><Link href="/">Homepage</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer>
  </main>;
}
