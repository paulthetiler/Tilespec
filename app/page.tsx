"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, FileUp, HardHat, Layers3, Mail, MapPin, Menu, MoveUpRight, Phone, Ruler, ShieldCheck, X } from "lucide-react";

const services = [
  { n: "01", title: "Commercial floor tiling", detail: "Large-format porcelain, high-traffic floors and expansive commercial installations.", icon: Ruler },
  { n: "02", title: "Wall tiling & finishes", detail: "Precisely detailed wall finishes for washrooms, circulation areas and public spaces.", icon: Layers3 },
  { n: "03", title: "Large-scale programmes", detail: "Sequenced delivery designed around live sites, other trades and demanding deadlines.", icon: HardHat },
  { n: "04", title: "Specialist preparation", detail: "Substrate assessment, levelling and preparation before the first tile is laid.", icon: ShieldCheck },
];
const sectors = ["Retail & showrooms", "Commercial developments", "Hospitality & leisure", "Public & communal spaces"];
const projects = [
  { label: "RETAIL & SHOWROOMS", title: "Floors that make an entrance", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85", position: "center" },
  { label: "COMMERCIAL INTERIORS", title: "Detail at every scale", image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85", position: "center" },
  { label: "HOSPITALITY & LEISURE", title: "Built for heavy use", image: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=85", position: "center" },
];

function Logo({ light = false }: { light?: boolean }) {
  return <a className={"brand" + (light ? " brand-light" : "")} href="#top" aria-label="TileSPEC home">
    <span className="brand-symbol"><span/><span/><span/></span>
    <span className="brand-type"><strong>Tile<span>SPEC</span></strong><small>COMMERCIAL TILING CONTRACTORS</small></span>
  </a>;
}

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", project: "", location: "", message: "" });
  function sendEnquiry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const subject = encodeURIComponent("TileSPEC tender enquiry — " + (form.project || form.company || form.name));
    const body = encodeURIComponent(["Name: " + form.name, "Company: " + form.company, "Email: " + form.email, "Project: " + form.project, "Location: " + form.location, "", form.message, "", "Please reply with instructions for securely sending tender drawings."].join("\n"));
    window.location.href = "mailto:info@resinspec.uk?subject=" + subject + "&body=" + body;
    setSent(true);
  }
  return <main id="top">
    <div className="topline"><span>COMMERCIAL TILING. CONSIDERED FROM EVERY ANGLE.</span><span className="topline-right"><MapPin size={13}/> NORTH WEST BASED · UK PROJECTS</span></div>
    <header className="site-header">
      <div className="shell nav"><Logo/><nav className={menu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
        <a href="#expertise" onClick={() => setMenu(false)}>Expertise</a><a href="#approach" onClick={() => setMenu(false)}>Our approach</a><a href="#projects" onClick={() => setMenu(false)}>Projects</a><a href="#about" onClick={() => setMenu(false)}>About</a>
        <a className="mobile-cta" href="#tender" onClick={() => setMenu(false)}>Discuss a project <ArrowUpRight size={16}/></a>
      </nav><a className="nav-cta" href="#tender">SEND AN ENQUIRY <ArrowUpRight size={17}/></a><button className="menu-button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div>
    </header>
    <section className="hero">
      <div className="hero-image" role="img" aria-label="Architectural interior with large-format tiled floor"/><div className="hero-grain"/>
      <div className="shell hero-content"><div className="eyebrow light"><span className="eyebrow-line"/> SPECIALIST COMMERCIAL TILING</div>
        <h1>PRECISION<br/>IN EVERY<br/><em>SQUARE METRE.</em></h1>
        <p>Commercial wall and floor tiling, delivered with the experience, discipline and attention to detail your project demands.</p>
        <div className="hero-actions"><a className="button button-teal" href="#tender">DISCUSS YOUR PROJECT <ArrowUpRight size={19}/></a><a className="text-link light-link" href="#expertise">EXPLORE OUR EXPERTISE <ArrowDown size={17}/></a></div>
      </div>
      <div className="hero-bottom shell"><span>BUILT ON OVER TWO DECADES OF HANDS-ON TILING EXPERIENCE</span><span>01 / 04 <span className="line-divider"/></span></div>
    </section>
    <section className="statement section-pad" id="about"><div className="shell statement-grid"><div><div className="eyebrow"><span className="eyebrow-line"/> WHO WE ARE</div><div className="vertical-rule"/></div><div><h2>NOT JUST A FINISH.<br/><span>A STANDARD.</span></h2><p>On commercial projects, the finish is only part of the job. Programme, preparation, coordination and consistency matter just as much. TileSPEC brings a practical, site-first mindset to commercial tiling — shaped by more than 20 years on the tools.</p><a className="underlined-link" href="#approach">THE WAY WE WORK <ArrowUpRight size={17}/></a></div></div></section>
    <section className="services section-pad" id="expertise"><div className="shell"><div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line"/> WHAT WE DO</div><h2>EXPERTISE THAT<br/><em>RUNS DEEP.</em></h2></div><p>From high-volume floor areas to exacting architectural details, we understand what successful commercial tiling takes.</p></div>
      <div className="service-grid">{services.map(s => <article className="service-card" key={s.n}><div className="service-top"><span>{s.n} / 04</span><s.icon size={30} strokeWidth={1.4}/></div><div><h3>{s.title}</h3><p>{s.detail}</p></div><ArrowUpRight className="service-arrow" size={22}/></article>)}</div>
    </div></section>
    <section className="image-break"><div className="image-break-photo"/><div className="image-break-content shell"><span className="eyebrow light"><span className="eyebrow-line"/> THE BIGGER PICTURE</span><h2>BUILT FOR THE<br/><em>REAL WORLD.</em></h2><p>Live sites. Tight programmes. Multiple trades. High expectations. We know the difference between a floor that looks right and a project delivered right.</p></div></section>
    <section className="approach section-pad" id="approach"><div className="shell"><div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line"/> HOW WE OPERATE</div><h2>GOOD WORK.<br/><em>NO GUESSWORK.</em></h2></div><p>Clear thinking before work starts. Practical communication while it happens. Attention to detail until the finish is right.</p></div>
      <div className="process-grid"><div><span>01</span><h3>Understand the brief</h3><p>Drawings, specifications, site conditions and programme reviewed before we price.</p></div><div><span>02</span><h3>Plan the installation</h3><p>Sequencing, access, preparation and interfaces considered before the first tile goes down.</p></div><div><span>03</span><h3>Deliver with discipline</h3><p>Consistent workmanship and straightforward site communication from start to finish.</p></div></div>
    </div></section>
    <section className="projects section-pad" id="projects"><div className="shell"><div className="section-head projects-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> OUR WORK</div><h2>SPACES THAT<br/><em>SET THE TONE.</em></h2></div><p>Built on real commercial tiling experience. Our historical project archive is being prepared for publication.</p></div>
      <div className="project-grid">{projects.map((p,i)=><article className={"project-card project-"+i} key={p.title}><div className="project-photo" style={{backgroundImage:"linear-gradient(180deg, transparent 35%, rgba(7,23,32,.82)), url('"+p.image+"')",backgroundPosition:p.position}}/><div className="project-copy"><span>{p.label}</span><h3>{p.title}</h3><ArrowUpRight size={23}/></div></article>)}</div>
      <p className="image-disclaimer">Illustrative architectural imagery. Verified TileSPEC project case studies and original archive photography coming soon.</p>
    </div></section>
    <section className="sectors section-pad"><div className="shell sectors-grid"><div><div className="eyebrow light"><span className="eyebrow-line"/> WHERE WE WORK</div><h2>THE RIGHT FIT<br/>FOR <em>YOUR SECTOR.</em></h2><p>Commercial spaces have different demands. We approach each one with the right questions, the right preparation and a clear understanding of the finish required.</p><a href="#tender" className="button button-outline">TALK TO US <ArrowUpRight size={17}/></a></div><div className="sector-list">{sectors.map((s,i)=><div key={s}><span>0{i+1}</span><strong>{s}</strong><MoveUpRight size={21}/></div>)}</div></div></section>
    <section className="tender section-pad" id="tender"><div className="shell tender-grid"><div className="tender-intro"><div className="eyebrow"><span className="eyebrow-line"/> LET'S TALK</div><h2>GOT A PROJECT<br/>IN <em>MIND?</em></h2><p>Whether you're pricing a tender or planning an upcoming scheme, tell us what you're working on. We'll start with the scope, programme and requirements.</p><div className="tender-details"><div><Mail size={18}/><span>ENQUIRIES VIA THE FORM</span></div><div><MapPin size={18}/><span>WARRINGTON · NORTH WEST · UK-WIDE ENQUIRIES</span></div></div><div className="tender-note"><FileUp size={22}/><span>Have drawings or a specification? Mention them in your enquiry and we'll arrange a secure way to receive them.</span></div></div>
      <form className="tender-form" onSubmit={sendEnquiry}><div className="form-label">START A CONVERSATION <span>01 — ENQUIRY</span></div><div className="form-row"><label>Your name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Full name"/></label><label>Company<input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Company name"/></label></div><div className="form-row"><label>Email address *<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@company.co.uk"/></label><label>Project location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Town / postcode"/></label></div><label>Project name / reference<input value={form.project} onChange={e=>setForm({...form,project:e.target.value})} placeholder="Project or tender reference"/></label><label>Tell us about the project *<textarea required rows={4} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Approximate area, tile specification, anticipated dates, tender deadline..."/></label><button type="submit" className="button button-dark">PREPARE EMAIL ENQUIRY <ArrowUpRight size={19}/></button><small>{sent ? "Your email app should open with your enquiry. Please press Send there to submit it." : "This opens your email app with a prepared message. No information is submitted until you send the email."}</small></form>
    </div></section>
    <footer><div className="shell"><div className="footer-main"><div><Logo light/><p>Specialist commercial tiling. Built on experience. Driven by detail.</p></div><div><span>EXPLORE</span><a href="#expertise">Expertise</a><a href="#approach">Our approach</a><a href="#projects">Projects</a><a href="#tender">Enquiries</a></div><div><span>RELATED BRAND</span><a href="https://resinspec.uk" target="_blank" rel="noopener noreferrer">ResinSpec Flooring <ArrowUpRight size={14}/></a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} TileSPEC. Commercial Tiling Contractors.</span><span>DESIGNED FOR THE DETAILS.</span><a href="#top">BACK TO TOP ↑</a></div></div></footer>
  </main>;
}
