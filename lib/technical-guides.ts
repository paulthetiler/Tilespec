export const guides = {
  "substrate-readiness": {
    title: "Substrate Readiness Before Commercial Tiling",
    description: "The key substrate checks that should be resolved before a commercial wall or floor tiling package starts.",
    intro: "Tiling should not be programmed simply because an area looks ready. The type and condition of the background, the specified finish and the selected installation system all affect when work can begin.",
    sections: [
      { heading: "Identify the background", text: "Confirm whether the area involves concrete, screed, timber-based construction, existing finishes or a prepared wall system. Record transitions and any known repairs. Different backgrounds require different assessment and preparation." },
      { heading: "Check condition and tolerances", text: "Inspect for movement, cracking, contamination, weak surfaces, unevenness and other defects that may affect the proposed finish. The required flatness depends on the specified tile format and installation system; agree corrective works rather than attempting to compensate during fixing." },
      { heading: "Understand moisture and curing", text: "Agree who is responsible for checking moisture conditions and confirming that screeds, repairs and levelling products have met the chosen system's requirements. Do not assume a surface is ready merely because it looks dry." },
      { heading: "Record the handover", text: "Before accepting an area, document outstanding preparation, access constraints and any incompatible work by preceding trades. Confirm the acceptance criteria in the specification and the relevant manufacturer's instructions." },
    ],
    takeaway: "A clear substrate handover reduces avoidable delays, variation disputes and failures after installation.",
    related: "/services/commercial-substrate-preparation",
    relatedLabel: "Commercial substrate preparation",
  },
  "movement-joints-and-setting-out": {
    title: "Movement Joints and Setting-Out on Commercial Floors",
    description: "Why movement provision and setting-out need to be coordinated before large commercial tiled floors are installed.",
    intro: "A successful floor layout balances appearance with the building's movement provision, existing joints and interface details. These decisions should be made from drawings and site conditions before installation begins.",
    sections: [
      { heading: "Review structural and substrate joints", text: "Identify existing structural, construction and movement joints from the drawings and on site. Do not simply bridge a joint with a continuous tiled finish. Any proposed treatment must be agreed against the project design and relevant product system." },
      { heading: "Plan perimeter and intermediate movement provision", text: "Discuss expected movement, changes in background, temperature exposure, heated areas and abutments with the designer and specification team. Joint locations, spacing and profiles must suit the project, not a universal rule copied between sites." },
      { heading: "Coordinate the tile layout", text: "Review datum lines, room geometry, key sightlines, entrances, columns and adjoining finishes. Confirm where cuts and movement profiles will fall, particularly with large-format tiles and long uninterrupted floor areas." },
      { heading: "Agree details before fixing", text: "Resolve conflicting drawings or missing joint details through the project's design process. Record approved layout and joint arrangements so installation and quality checks follow the same agreed information." },
    ],
    takeaway: "Movement joints are part of the designed floor system, not a finishing decision left until the tiling is nearly complete.",
    related: "/services/commercial-floor-tiling",
    relatedLabel: "Commercial floor tiling",
  },
  "waterproofing-and-wet-areas": {
    title: "Waterproofing and Commercial Wet-Area Tiling",
    description: "What contractors should coordinate before tiling washrooms, showers and other commercial wet areas.",
    intro: "Tiles and grout alone should not be treated as the waterproofing strategy. Wet-area performance relies on a coordinated background, waterproofing system, drainage details and compatible finishes.",
    sections: [
      { heading: "Define the wet-area requirement", text: "Establish the intended water exposure, substrate and design responsibility for each area. A standard washroom and a frequently used shower have different demands; the project's specification should identify the required build-up." },
      { heading: "Use a coordinated system", text: "Confirm compatibility between boards or screeds, primers, membranes, adhesives, grout and sealants. Pay particular attention to manufacturer requirements and interfaces between proprietary products." },
      { heading: "Detail junctions and penetrations", text: "Review wall-to-floor junctions, corners, drains, pipes, thresholds and movement provision before installation. These details often determine whether the complete assembly works as intended." },
      { heading: "Include inspection and handover", text: "Agree required inspections and any specified tests before finishes conceal critical details. Record completion and product information as part of the handover requirements." },
    ],
    takeaway: "Agreeing who designs, installs and signs off the waterproofing system is as important as selecting the visible tiles.",
    related: "/services/commercial-wall-tiling",
    relatedLabel: "Commercial wall tiling",
  },
} as const;
export type GuideSlug = keyof typeof guides;
