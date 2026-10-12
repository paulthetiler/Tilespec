import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, isCanonicalPath, isPageIndexable, isPageRoutable, readSeoConfig } from "../lib/seo/config";
import { pageMetadata, rootMetadata } from "../lib/seo/metadata";
import { checkSeoPages, contentSimilarity } from "../lib/seo/quality";
import { checkRenderedSeo } from "../lib/seo/rendered-quality";
import { seoPages } from "../lib/seo/registry";
import { breadcrumbJsonLd, organisationJsonLd, serviceJsonLd, serializeJsonLd } from "../lib/seo/structured-data";
import type { SeoPage } from "../lib/seo/types";

const preview = readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "preview", SEO_CANONICAL_ORIGIN: "https://tilespec.uk", SEO_PRODUCTION_INDEXING: "true", SEO_LAUNCH_APPROVED: "true" });
const production = readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "production", SEO_CANONICAL_ORIGIN: "https://tilespec.uk", SEO_PRODUCTION_INDEXING: "true", SEO_LAUNCH_APPROVED: "true" });

function page(path: string, overrides: Partial<SeoPage> = {}): SeoPage {
  return {
    ...seoPages[0],
    path,
    category: path === "/" ? "home" : "service",
    title: `Title for ${path}`,
    description: `Description for ${path}`,
    h1: `Heading for ${path}`,
    intent: `Intent for ${path}`,
    intro: `A distinct introduction for ${path} with useful commercial project information.`,
    sections: [{ id: "planning", heading: "Project planning", paragraphs: [`Specific programme and installation content for ${path}.`] }],
    publicationStatus: "approved",
    indexingStatus: "index",
    parent: path === "/" ? undefined : "/",
    children: [], relatedServices: [], relatedIndustries: [], relatedLocations: [],
    ...overrides,
  };
}

const errors = (pages: SeoPage[]) => checkSeoPages(pages, preview).filter(issue => issue.severity === "error");

test("canonical origin is explicit and never inferred from Vercel", () => {
  const config = readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "production", VERCEL_URL: "deployment.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "tilespec.vercel.app" });
  assert.equal(config.canonicalOrigin, "https://tilespec.uk");
  assert.equal(config.indexingEnabled, false);
  assert.equal(canonicalUrl("/commercial-tiling", config), "https://tilespec.uk/commercial-tiling");
  assert.equal(readSeoConfig({ NODE_ENV: "production", SEO_PRODUCTION_INDEXING: "true" }).indexingEnabled, false);
});

test("reject unsafe and non-origin canonical configuration", () => {
  for (const origin of ["http://tilespec.uk", "tilespec.uk", "https://user:pass@tilespec.uk", "https://tilespec.uk/services", "https://tilespec.uk?x=1", "https://tilespec.uk#top", "https://tilespec.uk:443", "https://tilespec.uk:8443", "https://tile\tspec.uk", "https://tilespec.vercel.app", "https://branch-123.vercel.app"]) {
    assert.throws(() => readSeoConfig({ SEO_CANONICAL_ORIGIN: origin }), /HTTPS origin/);
  }
  assert.equal(readSeoConfig({ SEO_CANONICAL_ORIGIN: " https://TILESPEC.uk/ " }).canonicalOrigin, "https://tilespec.uk");
});

test("canonical paths exclude queries and alternate slash forms", () => {
  assert.equal(canonicalUrl("/", production), "https://tilespec.uk/");
  assert.equal(canonicalUrl("/commercial-tiling", production), "https://tilespec.uk/commercial-tiling");
  for (const path of ["/commercial-tiling/", "/commercial-tiling?utm_source=test", "//example.com", "/../admin", "/a//b", "/a#top", "/UpperCase"]) {
    assert.equal(isCanonicalPath(path), false);
    assert.throws(() => canonicalUrl(path, production));
  }
});

