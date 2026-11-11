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

// Distinct tender-facing explanations for each specialist service.
const serviceDetails: Record<keyof typeof services, {
  context: string;
  deliverables: [string, string][];
  tender: string[];
  boundaries: string;
  faq: [string, string][];
}> = {
  "commercial-floor-tiling": {
    "context": "Large-format porcelain, entrances, circulation routes and high-use commercial flooring need coordination between the finished tile layout and the construction beneath. A price per square metre cannot describe the whole risk: floor flatness, transitions, joints, access and sequencing can each change the installation method.",
    "deliverables": [
      [
        "Floor build-up and suitability",
        "Record the proposed substrate, level transitions, tile format and intended use. Confirm who provides test results and who authorises remedial works where backgrounds are not ready."
      ],
      [
        "Layout, joint and interface planning",
        "Agree datums, starting points, thresholds, columns, perimeter details and movement provision with the designer. Structural movement joints must not be casually bridged."
      ],
      [
        "Material and site coordination",
        "Review tile batches, delivery routes, storage, protection, adhesive and grout system compatibility and the readiness of adjacent trades."
      ],
      [
        "Inspection and completion",
        "Agree inspection points, finished-level requirements, access restrictions and protection of completed areas before handover."
      ]
    ],
    "tender": [
      "Current floor plans, setting-out drawings and finishes schedule",
      "Substrate type, screed or floor build-up and relevant survey results",
      "Tile dimensions, thickness, slip-resistance requirements and specified system",
      "Movement-joint design, thresholds, drainage and adjoining finishes",
      "Areas, phased access, working hours and target programme"
    ],
    "boundaries": "Screed corrections, moisture mitigation, additional movement-joint design, out-of-hours working and protection by other trades must be allocated clearly in the tender. They are not automatically included in a basic tiling rate.",
    "faq": [
      [
        "Can commercial floors be priced from drawings?",
        "Yes, for an initial tender review. Drawings, tile schedule, substrate information and programme allow us to identify assumptions and outstanding site checks."
      ],
      [
        "Do large-format tiles need different preparation?",
        "Often. The required flatness, handling and fixing system depend on the tile format and selected products, so we assess the actual specification and background."
      ],
      [
        "Who decides movement-joint positions?",
        "Joint provision should be designed or approved through the project's specification and design team. We coordinate the tiled layout with those agreed details rather than inventing them on site."
      ]
    ]
  },
  "commercial-wall-tiling": {
    "context": "Commercial washrooms, changing areas, reception features and hospitality interiors require more than a presentable wall finish. Background strength, moisture exposure, service penetrations, fixtures and maintenance expectations all affect the system and detailing.",
    "deliverables": [
      [
        "Wall background review",
        "Check the proposed wall construction, loading implications, existing coatings, flatness and fixing suitability. Agree boarding or other preparation before installation starts."
      ],
      [
        "Washroom and wet-area interfaces",
        "Coordinate waterproofing, wall-to-floor junctions, penetrations, trays, drains and sanitaryware with the specified system. Tiles and grout alone are not the waterproofing strategy."
      ],
      [
        "Set-out and finished details",
        "Confirm datum lines, tile orientation, feature locations, corners, trims, access panels and joints before fixing."
      ],
      [
        "Quality and handover",
        "Plan inspections before critical waterproofing work is covered and confirm finishing, sealing, snagging and protection responsibilities."
      ]
    ],
    "tender": [
      "Room elevations, sanitaryware layouts and finishes schedule",
      "Wall construction details, background condition and loading considerations",
      "Tile format, trims, joint widths and approved setting-out details",
      "Wet-area classification, waterproofing design and relevant manufacturer system",
      "Installation phasing, access, inspection and handover requirements"
    ],
    "boundaries": "Waterproofing design, structural upgrades, concealed defects, specialist niches or access panels and changes to sanitaryware layouts must be explicit in the specification and priced scope.",
    "faq": [
      [
        "Can washroom tiling include waterproofing?",
        "Yes, where included in the agreed package and a suitable system and design responsibility are established."
      ],
      [
        "Can you tile directly onto any existing plastered wall?",
        "Not automatically. The background must be assessed for suitability, strength, condition and the load and exposure of the specified tile system."
      ],
      [
        "How are fixtures and penetrations handled?",
        "We review the relevant drawings with the mechanical, plumbing and fit-out trades so waterproofing and finished tile interfaces are agreed before installation."
      ]
    ]
  },
  "commercial-tiling-packages": {
    "context": "A supply-and-install tiling package can reduce interface gaps for the main contractor, provided the scope is written clearly. Tile procurement, substrate readiness, installation, design clarifications and handover responsibilities need to be identified before the programme depends on them.",
    "deliverables": [
      [
        "Tender review and pricing assumptions",
        "Review drawings, specification, quantities, areas, access, phasing and tender clarifications. Record inclusions, provisional items and exclusions against the current document revisions."
      ],
      [
        "Procurement and logistics",
        "Identify tile selections, quantities, lead times, delivery restrictions, storage, waste routes and the party responsible for breakages and replacements."
      ],
      [
        "Preparation and installation",
        "Agree whether uplift, repairs, levelling, boarding, membranes, waterproofing and protection form part of the package. Sequence work by area with measurable handovers."
      ],
      [
        "Site reporting and completion",
        "Define progress reporting, variations approval, inspection records, snagging, protection and final sign-off requirements."
      ]
    ],
    "tender": [
      "Tender return date, project address and principal contractor contact",
      "Drawings, specifications, finish schedules and pricing or bill-of-quantities documents",
      "Responsibility matrix for tiles, preparation, waterproofing and associated trades",
      "Programme milestones, access arrangements, productivity and phasing assumptions",
      "Proposed payment terms, retention provisions and variation approval process"
    ],
    "boundaries": "A single specialist package is not an unlimited all-risks allowance. Design responsibility, unknown substrates, programme acceleration, standby, rework caused by other trades and late specification changes require explicit agreement.",
    "faq": [
      [
        "Do you provide tiles as well as labour?",
        "We can consider a joined-up procurement, preparation and installation package where the selections and commercial terms are agreed."
      ],
      [
        "Can you work to a main contractor programme?",
        "Yes, subject to a workable sequence, suitable handover of areas, material availability and agreed site resources."
      ],
      [
        "How should variations be managed?",
        "Changed drawings, unknown conditions and additional works should be raised and approved through the project's agreed variation procedure before proceeding."
      ]
    ]
  },
  "commercial-substrate-preparation": {
    "context": "Preparation often decides whether a commercial tiled finish performs as specified. A floor can look sound but still have unsuitable moisture conditions, contamination, movement, inadequate flatness or poorly coordinated interfaces.",
    "deliverables": [
      [
        "Existing-condition survey",
        "Identify concrete, screed, existing coverings, timber-based systems or wall backgrounds. Record cracking, contamination, hollowness, movement, levels and relevant exposure."
      ],
      [
        "Testing and design responsibilities",
        "Confirm the party responsible for moisture testing, strength checks, movement assessment and any necessary design approvals. Test and acceptance methods depend on the selected installation system."
      ],
      [
        "Preparation system selection",
        "Review removal, mechanical preparation, repairs, levelling, compatible boards, decoupling or waterproofing according to the approved build-up and manufacturer instructions."
      ],
      [
        "Curing and area handover",
        "Allow for product-specific curing, protection, inspection and subsequent trade access. Document acceptance of each area before the tiling programme begins."
      ]
    ],
    "tender": [
      "Existing floor or wall build-up details and recent condition reports",
      "Level surveys, flatness requirements and finished floor level constraints",
      "Available moisture and strength test results, including responsibility for further tests",
      "Tile specification and compatible preparation system requirements",
      "Access for uplift, grinding, dust controls, waste disposal and curing time"
    ],
    "boundaries": "A site survey cannot guarantee that concealed defects will not be found. Moisture remediation, structural repairs and design changes need separate approval where outside the agreed preparation scope.",
    "faq": [
      [
        "Can self-levelling compound correct every uneven commercial floor?",
        "No. Depth, background strength, contamination, movement, moisture conditions and finished levels determine whether a levelling product is appropriate."
      ],
      [
        "Is substrate moisture testing part of the tiler's work?",
        "Responsibility must be agreed in the contract. The required test method and acceptance criteria depend on the substrate and chosen system."
      ],
      [
        "Can tiling start immediately after levelling?",
        "Only when the product's specified curing and readiness conditions have been met, along with any relevant moisture and site requirements."
      ]
    ]
  },
};

