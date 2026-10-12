import type { SeoPage } from "../types";

const blob = "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/";
const industryDefaults = {
  category: "industry" as const,
  parent: "/commercial-tiling",
  children: [],
  publicationStatus: "review" as const,
  indexingStatus: "noindex" as const,
};

/** Sector-specific procurement guidance; imagery is illustrative, never project evidence. */
export const industryPages: readonly SeoPage[] = [
  {
    ...industryDefaults,
    path: "/industries/retail-showrooms",
    title: "Retail & Showroom Tiling Contractors | TileSPEC",
    description: "Plan retail and showroom tiling around trading hours, display layouts, phased access and shopfitting. Discuss your floor or wall package with TileSPEC.",
    h1: "Tiling for retail & showrooms.",
    intent: "Procure retail and showroom floor or wall tiling with trading restrictions, display-led setting out and shopfitter coordination.",
    intro: "A retail floor has to work with the merchandising plan as well as the building. Entrances, display runs and customer routes influence the tile layout; trading hours and shopfitting determine when installation can happen. TileSPEC discusses new fit-outs, showroom floors and refurbishment packages with contractors and property owners, starting with the agreed area, specification and available working window.",
    relatedServices: ["/services/commercial-floor-tiling", "/services/floor-preparation", "/services/complete-tiling-packages"],
    relatedIndustries: [],
    relatedLocations: ["/locations/north-west"],
    images: [
      { src: blob + "file_000000003b8c82108173987758914799.png", alt: "Illustrative retail-style interior with a tiled floor and architectural display space", role: "hero", provenance: "illustrative" },
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative commercial interior showing tiled floor setting out across an open space", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "trading-access", heading: "Trading hours set the working window",
        paragraphs: ["An occupied shop needs a clear boundary between work and trading. Agree which entrance remains available, how materials reach the work area and when noisy or dusty preparation can take place. Evening or phased work may be appropriate, but the proposed window still needs to allow for the specified fixing system, curing and protection. A reopening date should be assessed against those requirements before the sequence is accepted."],
      },
      {
        id: "display-layout", heading: "Set out around the retail layout",
        paragraphs: ["Display bases, gondolas, checkout counters and shopfront lines can make otherwise small setting-out decisions very visible. Review the tile module against the shopfitter's latest drawings and confirm the datum before installation. Large-format porcelain can be considered where the specification and substrate support it. Cuts at entrances, service points and transitions need agreement, alongside any movement joints that cross customer-facing areas."],
      },
      {
        id: "refurbishment", heading: "Establish what sits below the finish",
        paragraphs: ["A refurbishment price should identify the existing finish and what is known about the substrate beneath it. Uplift may reveal residual adhesive, local damage or changes in level that were not visible during the tender survey. Agree the extent of investigation and how additional preparation will be instructed. Mechanical removal, repairs and levelling must be selected for the actual substrate and the intended floor build-up."],
        links: [{ href: "/services/floor-preparation", label: "Assess floor preparation before refurbishment" }],
      },
      {
        id: "retail-performance", heading: "Specify for use and maintenance",
        paragraphs: ["Footfall, tracked-in water, cleaning arrangements and any display loads should inform the designer's tile selection. Slip performance needs to suit the intended use and should be considered with entrance management and maintenance; a single product description does not establish suitability for every area. Confirm grout colour, junctions with other finishes and any required samples. Showrooms also benefit from agreeing a representative layout before the full floor proceeds."],
      },
      {
        id: "coordination", heading: "Coordinate with the shopfitting programme",
        paragraphs: ["The tiled area needs to become available before installation starts, rather than remain a shared storage or cutting zone. Resolve the sequence with joinery, decoration, electrical fit-out and final display installation. If shopfitters must return across a finished floor, agree suitable protection and responsibility for maintaining it. Delivery restrictions, stock movements and waste collection also need a place in the programme.", "For a phased floor, define the boundary of each handover and how the next phase will be reached. Partial completion is only useful if the operator understands which areas are ready for the agreed use."],
      },
      {
        id: "procurement", heading: "A clearer retail tender package",
        paragraphs: ["Send the floor plan, finish schedule, tile dimensions, approximate quantities and target opening date. State whether uplift, substrate repairs, trims and protection are included in the tiling enquiry. Flag landlord access conditions, permitted delivery times and any out-of-hours requirements. Where details remain provisional, identify them so the quotation can distinguish the defined scope from items needing clarification.", "TileSPEC is based in Warrington and welcomes North West retail enquiries and suitable projects nationwide. Location and available access are considered together with the size and sequence of the package."],
      },
      {
        id: "enquiry", heading: "Discuss your retail tiling tender",
        paragraphs: ["Tell us whether the unit is trading, vacant or part of a new fit-out. Include the location, tender deadline, floor or wall area and planned opening date. Mention drawings and finish schedules available, plus any restrictions on working hours. We can then discuss the scope and the practical route from preparation to reopening."],
        links: [{ href: "/#tender", label: "Send a retail or showroom tiling enquiry" }],
      },
    ],
  },
  {
    ...industryDefaults,
    path: "/industries/hospitality-leisure",
    title: "Hospitality & Leisure Tiling Packages | TileSPEC",
    description: "Commercial tiling for hospitality and leisure interiors. Review operational access, washroom details, wet-area responsibilities and the refurbishment programme.",
    h1: "Tiling for hospitality & leisure.",
    intent: "Plan hospitality and leisure tiling around guest operations, wet-area specifications, plumbing interfaces and area-by-area reopening.",
    intro: "Hospitality tiling often takes place around people who are still using the building. A reception floor, restaurant area or washroom refurbishment each has a different operational impact. TileSPEC discusses floor and wall packages with fit-out contractors, operators and property owners, with the installation sequence shaped by access, the specified finish and the areas that need to remain available.",
    relatedServices: ["/services/commercial-wall-tiling", "/services/commercial-floor-tiling", "/services/complete-tiling-packages"],
    relatedIndustries: [],
    relatedLocations: ["/locations/north-west"],
    images: [
      { src: blob + "file_000000006d2481f4aad27dd9a1e60776.png", alt: "Illustrative hospitality interior with tiled surfaces and considered architectural lighting", role: "hero", provenance: "illustrative" },
      { src: blob + "file_00000000864c81f48bb8e9fdca1728c9.png", alt: "Illustrative commercial wall finish showing tiled detailing in an interior", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "guest-operations", heading: "Plan around the operator's day",
        paragraphs: ["Guest arrivals, restaurant service, leisure sessions and housekeeping can constrain the same access route at different times. Establish a working area that the operator can actually release, along with material routes and arrangements for noisy preparation. A short closure should be reviewed against the complete installation and curing sequence. Temporary access and segregated work zones need agreement with the party responsible for the building's operation."],
      },
      {
        id: "wet-area-details", heading: "Resolve wet-area responsibilities",
        paragraphs: ["Washrooms and other areas exposed to water need more than a tile choice. Identify the specified waterproofing or water-management system, where it is required and who installs and inspects it. Junctions, penetrations, drainage interfaces and any designed falls should be coordinated before tiling. Tile and grout alone should not be assumed to make an assembly waterproof. Specialist leisure environments need their own assessed specification; suitability is discussed against the actual brief."],
        links: [{ href: "/services/commercial-wall-tiling", label: "Review commercial wall tiling and wet-area interfaces" }],
      },
      {
        id: "interior-detail", heading: "Keep the interior detail coherent",
        paragraphs: ["Repeated wall modules, mirror positions, sanitaryware and changes in material can expose inconsistencies in setting out. Confirm the finished dimensions and datum against coordinated drawings, including recesses, corners and access panels. Discuss trim selection, grout appearance and junction treatment with the design team. On floors, the threshold to adjacent rooms and the interface with doors need to allow for the agreed build-up rather than be resolved after installation."],
      },
      {
        id: "cleaning-use", heading: "Match finishes to everyday use",
        paragraphs: ["A restaurant entrance and a washroom floor face different conditions. Tile performance, cleaning products, expected traffic and exposure to moisture should be considered in the specification for each area. The designer or specifier should confirm the required slip characteristics and finish suitability. Record the specified products and any relevant care instructions for the operator; the maintenance plan should follow the selected system rather than rely on a general promise of a maintenance-free surface."],
      },
      {
        id: "coordination", heading: "Sequence plumbing, finishes and reopening",
        paragraphs: ["Wall tiling depends on the agreed readiness of the background and service penetrations. Plumbing fit-off, cubicles, fittings and final decoration need to be sequenced so completed finishes are not repeatedly disturbed. Identify inspection points while waterproofing or other concealed work remains accessible. Allow for the specified drying and curing periods before subsequent trades or the operator use the space.", "Where only part of a building closes, set out a room-by-room or area-by-area release plan. Handover should identify the completed scope, any outstanding items and the conditions under which the area can reopen."],
      },
      {
        id: "procurement", heading: "Define the refurbishment boundaries",
        paragraphs: ["Tender information should distinguish tiling from demolition, plumbing, waterproofing, structural repair and decoration. Include room schedules, tile selections, quantities, drainage details and proposed closure dates. If the existing substrate cannot be inspected until strip-out, identify that uncertainty and the process for reviewing it. This supports a quotation based on visible information rather than assumptions about concealed conditions.", "From our Warrington base, we consider hospitality and leisure enquiries in the North West and suitable UK projects. Scope, site attendance and operational constraints determine the delivery arrangements for each enquiry."],
      },
      {
        id: "enquiry", heading: "Discuss your hospitality refurbishment",
        paragraphs: ["Send the location, affected rooms or areas, floor and wall quantities and tender return date. Tell us which parts of the premises will remain open and when work can take place. Mention the finish schedule and wet-area details available so we can review the tiling boundaries and the proposed handover sequence."],
        links: [{ href: "/#tender", label: "Enquire about a hospitality or leisure tiling package" }],
      },
    ],
  },
  {
    ...industryDefaults,
    path: "/industries/commercial-developments",
    title: "Tiling for Commercial Developments | TileSPEC",
    description: "Define commercial development tiling packages with coordinated floor levels, substrate readiness, specification review and staged handover. Enquire with TileSPEC.",
    h1: "Tiling for commercial developments.",
    intent: "Tender a tiling package for commercial development schemes, coordinating construction interfaces, finish schedules and sectional handover.",
    intro: "Commercial developments bring multiple work areas, finish schedules and trade interfaces into one programme. Reception spaces, circulation floors and shared amenities need a tiling scope that fits the wider construction sequence. TileSPEC works from the tender information to discuss preparation, floor and wall installation, defined responsibilities and the readiness of each area before it enters the installation programme.",
    relatedServices: ["/services/complete-tiling-packages", "/services/floor-preparation", "/services/commercial-floor-tiling"],
    relatedIndustries: ["/industries/public-communal-spaces"],
    relatedLocations: ["/locations/north-west"],
    images: [
      { src: blob + "file_000000009748824390831e6b533c9672.png", alt: "Illustrative commercial development interior with a broad tiled circulation floor", role: "hero", provenance: "illustrative" },
      { src: blob + "file_00000000a4ec82468ee6377d39b40b05.png", alt: "Illustrative architectural space showing a continuous commercial tiled finish", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "package-boundaries", heading: "Make the package boundaries visible",
        paragraphs: ["A finish schedule does not always define the full installation scope. Check who provides the screed or wall background, who assesses its readiness and which preparation tasks fall within the tiling package. Identify trims, joints, thresholds and any specified membranes or waterproofing. Drawings and schedules should be read together, with discrepancies raised for clarification. Keep provisional areas and quantities visible so the procurement team can compare enquiries on an equivalent basis."],
      },
      {
        id: "level-coordination", heading: "Coordinate levels across the scheme",
        paragraphs: ["The finished tile level needs to work with adjoining floors, doors, stairs and building entrances. Review the proposed build-up against the design datum, including the substrate, any preparation layer and the specified fixing system. Local variation in the substrate may require a separate assessment rather than adjustment through adhesive alone. Confirm movement-joint locations with the wider floor design and address changes in finish before setting out starts."],
      },
      {
        id: "area-readiness", heading: "Release work areas on agreed conditions",
        paragraphs: ["A room marked ready on a programme may still contain unfinished services, stored materials or a substrate that needs further checks. Agree practical release conditions for each area: suitable background, relevant moisture information, completed preparatory work and sufficient access for installation. Requirements depend on the materials and specified system. New screeds and other wet construction need their own assessed drying and readiness criteria, rather than a universal assumed waiting period."],
        links: [{ href: "/services/floor-preparation", label: "Review substrate readiness and floor preparation" }],
      },
      {
        id: "repeated-details", heading: "Agree repeat details before rollout",
        paragraphs: ["Repeated lobbies, washrooms or circulation spaces benefit from consistent reference details. Agree the layout, grout and trim appearance, junctions and inspection expectations in a representative area where the project requires it. Keep subsequent installation aligned with the latest coordinated drawings, and record changes that affect quantities or sequence. A sample area is useful for checking appearance and detailing; it does not remove the need to assess different substrate conditions elsewhere."],
      },
      {
        id: "coordination", heading: "Connect installation to sectional handover",
        paragraphs: ["The principal contractor's sequence should establish when tiling follows preceding trades and when other work returns to the finished area. Delivery routes, goods lifts, storage and shared access can determine how much work can proceed at once. Agree protection responsibilities and keep heavy follow-on activity in the discussion; completed tiling needs to be considered within the remaining build programme.", "For sectional completion, define the inspection and snagging arrangements for each zone. The handover record should identify the installed scope and remaining items so a later phase does not obscure what has already been accepted."],
      },
      {
        id: "procurement", heading: "Information for a considered tender return",
        paragraphs: ["Provide current drawings, finish schedules, quantities or take-off information, specification clauses and the intended procurement date. Include the construction programme, proposed area release dates and tender clarifications issued to other bidders. State whether materials are contractor-supplied or included in the enquiry, and identify any sample or documentation requirements. An unresolved detail should be identified in the return rather than hidden in a broad installation allowance.", "TileSPEC considers commercial development packages from Warrington across the North West and suitable projects nationwide, including smaller defined scopes where access and programme make delivery practical."],
      },
      {
        id: "enquiry", heading: "Send your commercial development brief",
        paragraphs: ["Tell us the scheme location, areas requiring tiling, expected installation dates and tender deadline. Mention the drawing revisions, finish schedule and specification available. Include proposed sectional handovers and any shared-access restrictions so we can discuss the package against the construction programme and identify the information needed for pricing."],
        links: [{ href: "/#tender", label: "Discuss a commercial development tiling tender" }],
      },
    ],
  },
  {
    ...industryDefaults,
    path: "/industries/public-communal-spaces",
    title: "Public & Communal Space Tiling | TileSPEC",
    description: "Tiling packages for shared entrances, corridors and amenities. Plan access continuity, maintainable finishes, phased working and documented handover with TileSPEC.",
    h1: "Tiling for public & communal spaces.",
    intent: "Specify and procure tiling in public and shared spaces with managed access, cleaning needs, stakeholder coordination and documented handover.",
    intro: "A shared entrance or corridor serves people who may have no involvement in the works. The tiling plan therefore needs to account for everyday access, building management and the requirements of the finished surface. TileSPEC discusses installations and refurbishments in public-facing and communal areas with contractors, facilities teams and property owners, with scope and phasing established around how the space is used.",
    relatedServices: ["/services/commercial-floor-tiling", "/services/commercial-wall-tiling", "/services/floor-preparation"],
    relatedIndustries: [],
    relatedLocations: ["/locations/north-west"],
    images: [
      { src: blob + "file_00000000c0c881f4a960c247e09c631a.png", alt: "Illustrative shared commercial interior with a broad tiled circulation route", role: "hero", provenance: "illustrative" },
      { src: blob + "file_000000003b8c82108173987758914799.png", alt: "Illustrative architectural entrance with tiled surfaces and public-facing interior space", role: "supporting", provenance: "illustrative" },
    ],
    sections: [
      {
        id: "access-continuity", heading: "Agree how the building stays accessible",
        paragraphs: ["Residents, visitors, staff and delivery teams can all depend on the same route. The building manager and contractor need to agree the working boundary, any alternative access and how changes are communicated. Emergency routes and accessibility requirements belong in that planning discussion. A phased installation must leave usable areas in the agreed condition; barriers and temporary arrangements should not be improvised as work progresses."],
      },
      {
        id: "surface-performance", heading: "Specify the surface for its setting",
        paragraphs: ["Entrances exposed to rainwater, internal corridors and communal washrooms have different performance needs. The specification should consider expected traffic, slip characteristics, cleaning arrangements and transitions to adjacent finishes. Tile texture alone is not a complete assessment of slip risk. Finished levels and threshold details should follow the coordinated design, including relevant access requirements. Raise conflicts between the proposed build-up and existing doors or adjoining floors before installation."],
      },
      {
        id: "occupied-refurbishment", heading: "Understand an occupied refurbishment",
        paragraphs: ["Existing tiles may need uplift before the underlying floor can be inspected properly. Confirm how noisy preparation, dust control, debris removal and temporary storage are managed within the wider site arrangements. The substrate may require repairs or a revised preparation scope once exposed. Agree how findings are recorded and instructed, and which areas can be assessed in advance. The proposed fixing system must suit the actual background rather than the appearance of the old floor."],
        links: [{ href: "/services/floor-preparation", label: "Plan preparation for an existing communal floor" }],
      },
      {
        id: "maintenance-detail", heading: "Consider the facilities team's handover",
        paragraphs: ["Grout choice, exposed edges and junctions influence the practical care of a shared space. Confirm the selected finishes and any cleaning guidance with the specification and product information. Where replacement materials are required, identify who supplies and retains them and how they will be labelled. Access panels and service points should remain usable within the coordinated detail. These decisions help facilities teams understand the installed system without unsupported claims about its future lifespan."],
      },
      {
        id: "coordination", heading: "Coordinate stakeholders and phased release",
        paragraphs: ["The party procuring the work may be different from the team operating the premises. Establish who can release areas, approve access changes and receive completed work. Programme tiling alongside maintenance, decoration and any door or service alterations, allowing for the specified curing periods. Follow-on work and cleaning should be planned with suitable protection for the new finish.", "For a corridor or entrance completed in sections, agree the inspection and reopening criteria for each section. Record outstanding items and the limits of the handed-over area so everyday use does not blur the remaining work boundaries."],
      },
      {
        id: "procurement", heading: "Prepare the communal-space enquiry",
        paragraphs: ["Include the building type, area plan, approximate quantities, proposed tile finish and existing floor or wall construction. State whether the building remains occupied and identify the decision-maker for access arrangements. Public-sector or managed-property tenders may have specific documentation, site induction or procurement requirements; provide these at enquiry stage so they can be reviewed against the proposed scope. No accreditation or framework membership should be inferred from the type of project discussed.", "Based in Warrington, TileSPEC welcomes enquiries for suitable shared-space tiling in the North West and elsewhere in the UK. Travel and attendance are assessed against the work and programme."],
      },
      {
        id: "enquiry", heading: "Discuss access and the tiling scope",
        paragraphs: ["Send the location, floor or wall area, finish information and tender deadline. Explain who uses the space, which routes need to remain available and any proposed closure periods. Mention drawings, surveys and procurement documents available so we can review the practical requirements and the route to an agreed handover."],
        links: [{ href: "/#tender", label: "Send a public or communal-space tiling enquiry" }],
      },
    ],
  },
];
