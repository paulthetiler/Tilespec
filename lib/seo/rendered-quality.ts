import { canonicalUrl, isPageIndexable, isPageRoutable, type SeoConfig } from "./config";
import type { SeoPage } from "./types";
import type { SeoIssue } from "./quality";

const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const plainText = (value: string) => decode(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)].map(match => [match[1].toLowerCase(), decode(match[2])]));
}

export function checkRenderedSeo(pages: readonly SeoPage[], htmlByPath: ReadonlyMap<string, string>, config: SeoConfig, localAssets: ReadonlySet<string>): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const error = (code: string, paths: string[], message: string) => issues.push({ severity: "error", code, paths, message } as SeoIssue);
  const routable = pages.filter(page => isPageRoutable(page, config));
  const paths = new Set(routable.map(page => page.path));
  const idsByPath = new Map([...htmlByPath].map(([path, html]) => [path, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => decode(match[1])))]));
  const actualLinks = new Map<string, string[]>();

  for (const page of routable) {
    const html = htmlByPath.get(page.path);
    if (!html) { error("missing-rendered-page", [page.path], "Public route was not prerendered; inspect its build output."); continue; }
    const headings = [...html.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi)];
    if (headings.length !== 1) error("rendered-h1-count", [page.path], `Expected one H1; rendered ${headings.length}.`);
    else if (plainText(headings[0][1]).toLowerCase() !== page.h1.toLowerCase()) error("rendered-h1-mismatch", [page.path], "Visible H1 differs from the reviewed registry content.");
    const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
    if (titles.length !== 1 || plainText(titles[0]?.[1] ?? "") !== page.title) error("rendered-title", [page.path], "Rendered title must match its unique registry title.");
    const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
    const descriptions = meta.filter(tag => tag.name === "description");
    if (descriptions.length !== 1 || descriptions[0].content !== page.description) error("rendered-description", [page.path], "Rendered description must match the reviewed registry description.");
    const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0])).filter(tag => tag.rel === "canonical");
    const expected = canonicalUrl(page.path, config);
    if (expected ? canonicals.length !== 1 || canonicals[0].href !== expected : canonicals.length !== 0) error("rendered-canonical", [page.path], `Expected one self-referencing canonical ${expected ?? "(none)"}; received ${JSON.stringify(canonicals.map(tag => tag.href))}.`);
    const robots = meta.filter(tag => tag.name === "robots");
    const hasNoindex = robots.some(tag => /\bnoindex\b/i.test(tag.content ?? ""));
    const hasIndex = robots.some(tag => /(?:^|[,\s])index(?:$|[,\s])/i.test(tag.content ?? ""));
    if (robots.length !== 1 || (isPageIndexable(page, config) ? hasNoindex || !hasIndex : !hasNoindex || hasIndex)) error("rendered-indexing", [page.path], "Rendered robots directive must be unique and match publication/environment gates.");
    const googleBot = meta.filter(tag => tag.name === "googlebot");
    if (googleBot.some(tag => isPageIndexable(page, config) ? /\bnoindex\b/i.test(tag.content ?? "") : !/\bnoindex\b/i.test(tag.content ?? ""))) error("rendered-googlebot-indexing", [page.path], "Googlebot indexing must agree with the page's release gates.");
    for (const [property, content] of [["og:url", expected], ["og:title", page.title], ["og:description", page.description]] as const) {
      const values = meta.filter(tag => tag.property === property);
      if (content ? values.length !== 1 || values[0].content !== content : values.length !== 0) error("rendered-open-graph", [page.path], `Expected ${property} ${content ?? "(none)"}; received ${JSON.stringify(values.map(tag => tag.content))}.`);
    }
    let headingLevel = 0;
    for (const heading of html.matchAll(/<h([1-6])(?:\s[^>]*)?>/gi)) {
      const level = Number(heading[1]);
      if (level > headingLevel + 1) error("rendered-heading-order", [page.path], `Heading hierarchy skips from H${headingLevel} to H${level}.`);
      headingLevel = level;
    }
    const schema: Record<string, unknown>[] = [];
    for (const script of [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]) {
      try {
        const value: unknown = JSON.parse(script[1]);
        const records = Array.isArray(value) ? value : [value];
        for (const record of records) {
          if (!record || typeof record !== "object") { error("rendered-schema-json", [page.path], "Structured data must contain an object, not an empty value."); continue; }
          const item = record as Record<string, unknown>;
          if (Array.isArray(item["@graph"])) schema.push(...item["@graph"] as Record<string, unknown>[]);
          else schema.push(item);
        }
      } catch { error("rendered-schema-json", [page.path], "Structured data contains invalid JSON."); }
    }
    const organisation = schema.filter(entry => entry["@type"] === "Organization");
    if (organisation.length !== 1 || organisation[0].name !== "TileSPEC" || organisation[0].url !== `${config.canonicalOrigin}/` || organisation[0]["@id"] !== `${config.canonicalOrigin}/#organisation` || organisation[0].logo !== `${config.canonicalOrigin}/tilespec-logo-animated.svg`) error("rendered-organisation-schema", [page.path], "Organization schema must reference the approved TileSPEC identity and production origin.");
    if (page.parent) {
      const ancestors: SeoPage[] = [];
      const seen = new Set([page.path]);
      let parent: string | undefined = page.parent;
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const entry = pages.find(candidate => candidate.path === parent);
        if (!entry) break;
        ancestors.unshift(entry);
        parent = entry.parent;
      }
      const breadcrumbs = schema.filter(entry => entry["@type"] === "BreadcrumbList");
      const expectedItems = [...ancestors, page].map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: entry.path === "/" ? "Home" : entry.h1, item: canonicalUrl(entry.path, config) }));
      if (breadcrumbs.length !== 1 || JSON.stringify(breadcrumbs[0].itemListElement) !== JSON.stringify(expectedItems)) error("rendered-breadcrumb-schema", [page.path], "Breadcrumb schema must describe the actual registry hierarchy with production canonical URLs.");
    }
    const services = schema.filter(entry => entry["@type"] === "Service");
    if (page.category === "national" || page.category === "service") {
      const provider = services[0]?.provider as Record<string, unknown> | undefined;
      if (services.length !== 1 || services[0].url !== expected || services[0].name !== page.h1 || services[0].description !== page.description || provider?.["@id"] !== `${config.canonicalOrigin}/#organisation`) error("rendered-service-schema", [page.path], "Service schema must reflect the visible service page and its real provider.");
    } else if (services.length) error("rendered-service-schema", [page.path], "Industry and location information pages must not invent a separate service entity.");
    const outgoing: string[] = [];
    for (const tag of [...html.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]))) {
      const href = tag.href;
      if (!href || /^(?:mailto:|tel:)/i.test(href)) continue;
      let url: URL;
      try { url = new URL(href, `https://render-check.invalid${page.path}`); } catch { error("rendered-link-invalid", [page.path, href], "Invalid internal link."); continue; }
      if (url.origin !== "https://render-check.invalid" && url.origin !== config.canonicalOrigin) {
        if (href.startsWith("//")) error("rendered-link-invalid", [page.path, href], "Use an explicit protocol for external links.");
        continue;
      }
      const destination = url.pathname;
      if (/^\/(?:admin|auth|api)(?:\/|$)/.test(destination) || ["/login", "/robots.txt", "/sitemap.xml"].includes(destination)) continue;
      if (!paths.has(destination)) { error("rendered-broken-link", [page.path, href], "Ordinary HTML link has no routable public destination."); continue; }
      outgoing.push(destination);
      if (url.hash && !idsByPath.get(destination)?.has(decodeURIComponent(url.hash.slice(1)))) error("rendered-broken-fragment", [page.path, href], "Link fragment does not identify a section on the destination.");
    }
    actualLinks.set(page.path, outgoing);
    for (const tag of [...html.matchAll(/<img\b[^>]*>/gi)].map(match => attributes(match[0]))) {
      const src = tag.src;
      const imageSource = src?.startsWith("/_next/image?") ? new URL(src, "https://render-check.invalid").searchParams.get("url") : src;
      if (imageSource?.startsWith("/") && !localAssets.has(imageSource.split("?")[0])) error("rendered-missing-image", [page.path, imageSource], "Local image asset does not exist.");
      if (!("alt" in tag)) error("rendered-image-alt", [page.path, src ?? "unknown"], "Image needs an alt attribute, including empty alt for decoration.");
    }
  }
  const visited = new Set<string>();
  const queue = paths.has("/") ? ["/"] : [];
  while (queue.length) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    queue.push(...(actualLinks.get(path) ?? []));
  }
  for (const page of routable) if (!visited.has(page.path)) error("rendered-orphan-page", [page.path], "No ordinary HTML link reaches this page from the homepage.");
  return issues;
}
