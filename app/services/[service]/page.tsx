import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import LandingFooter from "../../../components/landing-footer";
import "../../north-west-commercial-tiling/north-west.css";

const origin = "https://www.tilespec.uk";
const services = {
  "commercial-floor-tiling": {
    title: "Commercial Floor Tiling",
    heading: "COMMERCIAL FLOOR TILING.",
    description: "Specialist porcelain and ceramic floor tiling for commercial developments, retail, hospitality and public-use interiors.",
    intro: "Commercial flooring needs a considered plan before installation begins. We review the substrate, setting-out, movement joints, access and working sequence alongside the specified tile and finish.",
    scope: [
      ["Substrate review", "Review surface condition, flatness and suitability before agreeing the required preparation."],
      ["Setting-out and finishes", "Coordinate tile format, layout, cut details, interfaces and specified movement joints."],
      ["Installation planning", "Account for access, deliveries, sequencing, productivity and site handover requirements."],
    ],
  },
  "commercial-wall-tiling": {
    title: "Commercial Wall Tiling",
    heading: "COMMERCIAL WALL TILING.",
    description: "Commercial wall tiling for washrooms, hospitality, retail interiors and shared public-use spaces.",
    intro: "Wall finishes depend on suitable backgrounds and accurate setting-out. We assess the wall build-up, specified finishes, trims and interfaces with fixtures before works are programmed.",
    scope: [
      ["Background preparation", "Confirm background suitability and any specified boarding or waterproofing requirements."],
      ["Detailed setting-out", "Consider tile sizes, joints, trims, corners, sanitaryware and service penetrations."],
      ["Quality and handover", "Plan coordinated installation and inspection against the agreed scope and finish schedule."],
    ],
  },
  "commercial-tiling-packages": {
    title: "Complete Commercial Tiling Packages",
    heading: "COMPLETE TILING PACKAGES.",
    description: "Coordinated tile procurement, substrate preparation, wall and floor installation and handover for commercial projects.",
    intro: "One clearly scoped specialist package helps main contractors coordinate the tiling works. TileSPEC reviews the drawings, finish schedules, procurement needs and site programme before pricing.",
    scope: [
      ["Tender and specification review", "Clarify inclusions, exclusions, material responsibilities and drawing revisions."],
      ["Procurement and site logistics", "Consider lead times, deliveries, storage, access and programme dependencies."],
      ["Supervision and completion", "Coordinate installation, progress reporting, inspections and planned handover works."],
    ],
  },
  "commercial-substrate-preparation": {
    title: "Commercial Substrate Preparation",
    heading: "SUBSTRATE PREPARATION.",
    description: "Specified commercial floor and wall preparation, levelling, boarding and waterproofing ahead of tile installation.",
    intro: "A durable tiling installation starts with the right background. Preparation is assessed against existing site conditions, tile formats, required tolerances and the specified system.",
    scope: [
      ["Assess before installation", "Review condition, level, moisture considerations and compatibility with the proposed system."],
      ["Specify the build-up", "Plan suitable repairs, levelling, boards, membranes or waterproofing where required."],
      ["Coordinate the programme", "Account for preparation, drying or curing requirements, follow-on trades and inspections."],
    ],
  },
} as const;

type ServiceSlug = keyof typeof services;
type Props = { params: Promise<{ service: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(services).map(service => ({ service }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service } = await params;
  if (!(service in services)) return {};
  const details = services[service as ServiceSlug];
  const url = `${origin}/services/${service}`;
  return {
    title: `${details.title} | TileSPEC`,
    description: details.description,
    alternates: { canonical: url },
    openGraph: { title: `${details.title} | TileSPEC`, description: details.description, url, type: "website" },
  };
}
export default async function ServicePage({ params }: Props) {
  const { service } = await params;
  if (!(service in services)) notFound();
  const details = services[service as ServiceSlug];
  return <main className="nw-page" id="top">
    <header className="nw-header"><div className="nw-wrap nw-header-row">
      <Link className="nw-brand" href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width={230} height={62}/></Link>
      <nav className="nw-nav" aria-label="Page navigation"><Link href="/">Home</Link><Link href="/coverage">Coverage</Link><Link href="/contact">Contact</Link></nav>
      <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
    </div></header>
    <section className="nw-hero">
      <div className="nw-hero-photo" role="img" aria-label="Commercial tiled interior"/>
      <div className="nw-wrap nw-hero-content">
        <div className="nw-eyebrow"><span/> TILESPEC SPECIALIST SERVICES</div>
        <h1 style={{fontSize:"clamp(42px,5.5vw,83px)"}}>{details.heading}</h1>
        <p className="nw-lead">{details.description}</p>
        <div className="nw-hero-actions"><Link className="nw-button nw-button-accent" href="/contact">DISCUSS YOUR PROJECT <ArrowUpRight size={18}/></Link></div>
        <div className="nw-hero-foot">WARRINGTON-BASED · UK COMMERCIAL PROJECT ENQUIRIES</div>
      </div>
    </section>
    <section className="nw-intro nw-space"><div className="nw-wrap nw-two-col">
      <div><div className="nw-kicker">A PLANNED SPECIALIST PACKAGE</div><h2>REVIEW THE SCOPE.<br/><em>DELIVER THE FINISH.</em></h2></div>
      <div className="nw-intro-text"><p>{details.intro}</p><p>We price appropriate projects from the drawings, specification, substrate information and programme. Any work outside the agreed tiling package is identified before commitment.</p></div>
    </div></section>
    <section className="nw-approach nw-space"><div className="nw-wrap">
      <div className="nw-section-heading"><div className="nw-kicker">WHAT WE CONSIDER</div><h2>TECHNICAL SCOPE<br/><em>AND DELIVERY.</em></h2></div>
      <div className="nw-steps">{details.scope.map(([title, copy]) => <article key={title}><span className="nw-rule"/><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </div></section>
    <section className="nw-intro nw-space"><div className="nw-wrap">
      <div className="nw-kicker">MORE TILESPEC SERVICES</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:18,marginTop:18}}>
        {Object.entries(services).filter(([slug]) => slug !== service).map(([slug, item]) =>
          <Link key={slug} href={`/services/${slug}`} style={{color:"inherit",fontWeight:700,textDecoration:"underline"}}>{item.title}</Link>)}
      </div>
      <p style={{marginTop:22}}><Link href="/coverage">Explore UK regional coverage</Link> · <Link href="/guides">Read technical guidance</Link></p>
    </div></section>
    <section className="nw-cta"><div className="nw-wrap nw-cta-inner">
      <div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send drawings, specifications and your working programme for review.</p></div>
      <div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a></div>
    </div></section>
    <LandingFooter/>
  </main>;
}
