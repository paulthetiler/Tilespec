import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, FileText, Layers3, MapPin, ShieldCheck } from "lucide-react";
import LandingFooter from "../../components/landing-footer";
import { RegionalConnections, LondonConnections } from "../../components/regional-links";
import { commercialLocations, type CommercialLocation } from "../../lib/commercial-locations";
import "../north-west-commercial-tiling/north-west.css";

const origin = "https://www.tilespec.uk";
export const dynamicParams = false;

type Params = { params: Promise<{ location: string }> };

function getLocation(slug: string): CommercialLocation | undefined {
  return commercialLocations.find((item) => item.slug === slug);
}

export function generateStaticParams() {
  return commercialLocations.map((item) => ({ location: item.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { location } = await params;
  const market = getLocation(location);
  if (!market) return {};
  const url = origin + "/" + market.slug;
  const title = market.city + " Commercial Tiling Contractors | TileSPEC";
  const description = "Commercial wall and floor tiling for " + market.city + " contractors. TileSPEC considers preparation, tile supply and installation for commercial projects.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: market.city + " Commercial Tiling | TileSPEC",
      description: "Commercial tiling for " + market.focus + " in " + market.city + ", with substrate preparation and installation.",
      type: "website",
      url,
    },
  };
}

const capabilities = [
  { title: "Commercial floor tiling", icon: Layers3 },
  { title: "Wall tiling & finishes", icon: Check },
  { title: "Substrate preparation", icon: ShieldCheck },
  { title: "Supply & installation", icon: FileText },
] as const;

export default async function RegionalCommercialTiling({ params }: Params) {
  const { location } = await params;
  const market = getLocation(location);
  if (!market) notFound();

  const capabilityDetails = [
    "Porcelain and specified large-format flooring for " + market.city + " " + market.focus + ", with setting-out suited to the actual site.",
    "Tiled commercial washrooms, communal areas and other interior finishes, with careful joints, edges and interfaces.",
    "Assessment, levelling, suitable boards, repairs and waterproofing where required by the existing backgrounds and specification.",
    "A coordinated package covering procurement, substrate preparation, installation, site communication and completion checks.",
  ];
  const steps = [
    { title: "Understand the scope", detail: "Review the " + market.city + " project's drawings, tiling specification, existing backgrounds and proposed programme." },
    { title: "Plan the work", detail: "Consider " + market.risk + ", access, materials and coordination with other trades before installation." },
    { title: "Manage installation", detail: "Maintain communication about programme, installation details, workmanship and agreed handover requirements." },
  ];
  const faq = [
    { q: "What commercial tiling projects do you consider in " + market.city + "?", a: "We review tenders involving " + market.focus + ". Suitability depends on the scope, specification, site conditions and programme." },
    { q: "Can you quote a " + market.city + " refurbishment from drawings?", a: "Yes. Please send available drawings, areas or quantities, finish schedules, site photographs where relevant and the intended programme through our enquiry form." },
    { q: "Can substrate preparation be part of the package?", a: "Yes. We can assess appropriate levelling, repairs, board systems and specified waterproofing as part of the wall or floor tiling works." },
    { q: "Are you based in " + market.city + "?", a: "TileSPEC is based in Warrington and considers commercial project enquiries across the UK. We assess travel, labour, programme and site requirements when reviewing a tender." },
  ];
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: market.city + " commercial wall and floor tiling",
    serviceType: "Commercial tiling supply, preparation and installation",
    provider: { "@type": "Organization", name: "TileSPEC", url: origin },
    areaServed: [{ "@type": "Place", name: market.city + ", " + market.region }],
    description: "Commercial wall and floor tiling packages for contractors in " + market.city + ", including substrate preparation and supply-and-install work.",
    url: origin + "/" + market.slug,
  };

  return <main className="nw-page" id="top">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
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
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · {market.city.toUpperCase()}</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em style={market.city.length > 14 ? {fontSize:"clamp(49px,6.4vw,87px)"} : undefined}>{market.city.toUpperCase()}.</em></h1>
        <p className="nw-lead">Commercial wall and floor tiling for main contractors, developers and fit-out teams working in {market.city}. From substrate preparation and tile procurement to installation and handover.</p>
        <div className="nw-hero-actions">
          <Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link>
          <a className="nw-secondary-link" href="#nw-services">Explore the scope <span aria-hidden="true">↓</span></a>
        </div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · {market.city.toUpperCase()} COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>

    <section className="nw-intro nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">A COMPLETE SPECIALIST PACKAGE</div><h2>ONE TILING PACKAGE.<br/><em>PROPERLY COORDINATED.</em></h2></div>
        <div className="nw-intro-text"><p>{market.intro1}</p><p>{market.intro2}</p></div>
      </div>
    </section>

    <section className="nw-services nw-space" id="nw-services">
      <div className="nw-wrap">
        <div className="nw-section-heading"><div className="nw-kicker">WHAT WE DELIVER</div><h2>COMMERCIAL TILING<br/><em>SERVICES.</em></h2></div>
        <div className="nw-capabilities">
          {capabilities.map((item, index) => <article className="nw-capability" key={item.title}>
            <span className="nw-icon"><item.icon size={23} strokeWidth={1.6} aria-hidden="true"/></span>
            <h3>{item.title}</h3><p>{capabilityDetails[index]}</p>
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
        <div className="nw-steps">{steps.map((item) => <article key={item.title}><span className="nw-rule"/><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
      </div>
    </section>

    <section className="nw-coverage nw-space" id="nw-coverage">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">{market.city.toUpperCase()} COVERAGE</div><h2>{market.city.toUpperCase()} PROJECTS.<br/><em>REGIONAL SUPPORT.</em></h2><p className="nw-coverage-intro">We consider commercial tiling tenders in {market.city} and surrounding areas, reviewing project scale, travel, site access and programme individually.</p></div>
        <div className="nw-coverage-box"><MapPin size={25} strokeWidth={1.5} aria-hidden="true"/><h3>{market.city} and surrounding areas</h3><p>{market.areas}</p><p>Including suitable commercial projects throughout {market.region}.</p><span>LOCATION, SCOPE AND PROGRAMME SUBJECT TO REVIEW</span></div>
      </div>
    </section>

    {market.slug === "london-commercial-tiling" ? <LondonConnections/> : <RegionalConnections slug={market.slug}/>}
    <section className="nw-faq nw-space">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FREQUENT QUESTIONS</div><h2>THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">{faq.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </div>
    </section>

    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div></div></section>
    <LandingFooter />
  </main>;
}
