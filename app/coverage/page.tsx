import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import LandingFooter from "../../components/landing-footer";
import { regionalHubs, locationDisplayName } from "../../lib/region-hubs";
import "../north-west-commercial-tiling/north-west.css";

export const metadata:Metadata={
 title:"UK Commercial Tiling Coverage | TileSPEC",
 description:"Explore TileSPEC commercial wall and floor tiling coverage across UK regions and 75 major city and town markets. Warrington-based, nationwide commercial project enquiries.",
 alternates:{canonical:"https://www.tilespec.uk/coverage"},
 openGraph:{title:"UK Commercial Tiling Coverage | TileSPEC",description:"Commercial tiling coverage across the UK, from the North West to the South Coast, Wales and central Scotland.",url:"https://www.tilespec.uk/coverage",type:"website"},
};
export default function CoveragePage(){
 return <main className="nw-page" id="top">
  <header className="nw-header"><div className="nw-wrap nw-header-row">
   <Link className="nw-brand" href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width={230} height={62}/></Link>
   <nav className="nw-nav" aria-label="Page navigation"><Link href="/">Home</Link><a href="#regions">Regions</a><Link href="/#expertise">Services</Link><Link href="/#about">About</Link></nav>
   <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
  </div></header>
  <section className="nw-hero"><div className="nw-hero-photo" role="img" aria-label="Commercial tiled interior"/>
   <div className="nw-wrap nw-hero-content"><div className="nw-eyebrow"><span/> NATIONAL COMMERCIAL TILING COVERAGE</div>
    <h1>UK COMMERCIAL<br/><em>TILING COVERAGE.</em></h1>
    <p className="nw-lead">Based in Warrington, TileSPEC considers commercial tiling tenders across the UK. Explore regional coverage and individual commercial markets, with every project assessed against its scope and programme.</p>
    <div className="nw-hero-actions"><a className="nw-button nw-button-accent" href="#regions">EXPLORE REGIONS <ArrowUpRight size={18}/></a></div>
    <div className="nw-hero-foot">ONE HOME BASE · REGIONAL PROJECT COVERAGE</div>
   </div>
  </section>
  <section id="regions" className="nw-intro nw-space"><div className="nw-wrap">
   <div className="nw-kicker">REGIONAL COVERAGE</div><h2>FIND YOUR REGION.<br/><em>EXPLORE LOCAL MARKETS.</em></h2>
   <p style={{fontSize:17,lineHeight:1.75,maxWidth:900,margin:"18px 0 30px"}}>These are areas where we consider commercial tiling enquiries—not claims of local branches. Scope, labour, site logistics and programme are reviewed before any tender is accepted.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
    {regionalHubs.map(hub=><article key={hub.id} style={{background:"#102b38",color:"#fff",padding:"25px 23px",borderTop:"3px solid #86bfb6"}}>
      <h3 style={{fontFamily:"Barlow Condensed, sans-serif",fontSize:31,margin:"0 0 8px",lineHeight:1.1}}><Link href={"/"+hub.path} style={{color:"#fff",textDecoration:"none"}}>{hub.name} →</Link></h3>
      <p style={{color:"#d7e3e5",fontSize:15,lineHeight:1.6}}>{hub.intro}</p>
      <p style={{fontSize:13,color:"#a7ddd3",marginTop:14}}>{hub.ids.map(locationDisplayName).join(" · ")}</p>
    </article>)}
   </div>
  </div></section>
  <section className="nw-cta"><div className="nw-wrap nw-cta-inner"><div><div className="nw-kicker nw-kicker-light">TENDER & PROJECT ENQUIRIES</div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send your drawings, specification and programme. We'll review the tiling scope, location and working arrangements.</p></div>
   <div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link><a href="mailto:info@tilespec.uk">info@tilespec.uk</a></div>
  </div></section>
  <LandingFooter/>
 </main>;
}
