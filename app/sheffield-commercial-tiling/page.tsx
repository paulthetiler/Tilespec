import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/sheffield-commercial-tiling";

export const metadata: Metadata = {
  title: "Sheffield Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Sheffield contractors. TileSPEC offers coordinated preparation, tile supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Sheffield Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling for Sheffield commercial refurbishment, education facilities, leisure buildings and mixed-use developments, with substrate preparation and installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Robust porcelain floor installations for commercial interiors, communal areas, public spaces and education facilities.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Wall tiling and washroom finishes with suitable backgrounds and neat transitions to surrounding materials.", icon: Check },
  { title: "Substrate preparation", detail: "Floor repairs, levelling, boarding and specified waterproofing assessed for the conditions on each site.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Coordinated procurement, substrate works, tiling and installation checks within one agreed package.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Assess drawings, finishes, existing substrates and site constraints for the Sheffield commercial project." },
  { title: "Plan the work", detail: "Plan preparation, materials and area-by-area installation around other trades and site access." },
  { title: "Manage installation", detail: "Check setting-out and finished details, record queries and work towards the agreed handover." },
];

const faq = [
  { q: "What kinds of commercial tiling can you quote in Sheffield?", a: "We consider office, retail, education, hospitality, washroom and communal-area wall and floor tiling as part of commercial projects." },
  { q: "Can TileSPEC work on refurbishment substrates?", a: "Yes. We can assess levelling, repairs, boarding or specified waterproofing alongside tiling, subject to the condition and proposed system." },
  { q: "Does TileSPEC consider South Yorkshire sites beyond Sheffield?", a: "We review enquiries from neighbouring areas of South Yorkshire, taking into account the scope, access and programme." },
  { q: "Can a tender include material supply and installation?", a: "Yes. Provide the finishes schedule, drawings and programme and we can assess a coordinated package including procurement, preparation and installation." },
];

export default function SheffieldCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Sheffield commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Sheffield","South Yorkshire","Yorkshire and the Humber"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling for Sheffield, including preparation and supply-and-install packages.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · SHEFFIELD</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>SHEFFIELD.</em></h1>
        <p className="nw-lead">Commercial tiling contractors for Sheffield and South Yorkshire projects. TileSPEC supports main contractors with wall and floor tiling, substrate preparation and coordinated supply-and-install packages.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · SHEFFIELD COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Sheffield's commercial refurbishment and development projects can involve different substrates, occupied or phased environments and carefully detailed public-facing spaces. Successful tiling relies on identifying preparation requirements before installation starts.</p><p>TileSPEC considers commercial floor and wall packages based on the drawings, finishes and programme. Our approach brings preparation, setting-out, supply and installation into a clear scope for the main contractor.</p></div>
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
        <div><div className="nw-kicker">SHEFFIELD COVERAGE</div><h2>SHEFFIELD &<br/><em>SOUTH YORKSHIRE.</em></h2><p className="nw-coverage-intro">We consider commercial wall and floor tiling enquiries in Sheffield and surrounding South Yorkshire locations.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Sheffield and neighbouring districts</h3><p>Sheffield city centre · Attercliffe · Hillsborough · Meadowhall area</p><p>Surrounding South Yorkshire enquiries can be reviewed against scope and programme.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
      </div>
    </section>

    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <footer className="nw-footer"><div className="nw-wrap nw-footer-row"><Link href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC" width={164} height={45}/></Link><p>Commercial wall & floor tiling · Sheffield, South Yorkshire</p><div><Link href="/">Homepage</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer>
  </main>;
}