const relatedGuides: Record<keyof typeof services, {slug:string; title:string}[]> = {
  "commercial-floor-tiling": [
    {slug:"large-format-porcelain-commercial-floors",title:"Planning large-format porcelain floors"},
    {slug:"movement-joints-and-setting-out",title:"Movement joints and setting-out"},
    {slug:"commercial-tiling-programme-and-phasing",title:"Planning commercial tiling programmes"}
  ],
  "commercial-wall-tiling": [
    {slug:"commercial-washroom-tiling-specification",title:"Commercial washroom specification and interfaces"},
    {slug:"waterproofing-and-wet-areas",title:"Waterproofing and commercial wet areas"},
    {slug:"substrate-readiness",title:"Preparing suitable backgrounds"}
  ],
  "commercial-tiling-packages": [
    {slug:"commercial-tiling-tender-checklist",title:"Commercial tiling tender checklist"},
    {slug:"commercial-tiling-programme-and-phasing",title:"Programmes, phasing and site coordination"},
    {slug:"commercial-floor-moisture-and-levelling",title:"Moisture and levelling before tiling"}
  ],
  "commercial-substrate-preparation": [
    {slug:"commercial-floor-moisture-and-levelling",title:"Moisture and levelling checks"},
    {slug:"substrate-readiness",title:"Substrate readiness checklist"},
    {slug:"large-format-porcelain-commercial-floors",title:"Preparing for large-format porcelain"}
  ]
};

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
  const deepDive = serviceDetails[service as ServiceSlug];
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
    <section className="nw-intro nw-space" aria-labelledby="service-delivery">
      <div className="nw-wrap" style={{maxWidth:1100}}>
        <div className="nw-kicker">BEYOND THE TILE RATE</div>
        <h2 id="service-delivery">WHAT THE PROJECT<br/><em>NEEDS TO ALLOW FOR.</em></h2>
        <p style={{fontSize:18,lineHeight:1.85,maxWidth:920,marginTop:24}}>{deepDive.context}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(265px,1fr))",gap:24,marginTop:40}}>
          {deepDive.deliverables.map(([title,copy],index)=><article key={title} style={{padding:"25px 24px",border:"1px solid #cdd7da",borderTop:"3px solid #427c79"}}>
            <span className="nw-kicker">0{index+1} / DELIVERY CONSIDERATION</span>
            <h3 style={{fontSize:25,lineHeight:1.2,margin:"16px 0 10px"}}>{title}</h3>
            <p style={{lineHeight:1.75}}>{copy}</p>
          </article>)}
        </div>
      </div>
    </section>
    <section className="nw-approach nw-space" aria-labelledby="tender-documents">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">FOR ESTIMATORS & CONTRACTS MANAGERS</div><h2 id="tender-documents">WHAT TO SEND<br/><em>WITH YOUR TENDER.</em></h2><p style={{maxWidth:500,lineHeight:1.75}}>The more complete the information, the fewer unresolved assumptions in the proposed tiling scope. Drawings and documents can be included through our <Link href="/contact">secure enquiry form</Link>.</p></div>
        <div>
          <ul style={{paddingLeft:22,lineHeight:1.9,fontSize:16}}>
            {deepDive.tender.map(item=><li key={item} style={{paddingBottom:10}}>{item}</li>)}
          </ul>
          <h3 style={{fontSize:23,margin:"28px 0 8px"}}>Scope boundaries and variations</h3>
          <p style={{lineHeight:1.75}}>{deepDive.boundaries}</p>
        </div>
      </div>
    </section>
    <section className="nw-faq nw-space" aria-labelledby="service-faq">
      <div className="nw-wrap nw-two-col">
        <div><div className="nw-kicker">COMMON TENDER QUESTIONS</div><h2 id="service-faq">THE PRACTICAL<br/><em>DETAILS.</em></h2></div>
        <div className="nw-faq-list">
          {deepDive.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </div>
    </section>
    <section className="nw-intro nw-space"><div className="nw-wrap">
      <div className="nw-kicker">MORE TILESPEC SERVICES</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:18,marginTop:18}}>
        {Object.entries(services).filter(([slug]) => slug !== service).map(([slug, item]) =>
          <Link key={slug} href={`/services/${slug}`} style={{color:"inherit",fontWeight:700,textDecoration:"underline"}}>{item.title}</Link>)}
      </div>
      <div style={{marginTop:32}}>
        <div className="nw-kicker">RELATED TECHNICAL READING</div>
        <h3 style={{fontSize:26,margin:"10px 0 16px"}}>Plan the tiling package with confidence.</h3>
        <nav aria-label="Related technical guidance" style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {relatedGuides[service as ServiceSlug].map(guide => <Link href={`/guides/${guide.slug}`} key={guide.slug} style={{textDecoration:"underline",textUnderlineOffset:4}}>{guide.title} →</Link>)}
        </nav>
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
