// One canonical hub for every location. London and North West reuse existing landing pages.
export const regionalHubs = [
  {
    "id": "north-west",
    "name": "North West",
    "path": "north-west-commercial-tiling",
    "intro": "From Merseyside and Greater Manchester to Cheshire, Lancashire and Cumbria, we consider commercial tiling packages across varied business, education, retail and hospitality premises.",
    "detail": "Projects may range from occupied refurbishment to larger new-build fit-outs. We review substrates, programme, access and material procurement as part of the agreed specialist scope.",
    "ids": [
      "manchester",
      "liverpool",
      "preston",
      "lancaster",
      "carlisle",
      "chester",
      "blackpool",
      "bolton",
      "blackburn",
      "stockport"
    ]
  },
  {
    "id": "yorkshire-humber",
    "name": "Yorkshire & Humber",
    "path": "regions/yorkshire-humber",
    "intro": "Commercial tiling for major Yorkshire centres, including offices, universities, retail, hospitality and industrial support facilities.",
    "detail": "From large, hard-wearing floors to washroom finishes and phased refurbishment, the tiling package needs to follow drawings, substrate requirements and the main contractor's programme.",
    "ids": [
      "leeds",
      "sheffield",
      "york",
      "bradford",
      "wakefield",
      "hull",
      "doncaster",
      "huddersfield"
    ]
  },
  {
    "id": "north-east",
    "name": "North East",
    "path": "regions/north-east",
    "intro": "Commercial wall and floor tiling enquiries across the Tyne and Wear and Teesside markets, including education, hospitality, workplaces and retail.",
    "detail": "We assess finishing requirements alongside existing backgrounds, site logistics, access windows and construction sequencing for suitable packages.",
    "ids": [
      "newcastle-upon-tyne",
      "sunderland",
      "durham",
      "middlesbrough"
    ]
  },
  {
    "id": "central-scotland",
    "name": "Central Scotland",
    "path": "regions/central-scotland",
    "intro": "TileSPEC considers suitable commercial tenders in Glasgow and Edinburgh, with travel, accommodation, programme and supervision allowed for in the package.",
    "detail": "Office, hotel, institutional and commercial refurbishment schemes can involve complex site access and detailed specifications; each tender is reviewed individually.",
    "ids": [
      "glasgow",
      "edinburgh"
    ]
  },
  {
    "id": "west-midlands",
    "name": "West Midlands",
    "path": "regions/west-midlands",
    "intro": "Commercial tiling across Birmingham and neighbouring West Midlands business centres, covering retail, workplaces, hotels and public-use interiors.",
    "detail": "We focus on correctly scoped preparation, logistics, coordinated supply and setting-out for multi-trade programmes and phased installations.",
    "ids": [
      "birmingham",
      "coventry",
      "wolverhampton",
      "stoke-on-trent",
      "telford",
      "rugby",
      "worcester"
    ]
  },
  {
    "id": "east-midlands",
    "name": "East Midlands",
    "path": "regions/east-midlands",
    "intro": "Commercial tiling enquiries across the East Midlands, from city-centre office refurbishments to education facilities, hospitality and commercial estates.",
    "detail": "Existing and newly prepared substrates, finish schedules and working access all inform how preparation, procurement and installation are priced.",
    "ids": [
      "derby",
      "nottingham",
      "leicester",
      "lincoln",
      "northampton"
    ]
  },
  {
    "id": "east-of-england",
    "name": "East of England",
    "path": "regions/east-of-england",
    "intro": "Commercial tiling coverage for major East of England business districts, research and education premises, retail and hospitality buildings.",
    "detail": "We assess specified wall and floor systems, wet-area requirements, floor readiness and programme coordination before agreeing a supply-and-install scope.",
    "ids": [
      "cambridge",
      "peterborough",
      "norwich",
      "ipswich",
      "luton",
      "chelmsford",
      "colchester",
      "southend-on-sea",
      "stevenage"
    ]
  },
  {
    "id": "london",
    "name": "London",
    "path": "london-commercial-tiling",
    "intro": "TileSPEC considers commercial tiling tenders in London, including offices, hotels, retail interiors and phased refurbishment programmes.",
    "detail": "London work is reviewed against logistics, site programme, access restrictions, project value and available resources rather than implying a permanent local office.",
    "ids": [
      "london"
    ]
  },
  {
    "id": "south-east",
    "name": "South East",
    "path": "regions/south-east",
    "intro": "Commercial tiling enquiries across the South East, including business parks, aviation-linked hospitality, retail developments, commercial refurbishments and education.",
    "detail": "We review suitable tile finishes and substrate systems with particular care for occupied workplaces, city-centre logistics and project handovers.",
    "ids": [
      "oxford",
      "reading",
      "milton-keynes",
      "brighton-hove",
      "southampton",
      "portsmouth",
      "winchester",
      "canterbury",
      "slough",
      "crawley",
      "basingstoke",
      "watford",
      "bracknell",
      "maidstone",
      "medway"
    ]
  },
  {
    "id": "south-west",
    "name": "South West",
    "path": "regions/south-west",
    "intro": "Commercial tiling coverage across the South West's major office, hospitality, retail, leisure and institutional markets.",
    "detail": "For projects involving coastal property, older commercial buildings or new fit-out works, we assess surfaces, waterproofing, access and material lead times against the specification.",
    "ids": [
      "bristol",
      "bournemouth-poole",
      "bath",
      "gloucester",
      "exeter",
      "plymouth",
      "truro",
      "salisbury",
      "swindon"
    ]
  },
  {
    "id": "wales",
    "name": "Wales",
    "path": "regions/wales",
    "intro": "Commercial tiling across major Welsh centres, including city offices, hotels, retail, education, leisure and industrial support accommodation.",
    "detail": "TileSPEC assesses each tender for the appropriate background preparation, specified tiling finishes, practical access, programme and mobilisation.",
    "ids": [
      "cardiff",
      "swansea",
      "newport",
      "wrexham"
    ]
  }
] as const;
export type RegionalHub = (typeof regionalHubs)[number];
export const regionForLocation = (slug: string) => regionalHubs.find(hub => hub.ids.some(id => id + "-commercial-tiling" === slug));
export const regionById = (id: string) => regionalHubs.find(hub => hub.id === id);
export const locationDisplayName = (id: string) => ({ "brighton-hove": "Brighton & Hove", "bournemouth-poole": "Bournemouth & Poole", "newcastle-upon-tyne": "Newcastle upon Tyne", "stoke-on-trent": "Stoke-on-Trent", "milton-keynes": "Milton Keynes", "southend-on-sea": "Southend-on-Sea" } as Record<string,string>)[id] || id.split("-").map(w => w[0].toUpperCase()+w.slice(1)).join(" ");
