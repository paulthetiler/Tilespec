import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
const pagePath = "/leeds-commercial-tiling";

export const metadata: Metadata = {
  title: "Leeds Commercial Tiling Contractors | TileSPEC",
  description: "Commercial wall and floor tiling for Leeds contractors. TileSPEC offers coordinated preparation, tile supply and installation for commercial projects.",
  alternates: { canonical: origin + pagePath },
  openGraph: {
    title: "Leeds Commercial Tiling | TileSPEC",
    description: "Commercial wall and floor tiling for Leeds office refurbishments, retail fit-outs, hospitality, education and public-use buildings, with substrate preparation and installation.",
    type: "website",
    url: origin + pagePath,
  },
};

const capabilities = [
  { title: "Commercial floor tiling", detail: "Porcelain and other specified floor finishes for Leeds offices, reception areas, retail interiors and high-traffic spaces.", icon: Layers3 },
  { title: "Wall tiling & finishes", detail: "Commercial washrooms, wall finishes and tiled details with considered set-out and consistent finishing.", icon: Check },
  { title: "Substrate preparation", detail: "Levelling, substrate repairs, boarding and specified wet-area waterproofing where the project requires it.", icon: ShieldCheck },
  { title: "Supply & installation", detail: "Combined material procurement, substrate preparation, installation and site coordination where appropriate.", icon: FileText },
];

const approach = [
  { title: "Understand the scope", detail: "Check the Leeds project's drawings, finishes schedule, substrate information and access requirements." },
  { title: "Plan the work", detail: "Coordinate preparation and material supply with the overall fit-out programme and site interfaces." },
  { title: "Manage installation", detail: "Monitor fitting quality, resolve practical installation queries and prepare areas for inspection and handover." },
];

const faq = [
  { q: "Can TileSPEC quote office and retail fit-out tiling in Leeds?", a: "Yes. Send the plans, finishes specification, quantities and indicative programme through the tender enquiry form for review." },
  { q: "Do you include commercial washroom wall tiling?", a: "We consider commercial washrooms and other wall-finishing packages, including relevant background preparation and detail work." },
  { q: "Can floor levelling be included with installation?", a: "Where it suits the substrate and agreed specification, floor preparation and levelling can be included in a single commercial tiling package." },
  { q: "Do you cover projects outside Leeds city centre?", a: "We review suitable projects in surrounding Leeds and West Yorkshire locations against access, scope and programme." },
];

export default function LeedsCommercialTiling() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Leeds commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: ["Leeds","West Yorkshire","Yorkshire and the Humber"],
    url: origin + pagePath,
    description: "Commercial wall and floor tiling for Leeds, including preparation and supply-and-install packages.",
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · LEEDS</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em>LEEDS.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for Leeds main contractors and fit-out specialists. TileSPEC delivers considered preparation, tile procurement and installation for commercial interiors.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · LEEDS COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>Leeds offers a broad mix of city-centre commercial interiors, retail environments, university facilities and hospitality spaces. For tiling packages, planning around substrate condition, other trades and the finish schedule is as important as the final appearance.</p><p>TileSPEC reviews Leeds commercial tenders from the installation perspective: suitable backgrounds, clear scope boundaries, material selection and a workable sequence from preparation to finished floor and wall tiling.</p></div>
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
        <div><div className="nw-kicker">LEEDS COVERAGE</div><h2>LEEDS PROJECTS.<br/><em>WEST YORKSHIRE REACH.</em></h2><p className="nw-coverage-intro">We consider commercial tiling enquiries across Leeds and suitable West Yorkshire locations, depending on project size, access and programme.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>Leeds and surrounding business districts</h3><p>Leeds city centre · Holbeck · Headingley · Hunslet</p><p>We can review larger commercial enquiries from elsewhere in West Yorkshire on a project-by-project basis.</p><span>ENQUIRIES REVIEWED AGAINST SCOPE AND PROGRAMME</span></div>
      </div>
    </section>

    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((f)=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>

    <footer className="nw-footer"><div className="nw-wrap nw-footer-row"><Link href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC" width={164} height={45}/></Link><p>Commercial wall & floor tiling · Leeds, West Yorkshire</p><div><Link href="/">Homepage</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer>
  </main>;
}
