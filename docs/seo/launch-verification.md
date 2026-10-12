# TileSPEC launch verification

The owner has confirmed **https://tilespec.uk** as the intended first-launch domain and **info@tilespec.uk** as the tender enquiry contact. This branch is for preview and review. It does not authorize merging, promotion, first launch or public indexing.

## Current canonical and indexing policy

- Canonicals use `https://tilespec.uk` by default, including on preview deployments. An explicit `SEO_CANONICAL_ORIGIN` can configure a later approved production domain; Vercel hostnames are rejected.
- Every available public content page has one absolute, self-referencing canonical. Query strings are excluded. `/` retains its slash; other canonical paths omit trailing slashes.
- Root metadata has no inherited canonical, so private authentication and operational pages cannot accidentally claim the homepage URL.
- Next.js permanently redirects trailing-slash variants. Alternate-host redirects apply only to an approved, indexable production build; review previews stay accessible at their own URLs.
- `SEO_PRODUCTION_INDEXING=true` **and** `SEO_LAUNCH_APPROVED=true` are required before production indexing can turn on. Both default to false. Vercel previews and development stay noindex even when both flags are present.
- An individual page additionally needs `publicationStatus: "approved"` and `indexingStatus: "index"`. Drafts never route. Review content routes in preview and local development only.
- Before launch, public responses carry `X-Robots-Tag: noindex, follow` and page metadata declares noindex. Private and API routes remain noindex, nofollow.
- The sitemap contains exactly the approved, indexable canonical URLs. It is intentionally empty before launch and on previews. robots.txt advertises the sitemap only when both production gates are enabled.

No deployment environment variables have been enabled as part of this implementation. Launch remains a separate, explicitly approved action.

## Automated checks

`npm run build` checks the content registry, builds Next.js, then reads the actual prerendered HTML, sitemap and robots responses. Critical defects fail the command. The checker verifies metadata/H1 uniqueness, location-substituted copy, publication gates, real outgoing links, fragment targets, orphan pages, canonical and Open Graph URLs, noindex, heading hierarchy, local images, and Organization, Service and breadcrumb JSON-LD. Text similarity and template repetition are editorial warnings, not ranking formulas.

`npm run test:seo` covers the gates, confirmed origin, canonical paths, duplicate content, location swapping, unpublished/orphan links, structured data and rendered regressions. It also simulates the fourteen launch pages being individually approved; this simulation does not modify their real statuses or enable indexing.

Acceptance must also run the project TypeScript checks, the full existing test suite, and browser checks against the actual preview. Desktop, tablet, mobile and 320px screenshots must be inspected before claiming visual acceptance. Remote mailbox delivery, Vercel build status and launch readiness must not be inferred from unit tests.

## Owner verification before first launch

The following facts must be confirmed by the owner; they are not invented project evidence:

1. The approved homepage's existing claims about years of experience, workforce/site oversight and work involving recognized brands remain accurate and appropriately distinguish personal/project experience from direct appointments to TileSPEC.
2. The scope described in service pages—commercial floor and wall installation, mechanical preparation where suitable, and coordinated packages—matches the services TileSPEC can quote and deliver. Waterproofing, specialist systems, waste handling, access and any work by others are agreed for each project rather than universally guaranteed.
3. Warrington remains the business base; Manchester, Liverpool, the wider North West and suitable UK enquiries can be assessed from that base. City content describes project planning and logistics, not fabricated offices, teams or local completed projects.
4. `info@tilespec.uk` is provisioned and monitored, and the site's email-app enquiry flow is suitable for launch. A prepared email is submitted only when the visitor sends it in their own email app.
5. Approved architectural images remain illustrative until replaced with verified project photographs. No new photograph is presented as proof of a completed TileSPEC project.
6. The owner has approved each page's design and content, then explicitly authorized launch/indexing. Domain ownership, DNS and mailbox delivery are independently verified before production promotion.

No ratings, reviews, unverified accreditations, invented technical standards, office addresses or new client appointments have been added to structured data.
