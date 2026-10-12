import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, isCanonicalPath, isPageIndexable, isPageRoutable, readSeoConfig } from "../lib/seo/config";
import { pageMetadata, rootMetadata } from "../lib/seo/metadata";
import { checkSeoPages, contentSimilarity } from "../lib/seo/quality";
import { checkRenderedSeo } from "../lib/seo/rendered-quality";
import { seoPages } from "../lib/seo/registry";
import { breadcrumbJsonLd, serializeJsonLd } from "../lib/seo/structured-data";
import type { SeoPage } from "../lib/seo/types";

const preview = readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "preview", SEO_CANONICAL_ORIGIN: "https://tilespec.example", SEO_PRODUCTION_INDEXING: "true" });
const production = readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "production", SEO_CANONICAL_ORIGIN: "https://tilespec.example", SEO_PRODUCTION_INDEXING: "true" });

function page(path: string, overrides: Partial<SeoPage> = {}): SeoPage {
  return {
    ...seoPages[0],
    path,
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
  assert.equal(config.canonicalOrigin, null);
  assert.equal(config.indexingEnabled, false);
  assert.equal(canonicalUrl("/commercial-tiling", config), undefined);
  assert.throws(() => readSeoConfig({ SEO_PRODUCTION_INDEXING: "true" }), /Confirm and configure/);
});

test("reject unsafe and non-origin canonical configuration", () => {
  for (const origin of ["http://tilespec.example", "tilespec.example", "https://user:pass@tilespec.example", "https://tilespec.example/services", "https://tilespec.example?x=1", "https://tilespec.example#top", "https://tilespec.example:443", "https://tilespec.example:8443", "https://tile\tspec.example"]) {
    assert.throws(() => readSeoConfig({ SEO_CANONICAL_ORIGIN: origin }), /HTTPS origin/);
  }
  assert.equal(readSeoConfig({ SEO_CANONICAL_ORIGIN: " https://TILESPEC.example/ " }).canonicalOrigin, "https://tilespec.example");
});

test("canonical paths exclude queries and alternate slash forms", () => {
  assert.equal(canonicalUrl("/", production), "https://tilespec.example/");
  assert.equal(canonicalUrl("/commercial-tiling", production), "https://tilespec.example/commercial-tiling");
  for (const path of ["/commercial-tiling/", "/commercial-tiling?utm_source=test", "//example.com", "/../admin", "/a//b", "/a#top", "/UpperCase"]) {
    assert.equal(isCanonicalPath(path), false);
    assert.throws(() => canonicalUrl(path, production));
  }
});

test("indexing requires production, explicit origin and approval", () => {
  const approved = page("/");
  assert.equal(isPageIndexable(approved, production), true);
  assert.equal(isPageIndexable(approved, preview), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "development", SEO_CANONICAL_ORIGIN: "https://tilespec.example", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", SEO_CANONICAL_ORIGIN: "https://tilespec.example" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", VERCEL: "1", SEO_CANONICAL_ORIGIN: "https://tilespec.example", SEO_PRODUCTION_INDEXING: "true" })), false);
  assert.equal(isPageIndexable(approved, readSeoConfig({ NODE_ENV: "production", VERCEL_ENV: "development", SEO_CANONICAL_ORIGIN: "https://tilespec.example", SEO_PRODUCTION_INDEXING: "true" })), false);
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
  assert.equal(metadata.alternates?.canonical, "https://tilespec.example/commercial-tiling");
  assert.equal(metadata.openGraph?.url, "https://tilespec.example/commercial-tiling");
  assert.equal(rootMetadata(production).alternates, undefined);
  assert.deepEqual(pageMetadata(page("/"), preview).robots, { index: false, follow: true, googleBot: { index: false, follow: true } });
  assert.equal(pageMetadata(page("/"), readSeoConfig({})).alternates, undefined);
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
  assert.equal(schema.itemListElement[1].item, "https://tilespec.example/commercial-tiling");
  assert.equal(breadcrumbJsonLd(page("/commercial-tiling"), [], readSeoConfig({})), null);
  assert.equal(serializeJsonLd({ title: "</script><script>" }).includes("</script>"), false);
});

test("the real content registry has no critical SEO issues", () => {
  assert.deepEqual(checkSeoPages(seoPages, preview).filter(issue => issue.severity === "error"), []);
});

test("rendered HTML catches canonical, robots, heading, image and link regressions", () => {
  const home = page("/", { children: ["/commercial-tiling"] });
  const hub = page("/commercial-tiling", { publicationStatus: "review", indexingStatus: "noindex" });
  function html(entry: SeoPage, links: string) {
    return `<html><head><title>${entry.title}</title><meta name="description" content="${entry.description}"><meta name="robots" content="noindex, follow"><link rel="canonical" href="${canonicalUrl(entry.path, preview)}"></head><body><h1>${entry.h1}</h1><div id="tender"></div><img src="/tilespec-logo-animated.svg" alt="TileSPEC">${links}</body></html>`;
  }
  const homeHtml = html(home, '<a href="/commercial-tiling">Commercial tiling</a>');
  const hubHtml = html(hub, '<a href="/#tender">Enquire</a>');
  const assets = new Set(["/tilespec-logo-animated.svg"]);
  assert.deepEqual(checkRenderedSeo([home, hub], new Map([["/", homeHtml], [hub.path, hubHtml]]), preview, assets), []);
  for (const [code, mutated] of [
    ["rendered-canonical", hubHtml.replace('href="https://tilespec.example/commercial-tiling"', 'href="https://tilespec.example/"')],
    ["rendered-indexing", hubHtml.replace('content="noindex, follow"', 'content="index, follow"')],
    ["rendered-h1-count", hubHtml.replace("</body>", "<h1>Second heading</h1></body>")],
    ["rendered-broken-link", hubHtml.replace('href="/#tender"', 'href="/draft"')],
    ["rendered-broken-fragment", hubHtml.replace('href="/#tender"', 'href="/#missing"')],
    ["rendered-missing-image", hubHtml.replace('src="/tilespec-logo-animated.svg"', 'src="/missing.svg"')],
    ["rendered-image-alt", hubHtml.replace('alt="TileSPEC"', "")],
  ]) {
    assert.ok(checkRenderedSeo([home, hub], new Map([["/", homeHtml], [hub.path, mutated]]), preview, assets).some(issue => issue.code === code));
  }
  assert.ok(checkRenderedSeo([home, hub], new Map([["/", html(home, "")], [hub.path, hubHtml]]), preview, assets).some(issue => issue.code === "rendered-orphan-page"));
});

test("approved homepage line breaks, emphasis and entities preserve the H1 match", () => {
  const home = { ...seoPages.find(entry => entry.path === "/")!, children: [] };
  const html = `<html><head><title>${home.title}</title><meta name="description" content="${home.description}"><meta name="robots" content="noindex, follow"><link rel="canonical" href="${canonicalUrl(home.path, preview)}"></head><body><h1>COMMERCIAL<br/>WALL &amp; FLOOR<br/><em>TILING.</em></h1></body></html>`;
  assert.deepEqual(checkRenderedSeo([home], new Map([["/", html]]), preview, new Set()), []);
});