test("indexing requires production, both launch flags and individual page approval", () => {
  const approved = page("/");
  assert.equal(isPageIndexable(approved, production), true);
  assert.equal(isPageIndexable(approved, preview), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "development", SEO_CANONICAL_ORIGIN: "https://tilespec.uk", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", SEO_CANONICAL_ORIGIN: "https://tilespec.uk" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", SEO_LAUNCH_APPROVED: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", SEO_PRODUCTION_INDEXING: "true", SEO_LAUNCH_APPROVED: "true" })), true);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", VERCEL: "1", SEO_CANONICAL_ORIGIN: "https://tilespec.uk", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "development", SEO_CANONICAL_ORIGIN: "https://tilespec.uk", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(page("/review", { publicationStatus: "review" }), production), false);
  assert.equal(isPageIndexable(page("/draft", { publicationStatus: "draft" }), production), false);
  assert.equal(isPageIndexable(page("/private", { indexingStatus: "noindex" }), production), false);
});

test("review content routes only in preview/local; drafts never route", () => {
  const review = page("/review", { publicationStatus: "review", indexingStatus: "noindex" });
  assert.equal(isPageRoutable(review, preview), true);
  assert.equal(isPageRoutable(review, production), false);
  assert.equal(isPageRoutable(review, readSeoConfig({ NODE_ENV: "development" })), true);
  assert.equal(isPageRoutable(page("/draft", { publicationStatus: "draft" }), preview), false);
  assert.equal(isPageRoutable(page("/"), production), true);
});

test("page metadata self-references while root cannot leak a canonical", () => {
  const metadata = pageMetadata(page("/commercial-tiling"), production);
  assert.equal(metadata.alternates?.canonical, "https://tilespec.uk/commercial-tiling");
  assert.equal(metadata.openGraph?.url, "https://tilespec.uk/commercial-tiling");
  assert.equal(rootMetadata(production).alternates, undefined);
  assert.deepEqual(pageMetadata(page("/"), preview).robots, { index: false, follow: true, googleBot: { index: false, follow: true } });
  assert.equal(pageMetadata(page("/"), readSeoConfig({})).alternates?.canonical, "https://tilespec.uk/");
});

test("duplicate slugs, metadata, H1 and intros block publishing", () => {
  const home = page("/", { children: ["/service"] });
  for (const field of ["title", "description", "h1", "intro"] as const) {
    const child = page("/service", { [field]: home[field] });
    assert.ok(errors([home, child]).some(issue => issue.code === `duplicate-${field}`));
  }
  assert.ok(errors([home, home]).some(issue => issue.code === "duplicate-slug"));
});

test("location-swapped content is a critical issue", () => {
  const home = page("/", { children: ["/locations/manchester", "/locations/leeds"] });
  const manchester = page("/locations/manchester", {
    intro: "Commercial tiling in Manchester for projects planned around access and programme requirements.",
    sections: [{ id: "delivery", heading: "Delivery", paragraphs: ["Discuss the Manchester site address, delivery restrictions, available storage and installation dates before pricing the works."] }],
  });
  const leeds = page("/locations/leeds", {
    intro: manchester.intro.replaceAll("Manchester", "Leeds"),
    sections: [{ id: "delivery", heading: "Delivery", paragraphs: [manchester.sections[0].paragraphs[0].replaceAll("Manchester", "Leeds")] }],
  });
  assert.ok(errors([home, manchester, leeds]).some(issue => issue.code === "location-only-copy"));
});

test("near-copy scores are editorial warnings for genuinely different non-location pages", () => {
  const shared = "Substrate condition programme coordination site access setting out floor levels moisture conditions movement joints handover inspection sequencing drawings preparation installation specification materials delivery review quality requirements contractor trade interfaces";
  const home = page("/", { children: ["/first", "/second"] });
  const first = page("/first", { intro: "Review a commercial floor package.", sections: [{ id: "scope", heading: "Scope", paragraphs: [`${shared} floor installation requirements.`] }] });
  const second = page("/second", { intro: "Assess a commercial wall package.", sections: [{ id: "scope", heading: "Scope", paragraphs: [`${shared} wall installation requirements.`] }] });
  const issues = checkSeoPages([home, first, second], preview);
  assert.ok(issues.some(issue => issue.code === "similar-body" && issue.severity === "warning"));
  assert.ok(!issues.some(issue => issue.code === "location-template-copy"));
  assert.equal(contentSimilarity("", ""), 0);
  assert.equal(contentSimilarity(shared, shared), 1);
});

test("orphan, broken and unpublished destination links block publishing", () => {
  assert.ok(errors([page("/"), page("/orphan")]).some(issue => issue.code === "orphan-page"));
  assert.ok(errors([page("/", { children: ["/missing"] })]).some(issue => issue.code === "broken-link"));
  assert.ok(errors([page("/", { children: ["/draft"] }), page("/draft", { publicationStatus: "draft", indexingStatus: "noindex" })]).some(issue => issue.code === "draft-link"));
});

test("draft entries reserve slugs without requiring full copy", () => {
  const draft = page("/future", { publicationStatus: "draft", indexingStatus: "noindex", title: "", description: "", h1: "", intro: "", intent: "", sections: [], parent: undefined });
  assert.deepEqual(errors([page("/"), draft]), []);
  assert.ok(errors([page("/"), { ...draft, indexingStatus: "index" }]).some(issue => issue.code === "unapproved-indexing"));
});

test("breadcrumb schema uses visible ancestry and safe JSON serialization", () => {
  const schema = breadcrumbJsonLd(page("/commercial-tiling"), [page("/")], production)!;
  assert.equal(schema.itemListElement[0].name, "Home");
  assert.equal(schema.itemListElement[1].item, "https://tilespec.uk/commercial-tiling");
  assert.equal(breadcrumbJsonLd(page("/commercial-tiling"), [], { ...production, canonicalOrigin: null }), null);
  assert.equal(serializeJsonLd({ title: "</script><script>" }).includes("</script>"), false);
});

test("structured services accurately describe service pages and the confirmed contact", () => {
  const organisation = organisationJsonLd(preview);
  assert.equal(organisation.email, "info@tilespec.uk");
  assert.equal(organisation.logo, "https://tilespec.uk/tilespec-logo-animated.svg");
  const service = serviceJsonLd(page("/services/commercial-floor-tiling"), preview)!;
  assert.equal(service.url, "https://tilespec.uk/services/commercial-floor-tiling");
  assert.equal(service.provider["@id"], organisation["@id"]);
  assert.deepEqual(service.areaServed, { "@type": "Country", name: "United Kingdom" });
  for (const category of ["home", "industry", "region", "location"] as const) {
    assert.equal(serviceJsonLd(page("/information", { category }), preview), null);
  }
});

test("the real content registry has no critical SEO issues", () => {
  assert.deepEqual(checkSeoPages(seoPages, preview).filter(issue => issue.severity === "error"), []);
});

test("sitemap eligibility stays empty before launch and requires every page's approval", () => {
  const active = seoPages.filter(entry => entry.publicationStatus !== "draft");
  assert.equal(active.length, 14);
  const approved = active.map(entry => ({ ...entry, publicationStatus: "approved" as const, indexingStatus: "index" as const }));
  const eligibleUrls = (config: ReturnType<typeof readSeoConfig>, pages: readonly SeoPage[] = approved) => pages.filter(entry => isPageIndexable(entry, config)).map(entry => canonicalUrl(entry.path, config));
  assert.deepEqual(eligibleUrls(readSeoConfig({ NODE_ENV: "production" })), []);
  assert.deepEqual(eligibleUrls(readSeoConfig({ NODE_ENV: "production", SEO_PRODUCTION_INDEXING: "true" })), []);
  assert.deepEqual(eligibleUrls(preview), []);
  assert.equal(eligibleUrls(production).length, 14);
  assert.ok(eligibleUrls(production).every(url => url?.startsWith("https://tilespec.uk/") && !url.includes("?")));
  assert.equal(eligibleUrls(production, approved.map((entry, index) => index === 1 ? { ...entry, indexingStatus: "noindex" as const } : entry)).length, 13);
});

function renderedFixture(entry: SeoPage, links: string, ancestors: SeoPage[] = [], heading = entry.h1) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const scripts = [organisationJsonLd(preview), entry.parent ? breadcrumbJsonLd(entry, ancestors, preview) : null, serviceJsonLd(entry, preview)].filter(Boolean).map(schema => `<script type="application/ld+json">${serializeJsonLd(schema)}</script>`).join("");
  return `<html><head><title>${escape(entry.title)}</title><meta name="description" content="${escape(entry.description)}"><meta name="robots" content="noindex, follow"><link rel="canonical" href="${canonicalUrl(entry.path, preview)}"><meta property="og:url" content="${canonicalUrl(entry.path, preview)}"><meta property="og:title" content="${escape(entry.title)}"><meta property="og:description" content="${escape(entry.description)}"></head><body><h1>${heading}</h1><div id="tender"></div><img src="/tilespec-logo-animated.svg" alt="TileSPEC">${scripts}${links}</body></html>`;
}

