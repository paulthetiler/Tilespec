import type { SeoPage } from "./types";

const blob = "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/";
const relationships = { children: [], relatedServices: [], relatedIndustries: [], relatedLocations: [] };

export const commercialTiling: SeoPage = {
  ...relationships,
  path: "/commercial-tiling", category: "national", parent: "/",
  title: "Commercial Tiling Contractors | UK Project Enquiries | TileSPEC",
  description: "Commercial floor and wall tiling, preparation and complete packages. Warrington-based TileSPEC welcomes suitable projects across the North West and nationwide.",
  h1: "Commercial tiling contractors.",
  intent: "Assess a commercial tiling contractor for a defined UK project, including scope, preparation and programme requirements.",
  intro: "A commercial tiling package starts with the site, the specification and the programme. TileSPEC brings floor and wall installation together with the preparation and coordination needed to deliver the agreed scope. Based in Warrington, we welcome North West enquiries and suitable commercial projects nationwide.",
  publicationStatus: "review", indexingStatus: "noindex",
  images: [
    { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative architectural interior with a large-format tiled floor", role: "hero", provenance: "illustrative" },
    { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative commercial interior showing an expansive tiled floor", role: "supporting", provenance: "illustrative" },
  ],
  sections: [
    { id: "floor-tiling", heading: "Commercial floor tiling", paragraphs: ["Porcelain and other specified tile finishes for circulation areas, retail floors, showrooms and shared spaces. We review tile format, setting out, floor levels and interfaces with adjoining finishes before installation. Slip resistance and other performance requirements need to be specified for the intended use; the tile finish alone does not resolve every site condition."], links: [{ href: "/#expertise", label: "Our floor tiling expertise" }] },
    { id: "wall-tiling", heading: "Commercial wall tiling", paragraphs: ["Wall finishes for washrooms, hospitality interiors and public areas, with attention to alignment, corners, openings and junctions. Substrate suitability, tile weight and the specified fixing system need to be considered together. Where waterproofing is required, its scope and responsibility should be agreed before tiling begins."] },
    { id: "preparation", heading: "Floor preparation", paragraphs: ["Existing floor uplift, mechanical adhesive removal, local repairs and levelling can form part of an agreed package. The method depends on the substrate, its condition and the proposed finish. Moisture checks, drying requirements and product compatibility should inform the preparation plan; a levelling compound is not a universal answer to a poor substrate."] },
    { id: "complete-packages", heading: "Complete tiling packages", paragraphs: ["Bring preparation, installation and handover into one coordinated scope. We discuss what is included, what must be completed by others and when areas will be ready. This gives contractors a clearer basis for pricing and sequencing, whether the enquiry concerns a complete commercial floor or a smaller, defined tiling package."] },
    { id: "site-review", heading: "Understand the substrate", paragraphs: ["Review the floor or wall construction, existing finishes and visible condition. Agree the checks needed before work proceeds, including levels, moisture considerations and any repairs. Requirements should follow the project specification and the relevant system manufacturer's guidance."] },
    { id: "setting-out", heading: "Resolve the detail", paragraphs: ["Tile layout, datum levels, thresholds, trims and junctions affect the finished result. Movement joints must be considered in the layout and coordinated with the substrate and wider design; they should not be treated as an afterthought. Uncoupling or decoupling systems are considered where appropriate, rather than assumed suitable for every floor."] },
    { id: "programme", heading: "Agree the sequence", paragraphs: ["Site access, material deliveries, curing periods and the handover of work areas all affect the programme. We discuss interfaces with other trades and when completed tiling needs protection. Inspections and agreed snagging arrangements help keep the route to handover clear."], links: [{ href: "/#approach", label: "Read about our delivery approach" }] },
    { id: "retail", heading: "Retail & showrooms", paragraphs: ["Trading hours, customer access and high footfall can determine the installation window. For fit-outs and refurbishments, the discussion should cover phased areas, shopfitter interfaces, delivery routes and protection before reopening."] },
    { id: "hospitality", heading: "Hospitality & leisure", paragraphs: ["Public areas and washrooms often need to be sequenced around ongoing operations. Access restrictions, wet-area specifications and coordination with plumbing and other trades should be resolved before an installation programme is agreed."] },
    { id: "developments", heading: "Commercial developments", paragraphs: ["New schemes need consistent setting out across circulation spaces, clear floor-level coordination and agreed interfaces with surrounding finishes. Scope review should establish who provides the substrate, when it is ready and how completed areas are handed over."] },
    { id: "communal", heading: "Public & communal spaces", paragraphs: ["Shared entrances, corridors and amenities need practical access and handover plans. Specified slip performance, maintenance expectations and continuity of use matter alongside appearance; any required site documentation should be identified at enquiry stage."] },
    { id: "coverage", heading: "Warrington based. Project led.", paragraphs: ["Our base is Warrington, Cheshire, with a focus on the North West. We can also discuss suitable commercial work elsewhere in the UK. Project location is one part of the assessment, alongside scope, programme, access arrangements and the practical requirements of delivery.", "Send the town or postcode with your enquiry so we can discuss travel, site attendance and sequencing early. Delivery arrangements are agreed for each project from our Warrington base. Smaller projects are welcome where the scope and location make delivery practical."] },
    { id: "enquiry", heading: "Start with the project brief.", paragraphs: ["Tell us the project location, approximate area, tile specification or format, anticipated dates and tender deadline. Drawings, substrate information and access restrictions help us understand the scope. If the specification is still developing, explain what is known and which items need to be clarified."], links: [{ href: "/#tender", label: "Discuss your commercial tiling project" }] },
  ],
};

const home: SeoPage = {
  ...relationships, path: "/", category: "home",
  title: "TileSPEC | Commercial Tiling Contractors",
  description: "Specialist commercial wall and floor tiling. Tender-led delivery for main contractors, developers and commercial projects across the North West and beyond.",
  h1: "COMMERCIAL WALL & FLOOR TILING.",
  intent: "TileSPEC brand introduction, experience, overview and commercial tender enquiry.",
  intro: "Complete specialist tiling packages for main contractors, developers and commercial clients. From substrate preparation to finished installation.",
  children: ["/commercial-tiling"], publicationStatus: "approved", indexingStatus: "index", images: [],
  sections: [
    { id: "about", heading: "Experience on site.", paragraphs: ["Built on over 20 years of hands-on commercial tiling experience, TileSPEC combines skilled installation teams with structured site oversight and quality assurance. From initial site checks and installation inspections through to final handover, our approach is designed to maintain workmanship standards, coordinate with other trades and keep projects progressing."] },
    { id: "expertise", heading: "Commercial tiling services.", paragraphs: ["Wall and floor tiling packages, from substrate preparation and setting out to installation and handover."] },
    { id: "approach", heading: "How we work.", paragraphs: ["We review the specification, agree the scope and plan installation around the site programme."] },
    { id: "projects", heading: "Project photography.", paragraphs: ["A selection of illustrative images while we prepare photographs from previous commercial tiling work."] },
    { id: "tender", heading: "Got a project in mind?", paragraphs: ["Whether you're pricing a tender or planning an upcoming scheme, tell us what you're working on. We'll start with the scope, programme and requirements."] },
  ],
};

/** Planning entries have no routes, links or sitemap inclusion until individually approved. */
function planned(path: string, category: SeoPage["category"], h1: string, intent: string, parent = "/commercial-tiling"): SeoPage {
  return { ...relationships, path, category, h1, intent, parent, title: `${h1} | TileSPEC`, description: intent, intro: "", sections: [], images: [], publicationStatus: "draft", indexingStatus: "noindex" };
}

export const seoPages: readonly SeoPage[] = [
  home, commercialTiling,
  planned("/services/commercial-floor-tiling", "service", "Commercial floor tiling", "Specify and procure a commercial tiled floor: setting out, levels, movement joints and handover."),
  planned("/services/commercial-wall-tiling", "service", "Commercial wall tiling", "Procure wall tiling for commercial interiors, junction details, substrate suitability and wet-area responsibilities."),
  planned("/services/floor-preparation", "service", "Floor preparation for tiling", "Assess uplift, mechanical preparation, repair and levelling as part of a suitable tiling scope."),
  planned("/services/complete-tiling-packages", "service", "Complete commercial tiling packages", "Coordinate an agreed preparation, tiling and handover package with clear trade interfaces."),
  planned("/locations/north-west", "region", "Commercial tiling in North West England", "Review project-led commercial coverage from Warrington across the North West without invented local offices."),
  planned("/industries/retail-showrooms", "industry", "Tiling for retail & showrooms", "Plan retail and showroom tiling around trading restrictions, shopfitting and phased access."),
  planned("/industries/hospitality-leisure", "industry", "Tiling for hospitality & leisure", "Discuss operational disruption, public areas, washrooms and sequencing on hospitality projects."),
  planned("/industries/commercial-developments", "industry", "Tiling for commercial developments", "Coordinate circulation-area tiling, floor levels and trade interfaces within commercial developments."),
  planned("/industries/public-communal-spaces", "industry", "Tiling for public & communal spaces", "Review public-area performance specifications, access continuity, maintenance and handover."),
];

export function getSeoPage(path: string): SeoPage {
  const page = seoPages.find(entry => entry.path === path);
  if (!page) throw new Error(`No SEO registry entry for ${path}`);
  return page;
}
