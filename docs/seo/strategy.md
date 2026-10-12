# TileSPEC: original SEO audit and staged expansion

> Historical Phase 1 planning document. The subsequent owner brief confirms https://tilespec.uk and expands this branch to 14 complete marketing pages. See [implementation.md](implementation.md) for current scope, canonical policy and launch gates.

## Scope of this delivery

Prepare the architecture and one working `/commercial-tiling` hub for design and content review. Preserve the approved homepage, logo and photography. All proposed service, industry, regional and city pages remain unpublished. A working preview is not approval to publish or index a page, merge the branch, or promote a deployment to production.

The commercial objective is enquiries that include a usable scope, project location, specification and programme. Suitable smaller projects can be discussed; the site should not imply a minimum contract value or nationwide permanent offices.

## Audit of the existing source

The audit covers the repository source at `1d47e558a76f453dfd4ef32fbbeb456abf3285ca`, before the SEO changes. Live indexing is a separate question. The connected Vercel fetch verified the homepage returns HTTP 200; `/robots.txt` and `/sitemap.xml` each returned HTTP 404 at the approved production alias during this audit.

| Area | Finding | Implication |
| --- | --- | --- |
| Framework | Next.js 15.5, React 19 and TypeScript, using App Router (`package.json`). | Use server-rendered marketing routes and the Metadata API. |
| Marketing URLs | `app/page.tsx` provides `/`. Navigation points to `#expertise`, `#approach`, `#projects`, `#about` and `#tender`; these are sections of one URL. | There are no existing service or location marketing URLs to migrate in this source. |
| Other routes | `/login`, `/auth/set-password`, authenticated `/admin` pages, auth/API/document endpoints. Login, password and admin layouts already use noindex; auth confirmation also sets an indexing header. | Keep these outside the marketing registry and XML sitemap. Retain their authentication and operational behaviour. |
| Design | `app/globals.css` uses Barlow Condensed headings, DM Sans body copy, ink `#0f2a3a`, dark `#0b202c`, teal `#7fb8b0`, pale backgrounds, a 1320px maximum shell and existing mobile breakpoints. | Reuse these tokens, classes, buttons and section language. Avoid introducing a second design system. |
| Logo and chrome | `/tilespec-logo-animated.svg` is used in the homepage header and footer; both are currently inline in `app/page.tsx`. | Extract shared components without changing the homepage's visible identity. Internal-page anchors must point back to real homepage sections. |
| Imagery and evidence | Homepage project images are explicitly labelled illustrative. Brand experience is qualified as work through previous employment and contracting arrangements. | Keep those qualifications. Neither the images nor brand logos prove a completed TileSPEC case study or direct client appointment. |
| SEO | Root metadata has a title, description and limited Open Graph fields. The baseline contains no canonical generator, XML sitemap, robots route or marketing structured data. | Establish one metadata and indexing policy before expansion. |
| Enquiries | The tender form prepares an email draft to the existing address; the user must send it in their email app. It does not upload drawings or record a lead. | Link hub calls to action to the existing enquiry section. Do not claim online submission or secure upload functionality. |
| Performance | The homepage is a client component because navigation and the form share its module. Fonts are externally imported; photography uses external image URLs and CSS backgrounds. | Keep new editorial content on the server, isolate interactive navigation, and optimise new imagery without replacing approved homepage assets. |

### Search and indexing evidence

On 12 October 2026, the connected GSC Wizard `list_sites` request returned `payment_required` because its trial/subscription was inactive. No property list, query data, page performance or URL Inspection results were obtained. This does not establish whether TileSPEC has a Search Console property.

A search lookup for `site:tilespec.vercel.app` returned no results. Such a lookup is not a complete Google index inventory and does not prove that every URL is unindexed. The search tool could not fetch the supplied live URL. Use deployed browser/HTTP checks for delivery verification; use the verified property's Page Indexing report and URL Inspection for indexing decisions.

