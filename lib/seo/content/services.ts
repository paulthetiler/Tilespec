import type { SeoPage } from "../types";

const blob = "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/";
const shared = {
  category: "service" as const,
  parent: "/commercial-tiling",
  children: [],
  publicationStatus: "review" as const,
  indexingStatus: "noindex" as const,
};

export const servicePages: readonly SeoPage[] = [
  {
    ...shared,
    path: "/services/commercial-floor-tiling",
    title: "Commercial Floor Tiling | Specification & Installation | TileSPEC",
    description: "Commercial floor tiling for retail, circulation and shared interiors. Discuss tile specifications, floor levels, setting out and your site programme with TileSPEC.",
    h1: "Commercial floor tiling.",
    intent: "Procure the installation of a specified commercial tiled floor, resolving layout, thresholds, movement joints and protection before handover.",
    intro: "A commercial tiled floor has to work with the building around it. Tile format, finished levels, doorway thresholds and the pattern of use all influence the installation. TileSPEC reviews these details with contractors and commercial clients before agreeing the floor tiling scope, whether the work covers a showroom, an entrance or a wider circulation area.",
    relatedServices: ["/services/floor-preparation", "/services/complete-tiling-packages"],
    relatedIndustries: ["/industries/retail-showrooms", "/industries/public-communal-spaces"],
    relatedLocations: ["/locations/north-west"],
    images: [
      { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative commercial interior with a large-format tiled floor and glazed frontage", role: "hero", provenance: "illustrative" },
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative open interior showing tile layout across a broad floor area", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "specification", heading: "Start with the specified finish",
        paragraphs: ["A useful enquiry identifies the tile manufacturer or proposed material, dimensions, thickness, approximate area and intended use. For large-format porcelain, the flatness of the background and the handling arrangements need particular attention. Adhesives, grout and any intermediate layers must be selected as a compatible system for the substrate and conditions; tile size alone does not determine the fixing method.", "Slip resistance, cleaning requirements and the visual finish should be considered by the project team together. A tile appropriate for one dry interior may be unsuitable for an entrance exposed to wet footwear. We flag unresolved specification items before pricing rather than make assumptions about performance."],
      },
      {
        id: "levels", heading: "Floor levels and thresholds",
        paragraphs: ["Finished floor height includes the tile and the agreed bedding or preparation layers. Those depths need to be coordinated with door clearances, entrance matting, lift thresholds and adjoining floor finishes. Survey information and a clear datum help identify discrepancies early. Where falls are required, their design and formation must be agreed rather than left to an improvised adjustment during tile fixing."],
        links: [{ href: "/services/floor-preparation", label: "Review substrate preparation and levelling" }],
      },
      {
        id: "layout", heading: "Setting out across the space",
        paragraphs: ["The layout should be reviewed against principal sightlines, circulation routes, columns and changes in room width. Agreeing the starting point and edge cuts before installation gives the design team a chance to resolve awkward junctions. Tile batches, shade variation and any directional pattern also need checking. Where more than one area joins, a coordinated setting-out drawing is more useful than treating each room independently."],
      },
      {
        id: "joints", heading: "Movement joints belong in the plan",
        paragraphs: ["Structural and substrate joints need to be identified and considered in the tiled finish. Perimeters, changes in background and the layout of intermediate movement joints require project-specific assessment, with the designer and system supplier involved where necessary. A decoupling or uncoupling layer may be appropriate for some constructions, but it does not remove the need to address movement or make an unsuitable substrate ready for tiling."],
      },
      {
        id: "access", heading: "Installation around site activity",
        paragraphs: ["Tile deliveries, storage space and access to each work area affect daily progress. We discuss installation zones, working hours and interfaces with shopfitters, joiners and other finishing trades. An active retail site may need a different sequence from an empty new build. Curing periods and restrictions on foot or equipment traffic should follow the agreed system, and completed areas need protection before subsequent trades return."],
        links: [{ href: "/industries/retail-showrooms", label: "Floor tiling around retail and showroom fit-outs" }],
      },
      {
        id: "inspection", heading: "Inspect before areas are handed over",
        paragraphs: ["Agreed inspections should cover the visible alignment, joints, junction details and condition of the finish. Snagging, cleaning and protection responsibilities need to be clear, particularly where tiling is released in phases. Maintenance information should reflect the actual tile and grout products used. We can discuss floor installation as a defined trade package or alongside preparation and wall tiling where a coordinated scope is more practical."],
        links: [{ href: "/services/complete-tiling-packages", label: "Bring preparation and installation into one package" }],
      },
      {
        id: "enquiry", heading: "Price the floor with the right information",
        paragraphs: ["Send the floor plans, approximate quantity, tile schedule, substrate information and project postcode with your tender enquiry. Include finished-level requirements, anticipated access dates and the tender deadline. TileSPEC is based in Warrington and can discuss suitable commercial floor tiling projects across the North West and elsewhere in the UK."],
      },
    ],
  },
  {
    ...shared,
    path: "/services/commercial-wall-tiling",
    title: "Commercial Wall Tiling | Washrooms & Interior Finishes | TileSPEC",
    description: "Wall tiling for commercial washrooms, public areas and hospitality interiors. Plan backgrounds, setting out, openings and wet-area details with TileSPEC.",
    h1: "Commercial wall tiling.",
    intent: "Appoint a wall tiling contractor for commercial interiors with clear background suitability, junction details and wet-area responsibilities.",
    intro: "Wall tiling is closely tied to the details that surround it: sanitary fittings, doors, counters, ceilings and service openings. TileSPEC works with contractors to establish a considered wall tiling scope for commercial interiors. The starting point is a suitable background and a clear specification, followed by setting out that gives corners, junctions and fittings the attention they need.",
    relatedServices: ["/services/commercial-floor-tiling", "/services/complete-tiling-packages"],
    relatedIndustries: ["/industries/hospitality-leisure", "/industries/public-communal-spaces"],
    relatedLocations: ["/locations/north-west/warrington"],
    images: [
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative architectural interior used to show the character of commercial finishes", role: "hero", provenance: "illustrative" },
      { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative commercial interior with clean junctions between floor, walls and glazing", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "backgrounds", heading: "Assess what is behind the tile",
        paragraphs: ["A plastered wall, a proprietary board system and a masonry background have different limitations. Background rigidity, flatness, condition and allowable load need checking against the tile weight and specified fixing system. Priming, repair or replacement may be required before installation. Fixing over an existing finish should only be considered after its stability and compatibility have been assessed; an apparently sound surface is not enough information on its own.", "The tender scope should identify who supplies and installs the background and who confirms it is ready. We can then distinguish tile fixing from any additional preparation and avoid unclear responsibilities at the point of access."],
      },
      {
        id: "setting-out", heading: "Line up the visible details",
        paragraphs: ["Wall elevations help coordinate grout lines with mirrors, fittings, door heads and changes in finish. We discuss the datum, tile orientation, edge cuts and the treatment of internal and external corners before work begins. Consistent setting out matters across adjacent walls as well as within individual panels. Samples or an agreed initial area can help the project team review appearance when the specification calls for that approach."],
      },
      {
        id: "wet-areas", heading: "Define the wet-area system",
        paragraphs: ["Tile and grout should not be assumed to provide a waterproof construction on their own. Where showers, splash zones or other wet areas require waterproofing, the designer should define the system, its extent and the junction details. Responsibility for membranes, penetrations and inspections needs agreement before tiles cover the background. Product compatibility, drying times and substrate moisture conditions must be considered in accordance with the selected system's guidance."],
        links: [{ href: "/industries/hospitality-leisure", label: "Discuss washrooms and wet areas within hospitality projects" }],
      },
      {
        id: "openings", heading: "Coordinate openings and fittings",
        paragraphs: ["Service penetrations and mounting positions should be available before the affected areas are tiled. Late changes can disrupt the layout and create avoidable rework. We discuss the sequence with plumbing, electrical and joinery trades, including whether fittings are installed before or after the tiled finish. Access panels, trims and sealant junctions should be shown in the details so their appearance and responsibility are understood."],
      },
      {
        id: "working-areas", heading: "Make the working area practical",
        paragraphs: ["Small washrooms and narrow circulation areas can become congested when several trades need access at once. Clear release dates, material storage and a sensible installation sequence help the wall package progress. Large or heavy tiles may require additional handling provision, which should be discussed at enquiry stage. For occupied buildings, restrictions on noise, dust and public access need to inform the agreed working arrangements."],
        links: [{ href: "/industries/public-communal-spaces", label: "Plan access in public and communal buildings" }],
      },
      {
        id: "completion", heading: "A complete finish, with clear boundaries",
        paragraphs: ["Checks at completion should cover alignment, grout appearance, edge details and the condition of the tiles. The scope must make clear which sealant joints, trims, cleaning and protection items are included. Where wall and floor finishes meet, their sequence and joint treatment need coordination. A combined package can be discussed if the project would benefit from aligning floor preparation and tiling with the wall installation."],
        links: [{ href: "/services/complete-tiling-packages", label: "Coordinate wall and floor tiling within a complete package" }],
      },
      {
        id: "enquiry", heading: "Send the wall elevations and specification",
        paragraphs: ["Tell us which areas require wall tiling, the approximate quantity and height, the proposed tiles and the background construction. Wall elevations, wet-area details and the fittings programme help define the price. Include the project location and tender return date. We welcome commercial wall tiling enquiries from contractors, developers and property teams for suitable projects from our Warrington base."],
      },
    ],
  },
  {
    ...shared,
    path: "/services/floor-preparation",
    title: "Floor Preparation for Commercial Tiling | TileSPEC",
    description: "Assess uplift, adhesive removal, substrate repairs and levelling before commercial tiling. TileSPEC defines preparation around the floor condition and specification.",
    h1: "Floor preparation for tiling.",
    intent: "Establish the preparation needed to make an existing or newly formed commercial substrate suitable for the proposed tiled finish.",
    intro: "Preparation is where the condition of a floor meets the requirements of the new finish. TileSPEC can discuss existing finish uplift, mechanical adhesive removal, repairs and levelling within an agreed commercial tiling scope. We start by understanding the substrate and the proposed construction, so the work addresses the actual floor rather than relying on a standard layer of levelling compound.",
    relatedServices: ["/services/commercial-floor-tiling", "/services/complete-tiling-packages"],
    relatedIndustries: ["/industries/retail-showrooms", "/industries/commercial-developments"],
    relatedLocations: ["/locations/north-west/manchester"],
    images: [
      { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative finished commercial floor showing the level surface a preparation scope supports", role: "hero", provenance: "illustrative" },
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative completed interior; preparation methods are determined from the actual site substrate", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "survey", heading: "Establish the existing construction",
        paragraphs: ["The floor build-up, age, previous finishes and visible condition inform the preparation plan. Drawings and a site inspection can help identify screed types, changes in background and areas needing further investigation. We discuss levels, surface contamination, cracks and any known moisture issues with the project team. Concealed conditions may only become apparent after uplift, so the tender should state its assumptions and how additional work will be assessed.", "Preparation cannot correct an unresolved structural problem. Where the background raises concerns beyond the tiling scope, the appropriate designer or specialist needs to establish what remedial work is required before a finish is installed."],
      },
      {
        id: "uplift", heading: "Uplift and adhesive removal",
        paragraphs: ["Removing old tiles or other finishes can expose residual adhesive, loose material and damaged areas. The removal method depends on what is present, the substrate's condition and any restrictions within the building. Mechanical preparation may be useful where it provides an appropriate clean, sound surface, but its suitability must be assessed first. Site information and any required hazardous-material surveys should be available before disturbing existing floor layers."],
        links: [{ href: "/industries/retail-showrooms", label: "Preparation during retail refurbishment and fit-out" }],
      },
      {
        id: "moisture", heading: "Allow for moisture and drying",
        paragraphs: ["A floor that looks dry is not necessarily ready for the specified system. The project team should identify the moisture checks, acceptance criteria and drying requirements relevant to the substrate and chosen products. Where a moisture-control treatment is proposed, its compatibility and limitations need checking. Covering a damp floor without understanding the cause can conceal a problem rather than resolve it. Testing and any treatment should have a clearly assigned responsibility."],
      },
      {
        id: "repairs", heading: "Repairs, flatness and finished height",
        paragraphs: ["Local repairs and smoothing or levelling products are selected for the background and required thickness. Surface preparation, primers and curing requirements are part of that selection. The aim is to achieve the condition needed for the agreed tiled construction, allowing for tile thickness and thresholds. Levelling does not automatically create designed falls, deal with continuing movement or strengthen a failing screed; those requirements need a separate assessment."],
        links: [{ href: "/services/commercial-floor-tiling", label: "Coordinate preparation with tile format and finished levels" }],
      },
      {
        id: "movement", heading: "Resolve cracks and movement",
        paragraphs: ["Cracks should be assessed for their cause and whether movement is continuing. The location of construction joints and movement joints needs recording before preparation obscures the surface. Some floors may benefit from a specified uncoupling system, but suitability depends on the construction and expected conditions. We discuss these interfaces with the project team so repairs, intermediate layers and the tiled finish form a considered build-up."],
      },
      {
        id: "release", heading: "Release the floor for installation",
        paragraphs: ["Preparation requires access to a clear work area and time for the selected products to cure or dry. Dust control, waste removal and temporary access routes should be planned around building operations. Before tile installation starts, the agreed checks should confirm that the background meets the relevant requirements. Combining preparation and installation in one package can make this transition clearer, while retaining responsibility for structural or specialist work with the appropriate parties."],
        links: [{ href: "/services/complete-tiling-packages", label: "Define preparation within the complete tiling scope" }],
      },
      {
        id: "enquiry", heading: "Show us the floor as well as the finish",
        paragraphs: ["Include photographs of the existing floor, its known construction, approximate area and intended tile finish in your enquiry. Note any level changes, previous moisture findings, uplift requirements and occupied areas. Send the location, access window and tender deadline. These details help us identify which preparation items can be priced and which need inspection or further project information."],
      },
    ],
  },
  {
    ...shared,
    path: "/services/complete-tiling-packages",
    title: "Complete Commercial Tiling Packages | Scope to Handover | TileSPEC",
    description: "Coordinate preparation, floor and wall tiling in one agreed commercial package. Define specifications, trade interfaces, access, inspections and handover with TileSPEC.",
    h1: "Complete commercial tiling packages.",
    intent: "Tender a coordinated commercial preparation and tiling package with defined inclusions, trade interfaces, programme and handover requirements.",
    intro: "A complete tiling package brings related work into a clear, coordinated scope. TileSPEC discusses preparation, floor and wall installation, setting out and completion requirements with main contractors and commercial clients. Complete means the items agreed for your project: a defined package with stated exclusions and trade interfaces, rather than an assumption that every part of the floor or wall construction is included.",
    relatedServices: ["/services/floor-preparation", "/services/commercial-floor-tiling", "/services/commercial-wall-tiling"],
    relatedIndustries: ["/industries/commercial-developments", "/industries/hospitality-leisure"],
    relatedLocations: ["/locations/north-west/liverpool"],
    images: [
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative commercial interior showing a continuous tiled finish across connected spaces", role: "hero", provenance: "illustrative" },
      { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative architectural interior used to show coordinated floor and junction details", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "tender-scope", heading: "Build a scope that can be priced",
        paragraphs: ["Drawings, tile schedules and a written specification provide the basis for a comparable tender. We review which areas are included, the measured quantities and the required finish. Preparation, tile supply, trims, intermediate systems, grout, sealants, cleaning and protection should each have an identified responsibility. If information is incomplete, the quotation needs clear assumptions or allowances so the contractor can see what remains unresolved.", "A package may cover several floors and wall areas, or a smaller defined section of a scheme. The right scope depends on the project and access arrangements; it does not need to be extensive to benefit from careful coordination."],
      },
      {
        id: "background", heading: "Separate readiness from preparation",
        paragraphs: ["The main contractor and relevant trades need to agree when each background will be ready and what condition is required. TileSPEC can discuss preparation items such as uplift, adhesive removal, local repairs and levelling where appropriate. Structural remediation, background formation and specialist treatments must remain clearly allocated. The package should identify inspections or testing needed before installation, including the response if a floor or wall is unsuitable on release."],
        links: [{ href: "/services/floor-preparation", label: "Understand the floor preparation elements" }],
      },
      {
        id: "details", heading: "Coordinate one set of installation details",
        paragraphs: ["Floor layouts and wall elevations need to work together at doorways, corners and changes in finish. Datums, thresholds, movement joints, trims and service penetrations should be resolved with the design team before the affected areas are tiled. Product selection needs to suit the background, exposure and specified tiles. A coordinated package gives these interfaces one discussion, while design decisions and any required approvals stay with the appropriate project parties."],
        links: [{ href: "/services/commercial-floor-tiling", label: "Floor setting out and junction details" }, { href: "/services/commercial-wall-tiling", label: "Wall backgrounds and wet-area responsibilities" }],
      },
      {
        id: "programme", heading: "Sequence work by area and readiness",
        paragraphs: ["An installation programme should follow the release of usable work areas, material availability and the requirements of the selected systems. We discuss deliveries, storage, working hours and the order of floor and wall operations. Drying or curing time and access restrictions need to be reflected in the plan. Phased handovers can help a wider fit-out progress, provided adjoining trades and protection arrangements are coordinated around each released area."],
      },
      {
        id: "changes", heading: "Keep changes visible during delivery",
        paragraphs: ["Updated drawings, altered tile selections or unexpected substrate conditions can affect quantities, methods and timing. Changes should be communicated through the agreed site process before the affected work proceeds. Recording the decision, price implications and programme effect gives the project team a clear basis for instruction. This is especially relevant where a refurbishment reveals conditions that could not be fully assessed during tendering."],
        links: [{ href: "/industries/commercial-developments", label: "Tiling interfaces on commercial developments" }],
      },
      {
        id: "handover", heading: "Agree the route to completion",
        paragraphs: ["Quality checks, snagging and final cleaning should be planned alongside installation. The handover should identify the finished areas, any outstanding actions and the protection needed before occupation or further trade access. Care information should relate to the installed products, with maintenance expectations understood by the receiving team. We discuss these requirements at scope stage so completion is an agreed part of the package, rather than a separate assumption at the end."],
      },
      {
        id: "enquiry", heading: "Send the package for tender review",
        paragraphs: ["Share the project postcode, drawings, tile schedule, approximate quantities and the proposed programme. Identify preparation requirements, supply responsibilities and the tender return deadline. Tell us about any phased access or occupied areas. From our Warrington base, we assess suitable North West and nationwide packages on their scope, location and practical delivery requirements."],
      },
    ],
  },
];
