import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, Layers3, ShieldCheck, FileText } from "lucide-react";
import LandingFooter from "../../../components/landing-footer";
import { RegionCityLinks } from "../../../components/regional-links";
import { regionalHubs } from "../../../lib/region-hubs";
import "../../north-west-commercial-tiling/north-west.css";

const origin = "https://tilespec.vercel.app";
export const dynamicParams = false;
type Params = { params: Promise<{ region: string }> };
const newHubs = regionalHubs.filter(h => h.id !== "london" && h.id !== "north-west");
export function generateStaticParams() {
  return newHubs.map(h => ({region:h.id}));
}
export async function generateMetadata({params}:Params):Promise<Metadata>{
  const {region}=await params;
  const hub=newHubs.find(h=>h.id===region);
  if(!hub)return {};
  const url=origin+"/"+hub.path;
  const title=hub.name+" Commercial Tiling Contractors | TileSPEC";
  const description="Commercial wall and floor tiling across "+hub.name+". TileSPEC reviews commercial tenders for substrate preparation, tile procurement and installation.";
  return {title,description,alternates:{canonical:url},openGraph:{title,description,url,type:"website"}};
}
const capabilities=[
  {title:"Commercial floor tiling",detail:"Specified porcelain and large-format commercial flooring with appropriate preparation and setting-out.",icon:Layers3},
  {title:"Wall tiling & finishes",detail:"Commercial washrooms, hospitality areas and public-facing wall finishes with considered detailing.",icon:Check},
  {title:"Substrate preparation",detail:"Levelling, repairs, suitable boarding and waterproofing as required by the project specification.",icon:ShieldCheck},
  {title:"Supply & installation",detail:"An agreed package for procurement, preparation, installation, coordination and handover checks.",icon:FileText},
];
export default async function RegionHubPage({params}:Params){
  const {region}=await params;
  const hub=newHubs.find(h=>h.id===region);
  if(!hub)notFound();
  const serviceSchema={"@context":"https://schema.org","@type":"Service",name:hub.name+" commercial wall and floor tiling",serviceType:"Commercial wall and floor tiling",provider:{"@type":"Organization",name:"TileSPEC",url:origin},areaServed:{"@type":"Place",name:hub.name},url:origin+"/"+hub.path};
  return <main className="nw-page" id="top">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(serviceSchema)}}/>
    <header className="nw-header"><div className="nw-wrap nw-header-row">
      <Link className="nw-brand" href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width={230} height={62}/></Link>
      <nav className="nw-nav" aria-label="Page navigation"><Link href="/">Home</Link><a href="#nw-services">Services</a><a href="#regional-locations">Locations</a><Link href="/coverage">UK Coverage</Link></nav>
      <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
    </div></header>
    <section className="nw-hero">
      <div className="nw-hero-photo" role="img" aria-label="Commercial interior with large-format tiled flooring"/>
      <div className="nw-wrap nw-hero-content">
        <div className="nw-eyebrow"><span/> COMMERCIAL TILING · {hub.name.toUpperCase()}</div>
        <h1>COMMERCIAL<br/>TILING IN<br/><em style={hub.name.length>14?{fontSize:"clamp(48px,6.4vw,87px)"}:undefined}>{hub.name.toUpperCase()}.</em></h1>
        <p className="nw-lead">{hub.intro}</p>
        <div className="nw-hero-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a className="nw-secondary-link" href="#regional-locations">Explore locations <span aria-hidden="true">↓</span></a></div>
        <div className="nw-hero-foot">BASED IN WARRINGTON · REGIONAL PROJECT ENQUIRIES</div>
      </div>
    </section>
    <section className="nw-intro nw-space"><div className="nw-wrap nw-two-col">
      <div><div className="nw-kicker">REGIONAL COMMERCIAL TILING</div><h2>ONE SPECIALIST PACKAGE.<br/><em>PLANNED FOR THE SITE.</em></h2></div>
      <div className="nw-intro-text"><p>{hub.detail}</p><p>We price suitable work from the drawings, finishes schedules, substrate conditions and programme. Our Warrington base is not presented as a local office in each region; travel and site arrangements are assessed as part of the tender.</p></div>
    </div></section>
    <section className="nw-services nw-space" id="nw-services"><div className="nw-wrap">
      <div className="nw-section-heading"><div className="nw-kicker">WHAT WE DELIVER</div><h2>COMMERCIAL TILING<br/><em>SERVICES.</em></h2></div>
      <div className="nw-capabilities">{capabilities.map(item=><article className="nw-capability" key={item.title}><span className="nw-icon"><item.icon size={23} strokeWidth={1.6} aria-hidden="true"/></span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
    </div></section>
    <section className="nw-photo-band" aria-label="Commercial tiling installation">
      <div className="nw-photo-band-image" role="img" aria-label="Large open-plan commercial floor tiling installation"/>
      <div className="nw-wrap nw-photo-content"><div className="nw-kicker nw-kicker-light">FROM PREPARATION TO FINISH</div><h2>BUILT AROUND<br/>THE PROJECT.</h2><p>Suitable substrates. Considered setting-out. Clear coordination. A finished installation that meets the agreed specification.</p></div>
    </section>
    <section className="nw-approach nw-space"><div className="nw-wrap">
      <div className="nw-section-heading"><div className="nw-kicker">HOW WE WORK</div><h2>STRAIGHTFORWARD<br/><em>FROM THE START.</em></h2></div>
      <div className="nw-steps">
        <article><span className="nw-rule"/><h3>Review the specification</h3><p>Assess floor build-ups, finishes, drawings and the project programme before agreeing the scope.</p></article>
        <article><span className="nw-rule"/><h3>Plan preparation</h3><p>Consider substrates, procurement, access, sequencing and interfaces with other trades.</p></article>
        <article><span className="nw-rule"/><h3>Deliver and hand over</h3><p>Communicate progress and review installation quality against the agreed details.</p></article>
      </div>
    </div></section>
    <RegionCityLinks hub={hub}/>
    <section className="nw-cta" id="nw-enquire"><div className="nw-wrap nw-cta-inner">
      <div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme details. We’ll review the scope and discuss the next steps.</p></div>
      <div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="tel:+443333393445">0333 339 3445</a></div>
    </div></section>
    <LandingFooter/>
  </main>;
}