test("rendered HTML catches canonical, robots, heading, image and link regressions", () => {
  const home = page("/", { children: ["/commercial-tiling"] });
  const hub = page("/commercial-tiling", { category: "national", publicationStatus: "review", indexingStatus: "noindex" });
  const homeHtml = renderedFixture(home, '<a href="/commercial-tiling">Commercial tiling</a>');
  const hubHtml = renderedFixture(hub, '<a href="/#tender">Enquire</a>', [home]);
  const assets = new Set(["/tilespec-logo-animated.svg"]);
  assert.deepEqual(checkRenderedSeo([home, hub], new Map([["/", homeHtml], [hub.path, hubHtml]]), preview, assets), []);
  for (const [code, mutated] of [
    ["rendered-canonical", hubHtml.replace('href="https://tilespec.uk/commercial-tiling"', 'href="https://tilespec.uk/"')],
    ["rendered-indexing", hubHtml.replace('content="noindex, follow"', 'content="index, follow"')],
    ["rendered-h1-count", hubHtml.replace("</body>", "<h1>Second heading</h1></body>")],
    ["rendered-broken-link", hubHtml.replace('href="/#tender"', 'href="/draft"')],
    ["rendered-broken-fragment", hubHtml.replace('href="/#tender"', 'href="/#missing"')],
    ["rendered-missing-image", hubHtml.replace('src="/tilespec-logo-animated.svg"', 'src="/missing.svg"')],
    ["rendered-image-alt", hubHtml.replace('alt="TileSPEC"', "")],
    ["rendered-open-graph", hubHtml.replace('property="og:url" content="https://tilespec.uk/commercial-tiling"', 'property="og:url" content="https://preview.vercel.app/commercial-tiling"')],
    ["rendered-breadcrumb-schema", hubHtml.replace('"position":2', '"position":4')],
    ["rendered-organisation-schema", hubHtml.replace('"name":"TileSPEC"', '"name":"Other business"')],
    ["rendered-heading-order", hubHtml.replace("</h1>", "</h1><h3>Skipped H2</h3>")],
    ["rendered-schema-json", hubHtml.replace('{"@context"', '{INVALID"@context"')],
  ]) {
    assert.ok(checkRenderedSeo([home, hub], new Map([["/", homeHtml], [hub.path, mutated]]), preview, assets).some(issue => issue.code === code));
  }
  assert.ok(checkRenderedSeo([home, hub], new Map([["/", renderedFixture(home, "")], [hub.path, hubHtml]]), preview, assets).some(issue => issue.code === "rendered-orphan-page"));
  assert.ok(checkRenderedSeo([home, hub], new Map([["/", homeHtml], [hub.path, hubHtml.replace('href="/#tender"', 'href="https://tilespec.uk/missing-page"')]]), preview, assets).some(issue => issue.code === "rendered-broken-link"));
});

test("approved homepage line breaks, emphasis and entities preserve the H1 match", () => {
  const home = { ...seoPages.find(entry => entry.path === "/")!, children: [] };
  const html = renderedFixture(home, "", [], "COMMERCIAL<br/>WALL &amp; FLOOR<br/><em>TILING.</em>");
  assert.deepEqual(checkRenderedSeo([home], new Map([["/", html]]), preview, new Set(["/tilespec-logo-animated.svg"])), []);
});
