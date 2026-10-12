import { canonicalUrl, isCanonicalPath, readSeoConfig, type SeoConfig } from "./config";
import type { SeoPage } from "./types";

export interface SeoIssue {
  severity: "error" | "warning";
  code: string;
  paths: string[];
  message: string;
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const paragraphs = (page: SeoPage) => [page.intro, ...page.sections.flatMap(section => section.paragraphs)].filter(Boolean);
const body = (page: SeoPage) => paragraphs(page).join(" ");

/** Shingle overlap is an editorial signal, never a claimed ranking formula. */
export function contentSimilarity(first: string, second: string): number {
  function shingles(value: string): Set<string> {
    const words = normalise(value).split(" ").filter(Boolean);
    if (words.length < 5) return new Set(words.length ? [words.join(" ")] : []);
    return new Set(words.slice(0, -4).map((_, index) => words.slice(index, index + 5).join(" ")));
  }
  const left = shingles(first);
  const right = shingles(second);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter(shingle => right.has(shingle)).length;
  return intersection / (left.size + right.size - intersection);
}

function maskLocations(value: string, pages: readonly SeoPage[]): string {
  const locations = new Set([
    "warrington", "manchester", "liverpool", "chester", "preston", "leeds", "sheffield",
    "birmingham", "nottingham", "newcastle", "bristol", "london", "cheshire",
    "north west england", "yorkshire and the humber", "west midlands", "east midlands",
    "north east england", "south west england", "south east england", "greater london", "east of england",
    ...pages.filter(page => ["location", "city", "region"].includes(page.category))
      .map(page => page.path.split("/").at(-1)!.replace(/-/g, " ")),
  ]);
  return normalise(value).replace(new RegExp(`\\b(?:${[...locations].sort((a, b) => b.length - a.length).join("|")})\\b`, "g"), "location");
}

export function pageLinks(page: SeoPage): string[] {
  const hrefs = [
    ...(page.parent ? [page.parent] : []),
    ...page.children,
    ...page.relatedServices,
    ...page.relatedIndustries,
    ...page.relatedLocations,
    ...page.sections.flatMap(section => section.links?.map(link => link.href) ?? []),
  ];
  return [...new Set(hrefs.flatMap(href => {
    try {
      const url = new URL(href, `https://registry-check.invalid${page.path}`);
      return url.origin === "https://registry-check.invalid" ? [url.pathname] : [];
    } catch { return [href]; }
  }))];
}

/** Validate every review/approved page, even while a production gate hides review content. */
export function checkSeoPages(pages: readonly SeoPage[], config: SeoConfig = readSeoConfig()): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const report = (severity: SeoIssue["severity"], code: string, paths: string[], message: string) => {
    issues.push({ severity, code, paths, message });
  };
  const active = pages.filter(page => page.publicationStatus !== "draft");
  const activePaths = new Set(active.map(page => page.path));
  const allPaths = new Set(pages.map(page => page.path));

