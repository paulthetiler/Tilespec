# TileSPEC prelaunch implementation

The intended first public launch origin is **https://tilespec.uk**. The owner confirmed **info@tilespec.uk** for tender enquiries. This branch prepares the site; it does not approve indexing, merge the PR or promote a production deployment.

## Completed pages

The homepage is preserved, alongside the national commercial tiling hub, four specialist services, four industries, North West regional hub and Warrington, Manchester and Liverpool spokes: 14 marketing pages in total. The thirteen new pages remain `review` / `noindex` and are available in previews. Eight future regional entries remain drafts with no public routes or links.

Each category has a considered layout using the existing fonts, colours, photography and shared header/footer. Service variants change image placement and scope/detail compositions; industries foreground operational requirements; regions and cities organise coverage and procurement information differently. The current approved SVG from main is reused byte-for-byte. No local offices, projects, clients, accreditations or testimonials are invented. Photography remains labelled illustrative.

## Content and links

`lib/seo/registry.ts` combines typed service, industry and location content modules. Records define clean paths, metadata, H1, distinct intent, original introduction and sections, image provenance, actual parent and contextual related links. Canonicals are centrally derived from the production origin and path.

The national hub links its specialist services, industries and North West region. The region links its three city spokes; cities link their region and relevant commercial services. Industry and service pages link selected related scopes. Homepage service headings now reach the corresponding pages without changing the card layout or images. No links point to empty future regions.

## Launch controls

`readSeoConfig` defaults to the owner-confirmed `https://tilespec.uk`, never a deployment URL. Unique review pages have self-referencing absolute canonicals and matching Open Graph URLs even while noindex. Query strings do not enter canonicals. Paths omit trailing slashes except `/`; Next.js permanently redirects slash variants.

Indexing requires production, **both** `SEO_PRODUCTION_INDEXING=true` and `SEO_LAUNCH_APPROVED=true`, and an individually approved record with `indexingStatus: index`. Neither environment flag is enabled by this task. Review/draft pages cannot become indexable through an inherited deployment variable. All previews remain noindex regardless of production flags.

The preview and default prelaunch XML sitemap are intentionally empty: only approved, indexable canonical pages qualify. Robots allows public crawling so noindex can be read, while private auth/operations/API routes remain excluded. Once launch has been approved and production indexing enabled, alternate production hosts redirect to the confirmed canonical origin.

## Verification

`npm run build` checks the registry, compiles Next.js, then validates the emitted HTML, metadata, canonicals, heading counts, actual link graph, fragments, image references, Organization/Service/breadcrumb JSON, robots and sitemap. Duplicate copy, location substitution, invalid links and orphan pages are blocking issues. Similarity scores are editorial signals rather than claimed search-engine formulas.

The PR workflow runs all unit tests, TypeScript, the complete build and Chromium at desktop, tablet, mobile and 320px widths. It captures homepage, hub, floor service, retail industry, region and Manchester screenshots, verifies menu/CTA/links, checks native form validation and records the actual mailto navigation without sending email. Test artifacts include screenshots, reports and traces. Runtime image and console failures are checked; third-party brand image availability is reported separately where relevant.

For exact results and owner-verification requirements, see [launch-verification.md](launch-verification.md) and the PR's latest CI/preview links. [strategy.md](strategy.md) retains the initial audit and qualitative research; its original Phase 1 scope is superseded by this implementation.

## Approval before launch

Review the design/content, validate retained business experience/brand background and actual service/mobilisation suitability, ensure the confirmed email mailbox can receive enquiries, and connect/verify the production domain. Then approve the page records and indexing status and explicitly authorise the launch flags, merge and production release. None of those actions is inferred from a successful preview.
