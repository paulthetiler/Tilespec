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
    if (expected ? canonicals.length !== 1 || canonicals[0].href !== expected : canonicals.length !== 0) error("rendered-canonical", [page.path], "Canonical must be unique, absolute and self-referencing when the production origin is confirmed.");
    const robots = meta.filter(tag => tag.name === "robots");
    const hasNoindex = robots.some(tag => /\bnoindex\b/i.test(tag.content ?? ""));
    if (isPageIndexable(page, config) ? hasNoindex : !hasNoindex) error("rendered-indexing", [page.path], "Rendered robots directive does not match publication/environment gates.");
    for (const script of [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]) {
      try { JSON.parse(script[1]); } catch { error("rendered-schema-json", [page.path], "Structured data contains invalid JSON."); }
    }
    const outgoing: string[] = [];
    for (const tag of [...html.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]))) {
      const href = tag.href;
      if (!href || /^(?:https?:|mailto:|tel:)/i.test(href)) continue;
      let url: URL;
      try { url = new URL(href, `https://render-check.invalid${page.path}`); } catch { error("rendered-link-invalid", [page.path, href], "Invalid internal link."); continue; }
      if (url.origin !== "https://render-check.invalid") { error("rendered-link-invalid", [page.path, href], "Unexpected protocol-relative internal link."); continue; }
      const destination = url.pathname;
      if (/^\/(?:admin|auth|api)(?:\/|$)/.test(destination) || ["/login", "/robots.txt", "/sitemap.xml"].includes(destination)) continue;
      if (!paths.has(destination)) { error("rendered-broken-link", [page.path, href], "Ordinary HTML link has no routable public destination."); continue; }
      outgoing.push(destination);
      if (url.hash && !idsByPath.get(destination)?.has(decodeURIComponent(url.hash.slice(1)))) error("rendered-broken-fragment", [page.path, href], "Link fragment does not identify a section on the destination.");
    }
    actualLinks.set(page.path, outgoing);
    for (const tag of [...html.matchAll(/<img\b[^>]*>/gi)].map(match => attributes(match[0]))) {
      const src = tag.src;
      if (src?.startsWith("/") && !src.startsWith("/_next/image") && !localAssets.has(src.split("?")[0])) error("rendered-missing-image", [page.path, src], "Local image asset does not exist.");
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