  for (const page of pages) {
    if (!isCanonicalPath(page.path)) report("error", "invalid-slug", [page.path], "Use a unique root-relative path without trailing slash, query or fragment.");
    if (pages.filter(other => other.path === page.path).length > 1 && !issues.some(issue => issue.code === "duplicate-slug" && issue.paths[0] === page.path)) {
      report("error", "duplicate-slug", [page.path], "Duplicate registry URL.");
    }
    if (page.indexingStatus === "index" && page.publicationStatus !== "approved") {
      report("error", "unapproved-indexing", [page.path], "Only explicitly approved pages may request indexing.");
    }
    if (page.publicationStatus === "draft") continue;
    for (const field of ["title", "description", "h1", "intent", "intro"] as const) {
      if (!page[field]?.trim()) report("error", "missing-content", [page.path], `Missing required ${field}.`);
    }
    if (page.path !== "/" && !page.sections.length) report("error", "missing-sections", [page.path], "An internal page needs useful supporting content.");
    if (isCanonicalPath(page.path) && !canonicalUrl(page.path, config)) {
      report("error", "missing-canonical", [page.path], "Every review or approved public page needs a self-referencing absolute canonical.");
    }
    if (page.path !== "/" && !page.parent) report("error", "missing-parent", [page.path], "An internal page needs its actual parent hub.");
    if (page.parent && !activePaths.has(page.parent)) report("error", "unavailable-parent", [page.path, page.parent], "Breadcrumb parent must be available for review/publication.");
    for (const destination of [...page.children, ...page.relatedServices, ...page.relatedIndustries, ...page.relatedLocations]) {
      if (!isCanonicalPath(destination)) report("error", "invalid-registry-link", [page.path, destination], "Registry relationships must use clean canonical paths; section links can target fragments.");
    }
    const ancestors = new Set([page.path]);
    let parent = page.parent;
    while (parent) {
      if (ancestors.has(parent)) { report("error", "parent-cycle", [page.path, parent], "Breadcrumb hierarchy contains a cycle."); break; }
      ancestors.add(parent);
      parent = pages.find(candidate => candidate.path === parent)?.parent;
    }
    for (const href of pageLinks(page)) {
      if (!allPaths.has(href)) report("error", "broken-link", [page.path, href], "Registry link has no destination.");
      else if (!activePaths.has(href)) report("error", "draft-link", [page.path, href], "Do not link to an unpublished draft.");
      else if (page.publicationStatus === "approved" && pages.find(other => other.path === href)?.publicationStatus === "review") {
        // Preview-only navigation is filtered by the renderers. Editorial links
        // from approved copy cannot depend on a route absent in production.
        if (!page.children.includes(href)) report("error", "production-unavailable-link", [page.path, href], "Approved content links to a page still under review.");
      }
    }
  }

  for (let index = 0; index < active.length; index += 1) {
    const page = active[index];
    for (const other of active.slice(index + 1)) {
      for (const field of ["title", "description", "h1", "intro"] as const) {
        if (normalise(page[field]) && normalise(page[field]) === normalise(other[field])) {
          report("error", `duplicate-${field}`, [page.path, other.path], `Identical ${field} after punctuation/case normalisation.`);
        }
      }
      if (normalise(page.intent) === normalise(other.intent)) report("warning", "overlapping-intent", [page.path, other.path], "Review whether these pages serve distinct search intent.");
      const copy = body(page);
      const otherCopy = body(other);
      if (normalise(copy) && normalise(copy) === normalise(otherCopy)) {
        report("error", "duplicate-body", [page.path, other.path], "Identical body copy must be rewritten before publication.");
      } else if (maskLocations(copy, pages) === maskLocations(otherCopy, pages) && normalise(copy)) {
        report("error", "location-only-copy", [page.path, other.path], "Copy differs only by location names.");
      } else {
        const similarity = contentSimilarity(copy, otherCopy);
        const maskedSimilarity = contentSimilarity(maskLocations(copy, pages), maskLocations(otherCopy, pages));
        if (maskedSimilarity >= 0.9 && similarity >= 0.6 && maskedSimilarity > similarity + 0.05) report("error", "location-template-copy", [page.path, other.path], "Near-identical copy after location masking needs original information.");
        else if (similarity >= 0.65) report("warning", "similar-body", [page.path, other.path], `Body shingle overlap ${(similarity * 100).toFixed(0)}%; editorial review required.`);
      }
      const repeated = paragraphs(page).filter(paragraph => normalise(paragraph).split(" ").length >= 15 && paragraphs(other).some(candidate => normalise(candidate) === normalise(paragraph)));
      if (repeated.length >= 2 || repeated.join(" ").length > Math.min(copy.length, otherCopy.length) * 0.4) {
        report("warning", "template-repetition", [page.path, other.path], "Substantial repeated paragraphs; review template repetition.");
      }
    }
  }

  // Traverse real outgoing links from the homepage, not breadcrumb ancestry.
  const visited = new Set<string>();
  const queue = activePaths.has("/") ? ["/"] : [];
  while (queue.length) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const page = active.find(candidate => candidate.path === path)!;
    queue.push(...pageLinks(page).filter(href => activePaths.has(href) && !visited.has(href)));
  }
  for (const page of active) {
    if (!visited.has(page.path)) report("error", "orphan-page", [page.path], "Page has no ordinary link path from the homepage.");
  }
  return issues;
}
