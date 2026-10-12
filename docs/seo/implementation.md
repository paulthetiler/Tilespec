# Reviewing and extending the SEO foundation

This branch adds one national hub for review. It does not approve the hub for production or publish service, industry or city pages. See [strategy.md](strategy.md) for the audit, keyword intent map and phased sitemap.

## Design and content

`components/site/brand.tsx`, `site-header.tsx` and `site-footer.tsx` reuse the approved logo asset and existing CSS. The homepage is moved verbatim into `home-content.tsx`, with a small server wrapper for metadata and publication-aware navigation. Its enquiry form, body content, photography and global styles remain intact. One footer link reaches the hub in preview; it is hidden in production while the hub is under review.

`content-page.tsx` provides a server-rendered hero, visible and structured breadcrumbs, available related-page links and commercial enquiry callout. The national hub combines an editorial introduction, numbered scope rows with supporting photography, programme considerations, contextual sector copy and coverage information. Future services, industries and regions should choose their own composition from these shared elements, not duplicate the entire hub.

All reused imagery remains explicitly illustrative. The page creates no case studies, offices, client appointments or testimonials. Existing homepage brand experience qualifications remain unchanged.

## Publication and indexing

The typed registry is `lib/seo/registry.ts`. Each record supplies its clean path, category, distinct intent, metadata, H1, introduction, sections, image provenance, parent and related pages, plus separate publication and indexing statuses. Canonical URLs are derived centrally rather than copied into records.

* `draft`: never routed, linked or included in a sitemap.
* `review`: available locally and on preview deployments; unavailable in production.
* `approved`: available in production; indexing still requires the page and environment gates below.

Before a production merge, confirm the preferred domain and set the server environment variables:

```
SEO_CANONICAL_ORIGIN=https://your-confirmed-production-domain
SEO_PRODUCTION_INDEXING=true
```

Do not copy the example placeholder as a real value. No default canonical domain is assumed. The currently verified Vercel alias is `tilespec.vercel.app`; it has not been confirmed as the permanent domain. Preview environments always stay noindex even if they inherit production configuration. A Vercel deployment with missing/unknown environment information also stays noindex.

Without domain configuration all pages remain noindex, canonicals are deliberately omitted and the XML sitemap is empty. Enabling indexing without a valid origin fails the build. Before publication, approve the individual record and set its indexing status to `index` after content/design approval. **Do not merge this default noindex configuration into a live indexed site without completing the production configuration.**

Clean canonical paths omit trailing slashes except `/`. Next.js redirects slash variants permanently; confirmed indexable production also redirects alternate hosts to the configured origin. Query parameters never enter metadata or sitemap URLs. They render the same landing page with the same clean canonical. Private operational/authentication routes stay noindex and outside the sitemap; their behaviour is not changed.

Root metadata deliberately has no inherited homepage canonical. Page metadata supplies self-referencing absolute canonicals once the origin is configured. Organization and Service data reflect Warrington and suitable UK project enquiries; no ratings or invented reviews are added. Breadcrumb structured URLs are generated only once the production origin is known.

## Adding a page

1. Establish a distinct commercial purpose and real supporting information. Use a draft registry entry first.
2. Write and review the metadata, introduction and substantive sections. Add verified evidence where available; specify image provenance.
3. Choose the actual parent and a small number of contextual relationships. Do not link to drafts.
4. Build a route using shared components, page metadata and a publication guard. Return a real 404 when the page is unavailable.
5. Run the checks, inspect desktop/mobile screenshots and review a preview.
6. Approve that page explicitly before enabling production indexing. There is no automatic generator that turns every registry entry into a route.

## Checks

```
npm ci
npm run test:seo
npm test
npm run typecheck
VERCEL_ENV=preview npm run build
```

`npm run build` runs registry checks before Next.js and audits the emitted HTML after the build. Critical defects fail the command. It checks duplicate paths/metadata/H1/intro/body, location-substituted copy, unavailable/broken/orphan links, publication status, rendered metadata and canonical/indexing policy, heading counts, local assets, fragment targets and structured JSON. Shingle similarities and template repetition are editorial warnings, not ranking formulas. They supplement human review rather than claiming to reproduce Google's systems.

The pull-request workflow runs the SEO tests, type checking and preview-mode build without database credentials. Existing database/operations end-to-end checks remain separate and are not part of the marketing change.

Browser acceptance must cover the actual preview at desktop and mobile widths: original logo, identical header/footer styling, correct fonts, image loading, one H1, no horizontal page overflow, functioning mobile menu (including Escape), valid section links and enquiry navigation. Compare with the approved homepage. Do not describe a remote build or screenshot as passed until the real result has been inspected.

Production remains subject to the user's design/content approval and an explicit domain decision. Merge and promotion are not part of this delivery.
