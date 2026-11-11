import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import LandingFooter from "../../components/landing-footer";
import { guides } from "../../lib/technical-guides";
import "../north-west-commercial-tiling/north-west.css";

export const metadata: Metadata = {
  title: "Commercial Tiling Technical Guidance | TileSPEC",
  description: "Practical technical considerations for commercial substrate readiness, movement joints, setting-out and wet-area tiling.",
  alternates: { canonical: "https://www.tilespec.uk/guides" },
};
export default function GuidesPage() {
  return <main className="nw-page" id="top">
    <header className="nw-header"><div className="nw-wrap nw-header-row">
      <Link className="nw-brand" href="/"><img src="/tilespec-logo-animated.svg" width={230} height={62} alt="TileSPEC"/></Link>
      <nav className="nw-nav"><Link href="/">Home</Link><Link href="/coverage">Coverage</Link><Link href="/contact">Contact</Link></nav>
      <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
    </div></header>
    <section className="nw-hero"><div className="nw-hero-photo" role="img" aria-label="Commercial tiled interior"/>
      <div className="nw-wrap nw-hero-content"><div className="nw-eyebrow"><span/> TILESPEC TECHNICAL RESOURCES</div>
        <h1>TECHNICAL<br/><em>GUIDANCE.</em></h1>
        <p className="nw-lead">Practical considerations for commercial tiling packages, from substrate handover to movement detailing and wet-area coordination.</p>
      </div>
    </section>
    <section className="nw-intro nw-space"><div className="nw-wrap">
      <div className="nw-kicker">PROJECT PLANNING</div>
      <h2>BEFORE THE<br/><em>FIRST TILE.</em></h2>
      <p style={{maxWidth:850,margin:"18px 0 34px",lineHeight:1.8}}>These articles highlight the questions worth settling before work begins. They are general guidance, not a substitute for project-specific design, current standards or manufacturer instructions.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:20}}>
        {Object.entries(guides).map(([slug,guide])=><article key={slug} style={{border:"1px solid #cbd5d8",padding:26}}>
          <h3 style={{fontSize:24,lineHeight:1.2,margin:"0 0 15px"}}><Link href={`/guides/${slug}`} style={{color:"inherit"}}>{guide.title}</Link></h3>
          <p style={{lineHeight:1.7}}>{guide.description}</p>
          <p style={{marginTop:20}}><Link href={`/guides/${slug}`}>Read guidance <ArrowUpRight size={16} style={{display:"inline",verticalAlign:"middle"}}/></Link></p>
        </article>)}
      </div>
    </div></section>
    <section className="nw-cta"><div className="nw-wrap nw-cta-inner"><div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Send the drawings, finishes schedule and programme for review.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link></div></div></section>
    <LandingFooter/>
  </main>;
}
