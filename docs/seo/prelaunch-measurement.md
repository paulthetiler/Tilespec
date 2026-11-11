# TileSPEC SEO and marketing measurement — pre-launch handover

Updated 11 November 2026. The commercial website is technically online; the owner has not authorised a marketing launch or Google Search Console submission.

## Current scope
- Canonical domain: https://www.tilespec.uk
- Existing North West and London regional hub pages retained, alongside 9 further regional hubs.
- 75 geographic landing pages, four commercial service pages and eight technical guides.
- /sitemap.xml and /robots.txt use the www domain.
- Homepage, services, guides, regional pages and location pages have internal navigation links.
- Production enquiries are recorded in Supabase public.tender_enquiries, marked as received only following the form's completion step.

## What is measurable without Google Search Console
- Private /admin/marketing dashboard: total initiated enquiries, confirmed enquiries, tender/general split, seven-day and thirty-day confirmed counts.
- These are database *submissions*, not unique people, qualified opportunities, accepted tenders or sales.
- Test enquiries may be included and must not be mistaken for genuine sales prospects.
- Repeatable read-only website smoke check: `npm run seo:check`. It requests the sitemap and robots file, then checks sitemap URLs for successful responses, H1, title and canonical link. It never submits URLs to Google.

## Not activated
- Google Search Console property verification, sitemap submission, URL Inspection, organic clicks, keyword impressions, indexing status or positions.
- Vercel Web Analytics: the project currently reports web_analytics_not_enabled.
- Therefore page views, traffic channels, campaign attribution, conversion *rate* and search rankings are not measurable from the current analytics setup.
- Do not claim these measurements exist until the data source is configured and verified.

## Future launch checklist
1. Reconfirm that www.tilespec.uk is the primary URL; tilespec.uk redirects and the old vercel.app address is not advertised as the preferred website.
2. Inspect the privacy notice, cookies, visitor measurement choices and consent requirements before activating analytics or adding an external tracking service.
3. Decide whether pre-launch visitors should be able to access and index the site. As configured, public pages are accessible and robots.txt currently permits crawling. Not using Search Console **does not** keep a site out of Google.
4. Run the read-only `npm run seo:check`, fix reported issues and check actual enquiry workflow without generating fake production leads.
5. When the owner is ready, verify the canonical domain in Google Search Console, submit https://www.tilespec.uk/sitemap.xml, inspect key pages and establish the initial query/page performance baseline.
6. Enable a selected privacy-compliant visitor analytics provider, verify its real-time data, then configure a conversion only for **confirmed** enquiries, not form opens or unfinished uploads.
7. Report trends only after enough genuine traffic and enquiries accumulate; compare channels, enquiry types, qualified opportunities and won jobs rather than chasing visitor totals.

## Site risk
Do not confuse *not announced* with *not live*. The production URL currently serves public HTTP 200 pages with crawlable links. No anti-indexing restrictions have been added because the owner has not requested a change to the public site's visibility.