Before the next rollout, collect a Search Console export of pages and queries, submitted sitemap information, and any legacy URL inventory. Do not redirect unknown historic URLs to the homepage. Map a genuine replacement where one exists; otherwise preserve an appropriate 404/410 decision.

## Commercial-intent research and proposed mapping

This is a qualitative intent assessment, not a search-volume or difficulty report. Search queries included `commercial tiling contractors nationwide UK floor wall tiling main contractors`, `commercial tiling North West Manchester Warrington`, and `commercial tiling contractors floor preparation`.

Dedicated nationwide commercial contractor results include [DM Tiling](https://www.dmtiling.co.uk/), [SGB Contractors](https://www.sgbcontractors.co.uk/) and [The Great Northern Tiling Company](https://gntc.co.uk/). Regional results include [Tile Flair North West](https://tileflairnw.co.uk/) alongside mixed domestic/commercial providers. This supports testing explicit commercial contractor language and project qualification rather than chasing broad “tilers” traffic. Competitor claims are not evidence of TileSPEC's capabilities.

Technical editorial topics should be checked against current manufacturer instructions and project specifications. [The Tile Association's technical publications](https://www.tiles.org.uk/technical-support/technical-publications/) and its [large-format tile guidance](https://www.tiles.org.uk/fixing-large-format-tiles-and-panels-with-underfloor-heating/) support treating substrate, movement and tile format as project-specific considerations. Do not publish universal system suitability, fixed joint spacing or curing-time promises based on a general marketing paragraph.

| Proposed URL | Primary intent and keyword group | Distinct information required | Priority/status |
| --- | --- | --- | --- |
| `/` | TileSPEC brand; company introduction | Existing business overview and visual identity | Existing; preserve |
| `/commercial-tiling` | Commercial tiling contractors/companies; nationwide commercial wall and floor tiling | Package scope, project suitability, tender information, preparation and installation interfaces, qualified coverage | Phase 1; sole working review hub |
| `/services/commercial-floor-tiling` | Commercial floor tiling contractor; porcelain floor installation | Floor levels, thresholds, loading/use, tile format, setting out, movement and finish protection | Phase 2; unpublished |
| `/services/commercial-wall-tiling` | Commercial wall tiling; washroom wall finishes | Background suitability, tile weight, junctions, wet-area interfaces, fittings and access panels | Phase 2; unpublished |
| `/services/floor-preparation` | Floor preparation for commercial tiling; mechanical preparation and levelling | Existing finish/adhesive removal, substrate condition, moisture considerations, repairs and compatible preparation systems | Phase 2; unpublished |
| `/services/complete-tiling-packages` | Commercial tiling package; preparation-to-handover subcontract | Scope ownership, inclusions/exclusions, material responsibility, programme, inspection and handover | Phase 2; unpublished |
| `/locations/north-west` | Commercial tiling North West; regional commercial contractor | Warrington base, verified service arrangements, mobilisation and relevant project requirements | Phase 3; unpublished |
| `/locations/north-west/warrington` | Commercial tiling Warrington | Useful base-specific information and a reason to exist separately from the North West hub | Phase 3 candidate; evidence gate |
| `/locations/north-west/manchester` | Commercial tiling Manchester | Verified ability to serve relevant projects, local project/access information and distinct buyer need | Phase 3 candidate; evidence gate |
| `/industries/retail-showrooms` | Retail/showroom floor tiling; shopfitting tiling contractor | Trading restrictions, phased access, high-footfall finishes, display/entrance setting out and shopfitter coordination | Phase 4; unpublished |
| `/industries/hospitality-leisure` | Hotel/restaurant/leisure commercial tiling | Operational disruption, washroom/public-area sequencing, cleaning/use requirements and other-trade interfaces | Phase 4; unpublished |
| `/industries/commercial-developments` | Commercial development tiling subcontractor | Specification review, work-area release, repeated details, interfaces, inspection and handover | Phase 4; unpublished |
| `/industries/public-communal-spaces` | Public/communal space tiling | Access continuity, transitions, cleaning/use requirements and coordination with the wider project team | Phase 4; unpublished |

“Commercial tiling company” and “commercial tiling contractor” belong to the same national hub. Large-format, porcelain and washroom topics initially belong within the relevant service page. Add a separate page only after capability, search intent and genuinely additional content justify it. Do not make an unqualified “flooring contractor” promise that implies unrelated flooring services.

## Proposed nationwide sitemap

Paths use no trailing slash, matching the existing Next.js convention. The hierarchy is expandable, not a publication queue.

```text
/
└── /commercial-tiling                         review preview only
    ├── /services/commercial-floor-tiling      unpublished
    ├── /services/commercial-wall-tiling       unpublished
    ├── /services/floor-preparation           unpublished
    ├── /services/complete-tiling-packages     unpublished
    ├── /industries/retail-showrooms       unpublished
    ├── /industries/hospitality-leisure    unpublished
    ├── /industries/commercial-developments    unpublished
    ├── /industries/public-communal-spaces unpublished
    └── /locations/north-west                     unpublished
        └── /locations/north-west/{city}          evidence-gated candidates
```

Industry/service breadcrumbs can use the national hub as their editorial parent without requiring a thin `/services` or `/industries` index. Regional breadcrumbs follow Home → Commercial tiling → North West → city. URL folders need not become indexable pages merely to exist.

| Expansion region | Proposed regional URL | City candidates; all unpublished |
| --- | --- | --- |
| North West | `/locations/north-west` | Warrington, Manchester, then Liverpool, Chester and Preston if justified |
| Yorkshire and the Humber | `/locations/yorkshire-and-the-humber` | Leeds, Sheffield |
| West Midlands | `/locations/west-midlands` | Birmingham |
| East Midlands | `/locations/east-midlands` | Nottingham |
| North East | `/locations/north-east` | Newcastle |
| South West | `/locations/south-west` | Bristol |
| South East | `/locations/south-east` | No city selected |
| Greater London | `/locations/greater-london` | Prefer one substantive London hub; avoid a second interchangeable city page |
| East of England | `/locations/east-of-england` | No city selected |

The brief's initial regional list is England-focused. Scotland, Wales and Northern Ireland remain future coverage discussions; do not imply committed nationwide mobilisation merely by adding them to a map.

### Publication evidence gate

Every regional/city candidate needs an owner-reviewed record of genuine service capacity, distinct buyer intent, original useful information and the sources behind local claims. Local logistics should describe what must be agreed on the actual site, not assume every project has the same restrictions.

Where relevant, record real completed work, the contracting relationship, authorised photographs and permission to identify the project. A verified case study is helpful but is not mandatory when other substantive local information justifies the page. A city name, general local statistics, a list of neighbourhoods or competitor page is insufficient. Without useful original information, retain the topic inside its regional hub and leave the candidate unpublished.

## Linking and conversion

Once approved, the homepage must link to the national hub through ordinary HTML navigation. The national hub links to published specialist services and regional hubs; it must not advertise links to draft URLs. During the first preview, service summaries can link to existing homepage expertise anchors while the separate pages remain unavailable.

Regional hubs link only to justified published city pages. A city links to its regional parent and the services relevant to its content. Industry pages link to appropriate services and verified case studies when available; case studies link back to their actual service, industry and location. Use descriptive anchors, not an identical all-sites link block on every page.

Calls to action should ask for location, approximate area, drawings/specification availability, substrate information, access and proposed programme. Preserve the current email-draft explanation. If enquiry tracking is later added, measure qualified enquiries and tender conversations, with agreed privacy controls; do not treat preview visits as lead performance.

## Canonical and indexing policy

The currently supplied Vercel address is a deployment reference. It is not assumed to be the permanent preferred domain.

1. Set `SEO_CANONICAL_ORIGIN` to the owner-verified preferred HTTPS origin. Accept an origin only: no credentials, query, fragment or path. Never infer a canonical domain from an incoming Host header or a preview URL.
2. Require `SEO_PRODUCTION_INDEXING=true`, a valid configured origin and an actual production deployment before permitting public indexing. Vercel previews/development remain noindex even if copied environment variables enable production indexing.
3. Require separate explicit publication/indexing approval in the typed registry. The hub remains a review preview until approved. Unpublished entries do not resolve as public landing pages or appear in the sitemap.
4. Generate one absolute, self-referencing canonical for each unique approved page from the same central helper. Marketing query strings resolve to the clean page canonical, not a new landing page. Different cities retain their own canonicals if they deserve publication.
5. Use no trailing slash except `/`; alternate slash paths receive a permanent redirect. Configure verified alternate production host/HTTP redirects after domain ownership is confirmed. Do not send preview domains to production automatically because previews must remain reviewable.
6. Until the canonical origin is confirmed, keep new pages noindex and the sitemap empty. Do not emit an invented production canonical. On a configured preview, canonical tags may point to the intended production equivalent, but noindex is still mandatory; canonical alone does not prevent preview indexing.
7. Emit noindex in metadata and deployment headers for preview marketing responses. Allow crawlers to fetch public previews so they can see that directive; robots.txt disallow alone is not an indexing guarantee. Protect confidential previews separately if needed. Keep admin/auth/API routes outside the public crawl and sitemap policy.
8. Include only approved, indexable, canonical 200-response pages in the production XML sitemap. Exclude draft, noindex, redirect and error URLs. A sitemap inclusion or request to index is not proof of actual indexing.

## Reusable components and implementation stages

Extract the existing SVG logo, top strip, header/navigation and footer. Preserve their classes, desktop dimensions, mobile menu and visible copy; make route-aware homepage anchors. Keep the form behaviour in its existing client boundary. The new page should use server components for hero, breadcrumb, editorial sections, package scope, imagery and enquiry links.

Reuse shell, condensed headings, teal accents and existing button treatments. The national hub should combine an architectural hero, concise contractor brief, detailed scope and coordination sections, a supporting image and commercial enquiry section. Do not reproduce the homepage section for section. Future service pages can emphasise technical scope, industry pages programme/use constraints, and regional pages coverage/logistics; share primitives without enforcing an identical composition.

Stage the feature on a dedicated branch:

1. Establish the typed content registry, canonical/metadata helper, indexing gates, robots/sitemap routes and quality checker. Registry records include slug/category, distinct intent, title/description/H1, parent/children, relevant service/industry/location links, sections/images, approval and indexing status. Canonical URL is derived centrally rather than independently typed.
2. Extract shared chrome, keeping homepage behaviour and approved assets. Build only the national hub for review; retain future subjects as unpublished planning entries.
3. Validate duplicate slugs and required metadata; exact title/H1/description/introduction duplication; location-normalised bodies; high body/template similarity; canonicals, link destinations and reachability. Exact duplicates, invalid destinations, missing approved-page metadata/canonicals and orphan approved pages block publication. Similarity thresholds are editorial warnings, not Google ranking formulas; review context before changing or publishing content.
4. Run TypeScript checks, the build and appropriate existing tests. Inspect rendered metadata/JSON-LD, links, slash redirects, 404s, indexing responses and sitemap filtering. Structured data must match visible content: Organization and Service information only, with no invented address, offices, ratings or accreditations; breadcrumbs must match actual hierarchy.
5. Capture desktop/mobile browser screenshots of both the approved homepage and new hub. Compare logo, navigation, footer, typography, colours, spacing, image loading and overflow. Test enquiry links and menu interaction. Record actual results, not assumed passes.
6. Open a reviewable pull request and one Vercel preview. Obtain design/content approval before merge or production promotion. Review the four service briefs next, then North West evidence, then industry content. Reassess qualified enquiries and Search Console evidence before nationwide city expansion.

Domain selection, publication approval, verified local/project evidence and performance data are release dependencies. They do not prevent building and reviewing the first hub now.
