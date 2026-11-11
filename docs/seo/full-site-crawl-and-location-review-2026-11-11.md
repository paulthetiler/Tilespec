# TileSPEC full-site SEO crawl and location-content review
Date: 11 November 2026
Canonical site: https://www.tilespec.uk
Source: live HTTP responses for every URL in production sitemap; corresponding source reviewed in paulthetiler/Tilespec.

## 1. Production sitemap crawl

- 101 URLs found in `/sitemap.xml`, covering homepage, contact/privacy, coverage directory, 8 guides, 4 service pages, 11 regional hubs and 75 location pages.
- All 101 URL responses returned HTTP 200.
- All 101 pages had a canonical URL matching their exact sitemap URL.
- All 101 pages had one H1 and a title tag.
- Meta description tags were present on the inspected pages.
- Relative page links were compared to the sitemap and same-page `#fragment` destinations checked for matching IDs. No missing local page targets or in-page anchors were found. Static asset URLs are deliberately excluded from the sitemap; their omission is not a broken link.
- This is an HTTP/content crawl rather than a rendered browser accessibility or performance audit. External links, JavaScript-only navigation, image loading, WCAG compliance and mobile performance were not exhaustively tested.
- The live site remains publicly reachable and crawlable. Google Search Console was not accessed and no indexing action was taken.

## 2. Location-page quality review

Location-page data and dynamic template inspected in GitHub.

**61 template-generated locations**
- Each has a unique city, market focus, risk, local-areas string and two introductory paragraphs; no field was blank.
- All 61 introductory paragraph pairs differ in wording. The combined local introductions range from approximately 24 to 44 words, median around 31 words.
- The substantial remainder of the page (service list, approach, FAQ structure, photo sections, tender CTA and footer) is reused across those locations. That is not automatically a technical error, but page uniqueness cannot be inferred from total HTML word counts.
- The location descriptors are presented as potential project types and regional market contexts, not fabricated completed projects or local company premises.
- The original 61 meta descriptions were almost identical except for city. This was improved to include distinctive local sector focus while keeping snippets concise.

**14 separately authored location/region pages**
- Have custom text and metadata but largely share the same overall visual and service structure.
- Existing North West and London pages act as their canonical regional hubs. There are no duplicate regional URLs.

**Risk level: moderate editorial risk, not a proven Google penalty.**
- Potential doorway/thin-content perception if many near-identical geographic pages exist mainly to route visitors to the same generic form.
- No evidence from Google Search Console yet on indexing, impressions or query overlap; do not claim algorithmic suppression or penalties.
- Do not add dozens more location pages or automatic generic paragraphs as a workaround.

## 3. Recommended content policy before and after launch

1. Keep the current 75-page coverage architecture unchanged for now; no wholesale consolidation or mass noindex without data.
2. Give priority to main business geographies and actual relevant sectors, led by Warrington/North West and genuine travel-ready commercial markets.
3. Improve selected pages **only when substantiated evidence is available**: real project photos with permission, specific contractor problems solved, real installation methods, project sectors, logistical constraints and demonstrable experience. Never invent local offices, locally completed contracts, case studies, testimonials, accreditations or project names.
4. For each future local edit, ask: would this page help a main contractor choose whether to send a tender even if they removed the city name? If not, improve usefulness rather than padding copy.
5. After launch, use Search Console page/query data to judge which pages merit expansion, merging or canonical decisions.
6. Do not interpret a successful HTTP crawl as a guarantee of Google indexing, search traffic, Core Web Vitals, enquiry conversions or search ranking.

## 4. Remediation performed

- Updated the shared metadata generator in `app/[location]/page.tsx` for the 61 templated towns and cities: each now uses locally relevant sector descriptions, rather than a generic city substitution.
- Extended the reusable `npm run seo:check` script to check local links and fragment IDs as well as response status, sitemap, canonical, title and H1.
- No new pages were created, no Search Console or external service was used, and no speculative local claims were added.

## 5. Sign-off

Technical public sitemap crawl: **Pass** (within checks described above).
Internal sitemap-relative links and in-page fragment checks: **Pass**.
Location page content differentiation: **Needs evidence-led editorial improvement on selected pages**, not a mass rewrite.
Google indexing/ranking: **Not measured; intentionally deferred by owner**.
