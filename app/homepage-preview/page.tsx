"use client";
import { useState } from "react";
import { ArrowUpRight, Building2, Layers3, HardHat, CalendarCheck2, Menu, X } from "lucide-react";

const images = {
  hero: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000009748824390831e6b533c9672.png",
  floor: "https://o2cm9cmazm2kibri.public.blob.vercel-storage.com/image-hub/bf52c74c-59fe-4cdd-9a44-4bfcad5063c4/73281.webp",
  retail: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000003b8c82108173987758914799.png",
  interior: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_00000000864c81f48bb8e9fdca1728c9.png",
  leisure: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000006d2481f4aad27dd9a1e60776.png"
};
const work = [
  {name:"Commercial floor tiling",sub:"Large-format porcelain · High-traffic spaces",image:images.floor},
  {name:"Retail & showrooms",sub:"Floor finishes · Detailed setting-out",image:images.retail},
  {name:"Commercial interiors",sub:"Walls · Floors · Finishing details",image:images.interior},
  {name:"Hospitality & leisure",sub:"Durable finishes · Specialist installation",image:images.leisure}
];
export default function HomepagePreview(){
  const [open,setOpen]=useState(false);
  return <div className="ts-minimal">
    <div className="ts-preview-flag">HOMEPAGE CONCEPT — PREVIEW ONLY · NOT LIVE</div>
    <header className="ts-head"><a href="/homepage-preview" aria-label="TileSpec homepage"><img src="/tilespec-logo-animated.svg" alt="TileSpec Commercial Tiling"/></a>
      <nav className={open?"ts-nav open":"ts-nav"} aria-label="Preview navigation">
        <a href="#work" onClick={()=>setOpen(false)}>Projects</a><a href="#expertise" onClick={()=>setOpen(false)}>Expertise</a><a href="#about" onClick={()=>setOpen(false)}>About</a><a href="/contact">Contact</a>
      </nav>
      <a className="ts-head-cta" href="/contact">Discuss a project <ArrowUpRight size={17}/></a>
      <button className="ts-menu" aria-label={open?"Close navigation":"Open navigation"} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
    </header>
    <section className="ts-hero" style={{backgroundImage:`linear-gradient(90deg,rgba(7,29,42,.88) 0%,rgba(7,29,42,.65) 39%,rgba(7,29,42,.18) 75%,rgba(7,29,42,.04) 100%),url("${images.hero}")`}}>
      <div className="ts-hero-inner"><span className="ts-kicker">SPECIALIST COMMERCIAL WALL & FLOOR TILING</span><h1>Complete Commercial<br/>Tiling Packages.</h1><p>Tile supply. Substrate preparation. Expert installation.</p><div className="ts-hero-links"><a href="#work" className="ts-primary">View our work <ArrowUpRight size={18}/></a><a href="/contact" className="ts-secondary">Discuss a project <ArrowUpRight size={18}/></a></div></div>
      <span className="ts-hero-foot">NORTH WEST BASED · PROJECTS ACROSS THE UK</span>
    </section>
    <section className="ts-proof-strip" aria-label="TileSpec commercial capabilities"><div className="ts-proof-inner">
      <div className="ts-proof-item"><Building2 aria-hidden="true" strokeWidth={1.6}/><strong>Commercial Projects</strong></div>
      <div className="ts-proof-item"><Layers3 aria-hidden="true" strokeWidth={1.6}/><strong>Full Turnkey Packages</strong></div>
      <div className="ts-proof-item"><HardHat aria-hidden="true" strokeWidth={1.6}/><strong>Experienced Teams</strong></div>
      <div className="ts-proof-item"><CalendarCheck2 aria-hidden="true" strokeWidth={1.6}/><strong>Delivered on Programme</strong></div>
    </div></section>
    <section className="ts-intro" id="about"><div className="ts-inner"><span className="ts-small">THE SPECIALIST PACKAGE</span><h2>Complete responsibility.<br/><em>From preparation to handover.</em></h2><p>Commercial wall and floor tiling for contractors and developers. We coordinate tile supply, preparation and installation as one complete package.</p></div></section>
    <section className="ts-work" id="work"><div className="ts-inner"><div className="ts-section-head"><div><span className="ts-small">SELECTED WORK PHOTOGRAPHY</span><h2>The work speaks<br/>for itself.</h2></div><a href="/contact">Enquire about a project <ArrowUpRight size={17}/></a></div><div className="ts-work-grid">{work.map((p,i)=><article className={i===0?"ts-project ts-project-wide":"ts-project"} key={p.name}><img src={p.image} alt={p.name} loading="lazy"/><div className="ts-project-copy"><h3>{p.name}</h3><span>{p.sub}</span></div></article>)}</div><p className="ts-photo-note">Photographs illustrate tiling workmanship and sectors; project titles are descriptive, not claims of direct TileSpec contracts.</p></div></section>
    <section className="ts-expertise" id="expertise"><div className="ts-inner"><span className="ts-small">WHAT WE DO</span><div className="ts-expertise-row"><h2>Complete tiling<br/>packages.</h2><p>Floor and wall tiling, substrate preparation, levelling, waterproofing and tile procurement — planned around the site programme.</p></div><div className="ts-services"><span>01 <b>Supply</b></span><span>02 <b>Preparation</b></span><span>03 <b>Installation</b></span><span>04 <b>Handover</b></span></div></div></section>
    <section className="ts-contact"><div className="ts-inner"><span className="ts-small">LET'S TALK</span><h2>Have a project<br/>in mind?</h2><a href="/contact">Discuss your project <ArrowUpRight size={20}/></a></div></section>
    <footer className="ts-footer"><span>© {new Date().getFullYear()} TileSpec · Commercial Tiling</span><span>0333 339 3445 · info@tilespec.uk</span><a href="/">Current website</a></footer>
    <style jsx global>{`
      .ts-minimal{background:#fff;color:#162936;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
      .ts-minimal *{box-sizing:border-box}.ts-minimal a{text-decoration:none;color:inherit}.ts-minimal h1,.ts-minimal h2,.ts-minimal h3,.ts-minimal p{margin:0}
      .ts-preview-flag{background:#0f2935;color:#fff;text-align:center;padding:9px 16px;font-size:10px;letter-spacing:.17em;font-weight:700}
      .ts-head{height:90px;padding:0 5%;display:flex;align-items:center;justify-content:space-between;gap:28px;background:#fff}
      .ts-head>a:first-child{display:block;flex:none}.ts-head img{width:215px;height:auto;display:block}
      .ts-nav{display:flex;gap:36px;margin-left:auto}.ts-nav a{font-size:13px;font-weight:600}.ts-nav a:hover{color:#438b83}
      .ts-head-cta{display:flex;gap:13px;align-items:center;background:#0f2935;color:#fff!important;padding:16px 19px;font-size:12px;font-weight:700}
      .ts-menu{display:none;border:0;background:transparent}
      .ts-hero{height:690px;min-height:550px;background-size:cover;background-position:center;position:relative;color:#fff;display:flex;align-items:center}
      .ts-hero-inner{width:min(1240px,90%);margin:auto}.ts-kicker,.ts-small{font-size:11px;letter-spacing:.22em;font-weight:700}
      .ts-hero h1{text-shadow:0 2px 28px rgba(0,0,0,.24);font-size:clamp(48px,5.8vw,91px);line-height:1.06;letter-spacing:-.055em;margin:24px 0 22px;max-width:1100px;font-weight:700}
      .ts-hero p{color:#e1edee;font-size:19px;letter-spacing:.15em}.ts-hero-links{display:flex;gap:12px;margin-top:42px;flex-wrap:wrap}
      .ts-primary,.ts-secondary{display:flex;align-items:center;gap:24px;padding:18px 22px;font-size:13px;font-weight:700}
      .ts-primary{background:#7fb8b0;color:#fff!important}.ts-secondary{border:1px solid #fff;color:#fff!important}
      .ts-hero-foot{position:absolute;bottom:25px;left:5%;font-size:10px;letter-spacing:.17em;font-weight:700}
      .ts-proof-strip{background:#fff;border-bottom:1px solid #e3e9eb}
      .ts-proof-inner{width:min(1240px,90%);margin:auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:36px 0}
      .ts-proof-item{display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 20px;border-right:1px solid #dce5e8}
      .ts-proof-item:last-child{border-right:0}
      .ts-proof-item svg{height:33px;width:33px;flex:none;color:#438b83}
      .ts-proof-item strong{font-size:14px;line-height:1.3;font-weight:700;white-space:nowrap}
      .ts-inner{width:min(1240px,90%);margin:auto}.ts-intro{padding:130px 0 140px;text-align:center}
      .ts-intro h2{font-size:clamp(45px,5vw,78px);letter-spacing:-.05em;line-height:1.12;margin:26px 0}.ts-intro h2 em{font-style:normal;color:#8a9aa2}
      .ts-intro p{font-size:17px;color:#65757d;line-height:1.85;max-width:670px;margin:auto}
      .ts-work{background:#f5f6f6;padding:110px 0 115px}.ts-section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:43px}
      .ts-section-head h2,.ts-expertise h2,.ts-contact h2{font-size:clamp(50px,5.5vw,85px);letter-spacing:-.05em;line-height:1.04;margin-top:20px}
      .ts-section-head>a{font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;padding-bottom:10px}
      .ts-work-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}.ts-project{background:#fff;overflow:hidden}.ts-project-wide{grid-column:span 2}
      .ts-project img{display:block;width:100%;height:360px;object-fit:cover}.ts-project-wide img{height:540px}
      .ts-project-copy{padding:22px 4px 28px}.ts-project h3{font-size:22px;letter-spacing:-.03em;margin-bottom:7px}.ts-project-copy span{font-size:13px;color:#71828a}
      .ts-photo-note{font-size:11px;color:#7c8a90;line-height:1.5;margin-top:18px!important}
      .ts-expertise{padding:120px 0}.ts-expertise-row{display:flex;justify-content:space-between;align-items:end;gap:55px}.ts-expertise-row p{max-width:400px;font-size:17px;line-height:1.8;color:#65757d}
      .ts-services{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:80px}.ts-services span{border-top:1px solid #b9c6ca;padding-top:18px;font-size:11px;color:#789098}.ts-services b{display:block;font-size:21px;color:#162936;margin-top:22px}
      .ts-contact{background:#0f2a3a;color:#fff;padding:110px 0 125px}.ts-contact h2{margin:23px 0 35px}.ts-contact a{display:inline-flex;gap:25px;align-items:center;background:#0879bf;padding:20px 25px;font-size:14px;font-weight:700}
      .ts-footer{background:#081d27;color:#b6c5cb;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:30px 5%;font-size:12px}
      @media(max-width:760px){.ts-head{height:72px;padding:0 5%}.ts-head img{width:175px}.ts-head-cta{display:none}.ts-menu{display:block}.ts-nav{display:none;position:absolute;z-index:40;top:111px;left:0;right:0;background:#fff;flex-direction:column;gap:0;padding:15px 5%;box-shadow:0 15px 25px #0002}.ts-nav.open{display:flex}.ts-nav a{padding:15px 0;border-bottom:1px solid #eee}
      .ts-proof-inner{grid-template-columns:repeat(2,minmax(0,1fr));padding:17px 0}
      .ts-proof-item{justify-content:flex-start;padding:17px 10px;gap:10px}
      .ts-proof-item:nth-child(2){border-right:0}
      .ts-proof-item:nth-child(-n+2){border-bottom:1px solid #dce5e8}
      .ts-proof-item svg{width:25px;height:25px}
      .ts-proof-item strong{font-size:11px;white-space:normal}
      .ts-hero{height:650px;background-position:57% center}.ts-hero h1{font-size:clamp(43px,9.4vw,70px)}.ts-hero p{font-size:14px}.ts-hero-links{margin-top:30px}.ts-hero-foot{font-size:8px}
      .ts-intro{padding:85px 0}.ts-intro p{font-size:15px}.ts-work{padding:75px 0}.ts-section-head{display:block}.ts-section-head>a{margin-top:20px}
      .ts-work-grid{grid-template-columns:1fr;gap:20px}.ts-project-wide{grid-column:auto}.ts-project img,.ts-project-wide img{height:300px}.ts-project-copy{padding:18px 0 23px}
      .ts-expertise{padding:85px 0}.ts-expertise-row{display:block}.ts-expertise-row p{margin-top:25px}.ts-services{grid-template-columns:1fr 1fr;margin-top:50px}
      .ts-contact{padding:85px 0}.ts-footer{flex-direction:column}
      }`}
    </style>
  </div>;
}
