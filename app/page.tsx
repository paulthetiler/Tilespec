"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Building2, CalendarCheck2, Check, ChevronDown, FileUp, HardHat, Layers3, Mail, MapPin, Menu, MoveUpRight, Phone, Ruler, ShieldCheck, X } from "lucide-react";

const services = [
  { title: "Commercial floor tiling", detail: "High-traffic commercial floors, large-format porcelain and detailed setting-out, delivered over properly prepared substrates.", icon: Ruler, image: "https://o2cm9cmazm2kibri.public.blob.vercel-storage.com/image-hub/bf52c74c-59fe-4cdd-9a44-4bfcad5063c4/73281.webp" },
  { title: "Wall tiling & finishes", detail: "Commercial wall finishes with careful setting-out, suitable backgrounds and consistent detailing in washrooms and public spaces.", icon: Layers3, image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_00000000864c81f48bb8e9fdca1728c9.png" },
  { title: "Complete tiling packages", detail: "Tile procurement, substrate preparation, installation and handover coordinated under one specialist package.", icon: HardHat, image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_00000000a4ec82468ee6377d39b40b05.png" },
  { title: "Specialist preparation", detail: "Floor preparation, adhesive removal, repairs, levelling, screeding, boarding and waterproofing where specified.", icon: ShieldCheck, image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_00000000ad5081f4817988f4d69fb73f.png" },
];
const sectors = ["Retail & showrooms", "Commercial developments", "Hospitality & leisure", "Public & communal spaces"];
const projects = [
  { label: "COMMERCIAL FLOOR TILING", title: "Large-scale commercial floor installation", image: "https://o2cm9cmazm2kibri.public.blob.vercel-storage.com/image-hub/bf52c74c-59fe-4cdd-9a44-4bfcad5063c4/73281.webp", position: "center" },
  { label: "RETAIL & SHOWROOMS", title: "Floors that make an entrance", image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000003b8c82108173987758914799.png", position: "center" },
  { label: "COMMERCIAL INTERIORS", title: "Detail at every scale", image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_00000000864c81f48bb8e9fdca1728c9.png", position: "center" },
  { label: "HOSPITALITY & LEISURE", title: "Built for heavy use", image: "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000006d2481f4aad27dd9a1e60776.png", position: "center" },
];


function Logo({ light = false }: { light?: boolean }) {
  return <a className={"brand brand-svg" + (light ? " brand-light" : "")} href="#top" aria-label="TileSPEC home">
    <img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width="280" height="75" />
  </a>;
}

export default function Home() {
  const [menu, setMenu] = useState(false);


  return <main id="top">
    <header className="site-header">
      <div className="shell nav"><Logo/><nav className={menu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
        <a href="#expertise" onClick={() => setMenu(false)}>Expertise</a><a href="#approach" onClick={() => setMenu(false)}>Our approach</a><a href="#projects" onClick={() => setMenu(false)}>Projects</a><a href="#about" onClick={() => setMenu(false)}>About</a>
        <a className="mobile-cta" href="/contact" onClick={() => setMenu(false)}>Discuss a project <ArrowUpRight size={16}/></a>
      </nav><a className="nav-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={17}/></a><button className="menu-button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div>
    </header>
    <link rel="preload" as="image" href="https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000009748824390831e6b533c9672.png" fetchPriority="high" />
    <section className="hero">
      <div className="hero-image" role="img" aria-label="Architectural interior with large-format tiled floor"/><div className="hero-grain"/>
      <div className="shell hero-content"><div className="eyebrow light"><span className="eyebrow-line"/> SPECIALIST COMMERCIAL TILING</div>
        <h1>COMMERCIAL<br/>WALL & FLOOR<br/><em>TILING.</em></h1>
        <p>Complete commercial tiling packages for main contractors and developers. One specialist contractor for tile supply, substrate preparation, installation and handover.</p>
        <div className="hero-actions"><a className="button button-teal" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={19}/></a><a className="text-link light-link" href="#expertise">Explore OUR EXPERTISE <ArrowDown size={17}/></a></div>
        <a href="tel:+443333393445" aria-label="Call TileSPEC on 0333 339 3445" style={{display:"inline-flex",alignItems:"center",gap:"12px",marginTop:"24px",paddingTop:"18px",borderTop:"1px solid rgba(255,255,255,.3)",color:"#fff",textDecoration:"none"}}><Phone size={21} color="#83BDB5"/><span style={{display:"flex",flexDirection:"column",gap:"3px"}}><span style={{fontSize:"11px",letterSpacing:"1.5px",color:"#B9C8CE"}}>PREFER TO SPEAK TO US?</span><strong style={{fontSize:"clamp(18px, 3vw, 23px)",letterSpacing:".5px"}}>0333 339 3445</strong></span></a>
        <p className="hero-mobile-experience">BUILT ON OVER TWO DECADES OF HANDS-ON TILING EXPERIENCE</p>
      </div>
      <div className="hero-bottom shell"><span>BUILT ON OVER TWO DECADES OF HANDS-ON TILING EXPERIENCE</span></div>
    </section>
    <section className="ts-live-proof" aria-label="TileSpec commercial capabilities"><div className="shell ts-live-proof-inner">
      <div className="ts-live-proof-item"><Building2 aria-hidden="true" strokeWidth={1.6}/><strong>Commercial Projects</strong></div>
      <div className="ts-live-proof-item"><Layers3 aria-hidden="true" strokeWidth={1.6}/><strong>Supply &amp; Installation</strong></div>
      <div className="ts-live-proof-item"><HardHat aria-hidden="true" strokeWidth={1.6}/><strong>Experienced Teams</strong></div>
      <div className="ts-live-proof-item"><CalendarCheck2 aria-hidden="true" strokeWidth={1.6}/><strong>Delivered on Programme</strong></div>
    </div></section>
    <section className="ts-live-intro" id="about"><div className="shell ts-live-intro-inner"><span className="ts-live-intro-kicker">The specialist package</span><h2>From preparation<br/><em>to the finishing detail.</em></h2><p>Commercial wall and floor tiling for contractors and developers. We coordinate tile supply, preparation and installation as one complete package.</p></div></section>
    <section className="services ts-photo-services section-pad" id="expertise"><div className="shell"><div className="ts-photo-services-heading"><h2>Specialist<br/><span>tiling services.</span></h2></div>
      <div className="ts-photo-services-grid">{services.map(s => <article className="ts-photo-service" key={s.title}><img src={s.image} alt="" loading="lazy"/><div className="ts-photo-service-label"><h3>{s.title}</h3></div></article>)}</div>
    </div></section>
    <section className="full-package"><div className="shell full-package-card"><div className="full-package-kicker">Complete tiling package</div><div className="full-package-copy"><h2>From uplift<br/><em>to finished<br/>floor.</em></h2><p>From existing floor uplift and mechanical adhesive removal to repairs, screeding, levelling and tile supply, TileSPEC can manage the full preparation and installation scope. One contractor, clear responsibility and a finished installation ready for handover.</p></div><div className="full-package-flow full-package-tagline">One contractor. Complete delivery.</div></div></section>
    <section className="approach section-pad" id="approach"><div className="shell"><div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line"/> How we operate</div><h2>How we<br/><em>work.</em></h2></div><p>We establish substrate requirements, agree a clear scope and plan procurement, preparation and installation around the site programme.</p></div>
      <div className="process-grid"><div><h3>Understand the scope</h3><p>Drawings, specifications, site conditions and programme reviewed before we price.</p></div><div><h3>Plan the installation</h3><p>Sequencing, access, preparation and interfaces considered before the first tile goes down.</p></div><div><h3>Site management & supervision</h3><p>Site supervisors oversee installation, coordinate operatives and other trades, monitor progress and carry out quality checks throughout the project.</p></div><div><h3>Installation & handover</h3><p>Installation to the agreed specification, quality checks and clear communication through to handover.</p></div></div>
    </div></section>
    <section className="projects section-pad" id="projects"><div className="shell"><div className="section-head projects-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> Our work</div><h2>Project<br/><em>photography.</em></h2></div></div>
      <div className="project-grid">{projects.map((p,i)=><article className={"project-card project-"+i} key={p.title}><div className="project-photo" style={{backgroundImage:"linear-gradient(180deg, transparent 35%, rgba(7,23,32,.82)), url('"+p.image+"')",backgroundPosition:p.position}}/><div className="project-copy"><span>{p.label}</span><h3>{p.title}</h3><ArrowUpRight size={23}/></div></article>)}</div>
      
    </div></section>
    <section className="sectors section-pad"><div className="shell sectors-grid"><div><div className="eyebrow light"><span className="eyebrow-line"/> Where we work</div><h2>Sectors<br/><em>we work in.</em></h2><p>Commercial tiling for retail, hospitality, developments and shared public spaces.</p><a href="/contact" className="button button-outline">Discuss a project <ArrowUpRight size={17}/></a></div><div className="sector-list">{sectors.map((s,i)=><div key={s}><strong>{s}</strong><MoveUpRight size={21}/></div>)}</div></div></section>
    <section className="tender section-pad" id="tender"><div className="shell tender-grid"><div className="tender-intro"><h2>Let’s talk.</h2><div className="tender-details"><div><Phone size={18}/><a href="tel:+443333393445">0333 339 3445</a><a href="mailto:info@tilespec.uk">info@tilespec.uk</a></div><div><MapPin size={18}/><span>Rutherford House, Warrington Road, Birchwood Park, Warrington, WA3 6ZH</span></div></div></div><div className="homepage-contact-choices"><a href="/contact?type=tender" className="homepage-contact-choice"><FileUp size={26}/><span><strong>Send us a tender</strong><small>Drawings, specifications and pricing schedules. Upload documents securely.</small></span><ArrowUpRight size={21}/></a><a href="/contact?type=general" className="homepage-contact-choice"><Mail size={26}/><span><strong>General enquiry</strong><small>Ask a question or discuss an upcoming project.</small></span><ArrowUpRight size={21}/></a></div></div></section>
    <footer><div className="shell"><div className="footer-main"><div><Logo light/><p>Commercial wall and floor tiling packages for contractors and businesses.</p></div><div><span>Explore</span><a href="#expertise">Expertise</a><a href="#approach">Our approach</a><a href="#projects">Projects</a><a href="/contact">Enquiries</a></div><div><span>Contact</span><a href="tel:+443333393445">0333 339 3445</a><a href="mailto:info@tilespec.uk">info@tilespec.uk</a><a href="/privacy">Privacy policy</a><span style={{display:"block",marginTop:"12px"}}>Address</span><address style={{fontStyle:"normal",lineHeight:1.7}}>Rutherford House, Warrington Road, Birchwood Park, Warrington, WA3 6ZH</address></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} TileSPEC. Commercial Tiling Contractors.</span><span>COMMERCIAL WALL & FLOOR TILING.</span><a href="#top">BACK TO TOP ↑</a></div></div></footer>
  </main>;
}
