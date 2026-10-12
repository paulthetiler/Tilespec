import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { readSeoConfig } from "../../lib/seo/config";
import { seoPages } from "../../lib/seo/registry";
import type { SeoPage } from "../../lib/seo/types";

// Registry drafts reserve future slugs without publishing empty pages.
const pages = seoPages.filter(entry => entry.publicationStatus !== "draft");
const pageByPath = new Map(pages.map(entry => [entry.path, entry]));
const canonicalOrigin = readSeoConfig().canonicalOrigin ?? "https://tilespec.uk";
// Next's trailingSlash:false metadata emits the root without its optional
// slash. Assert the public URL policy explicitly rather than importing the
// implementation being verified.
const canonical = (path: string) => path === "/" ? canonicalOrigin : new URL(path, canonicalOrigin).href;
const navLabels = ["Expertise", "Our approach", "Projects", "About"];
const approvedPhotoHost = "wxxxgqi56ekoi5vz.public.blob.vercel-storage.com";
const screenshotPages = new Set([
  "/", "/commercial-tiling", "/services/commercial-floor-tiling",
  "/industries/retail-showrooms", "/locations/north-west",
  "/locations/north-west/manchester",
]);
const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

async function readyForLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll<HTMLImageElement>("img").forEach(image => { image.loading = "eager"; });
    // Approved homepage photographs also appear as CSS backgrounds.
    const urls = [...document.querySelectorAll<HTMLElement>("[class]")].flatMap(element =>
      [...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]),
    ).filter(url => url.includes("wxxxgqi56ekoi5vz.public.blob.vercel-storage.com"));
    await Promise.all([...new Set(urls)].map(url => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Approved background image failed: ${url}`));
      image.src = url;
    })));
  });
  const images = page.locator(`img[src^="/"], img[src*="${approvedPhotoHost}"]`);
  await expect.poll(async () => images.evaluateAll(elements => elements.every(element => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0;
  })), { message: "Approved TileSPEC logo and architectural images must load", timeout: 45_000 }).toBe(true);
}

async function readyForScreenshot(page: Page) {
  // The original external SVG finishes its entrance at 2.27s. Download
  // completion alone does not capture the approved wordmark fully rendered.
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => [...document.images].every(image => image.complete), undefined, { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

async function layoutIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push("Document has horizontal overflow");
    if (document.body.scrollWidth > window.innerWidth + 1) issues.push("Body has horizontal overflow");
    if (issues.length) {
      const offenders = [...document.querySelectorAll<HTMLElement>("body *")].filter(element => {
        if (element.closest(".service-grid, .brand-experience-mobile-track, [aria-hidden='true']")) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
      }).slice(0, 8);
      for (const element of offenders) {
        const rect = element.getBoundingClientRect();
        issues.push(`Offscreen ${element.tagName.toLowerCase()}.${element.className}: left ${Math.round(rect.left)}, right ${Math.round(rect.right)}`);
      }
    }
    const heading = document.querySelector("h1")!;
    const hero = heading.closest("section")!.getBoundingClientRect();
    const headingWalker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = headingWalker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.left < Math.max(0, hero.left) - 1 || rect.right > Math.min(window.innerWidth, hero.right) + 1 || rect.top < hero.top - 1 || rect.bottom > hero.bottom + 1) {
          issues.push(`H1 text clipped outside hero: ${node.textContent}`);
        }
      }
    }
    for (const shell of document.querySelectorAll(".shell")) {
      const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement!;
        if (parent.closest("script, style, [aria-hidden='true']")) continue;
        // The approved homepage deliberately scrolls its services rail on
        // phones. Validate document width while allowing scrollable content.
        let ancestor: Element | null = parent;
        let inScroller = false;
        while (ancestor && ancestor !== shell) {
          if (["auto", "scroll"].includes(getComputedStyle(ancestor).overflowX)) { inScroller = true; break; }
          ancestor = ancestor.parentElement;
        }
        if (inScroller) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width && (rect.left < -1 || rect.right > window.innerWidth + 1)) {
            issues.push(`Visible text extends beyond viewport: ${node.textContent?.trim().slice(0, 100)}`);
            break;
          }
        }
      }
    }
    return [...new Set(issues)];
  });
}

function ancestors(entry: SeoPage): SeoPage[] {
  const result: SeoPage[] = [];
  let parent = entry.parent;
  while (parent) {
    const previous = pageByPath.get(parent);
    if (!previous) throw new Error(`Missing routable breadcrumb ancestor ${parent}`);
    result.unshift(previous);
    parent = previous.parent;
  }
  return result;
}

test("all launch pages retain branding, metadata, accessible links and responsive layouts", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrated|did not match/i.test(message.text())) browserErrors.push(message.text());
  });
  const fragments = new Map<string, Set<string>>();
  const linksByPath = new Map<string, string[]>();
  const titles: string[] = [];
  const descriptions: string[] = [];
  const headings: string[] = [];
  const imageHealth: Record<string, unknown> = {};
  let referenceBranding: unknown;
  await mkdir("test-results/seo", { recursive: true });
  expect(pages).toHaveLength(14);

  for (const entry of pages) {
    await test.step(`${testInfo.project.name}: ${entry.path}`, async () => {
      const response = await page.goto(entry.path);
      expect(response?.status(), entry.path).toBe(200);
      expect(response?.headers()["x-robots-tag"]).toContain("noindex");
      await readyForLayout(page);
      await expect(page).toHaveTitle(entry.title);
      titles.push(await page.title());
      await expect(page.locator("h1")).toHaveCount(1);
      const heading = normalise(await page.locator("h1").innerText());
      expect(heading.toUpperCase()).toBe(normalise(entry.h1).toUpperCase());
      headings.push(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('meta[name="description"]')).toHaveCount(1);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", entry.description);
      descriptions.push(entry.description);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical(entry.path));
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonical(entry.path));
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", entry.title);
      await expect(page.getByText(entry.intro, { exact: true }).first()).toBeVisible();

      for (const scope of ["header", "footer"]) {
        await expect(page.locator(`${scope} .brand img`)).toHaveCount(1);
        await expect(page.locator(`${scope} .brand img`)).toHaveAttribute("src", "/tilespec-logo-animated.svg");
        await expect(page.locator(`${scope} .brand img`)).toHaveAttribute("alt", "TileSPEC Commercial Tiling");
      }
      await expect(page.locator('nav[aria-label="Main navigation"] > a:not(.mobile-cta)')).toHaveText(navLabels);
      const branding = await page.evaluate(() => {
        const header = document.querySelector("header")!;
        const footer = document.querySelector("footer")!;
        const link = header.querySelector("nav a")!;
        const logo = header.querySelector("img")!.getBoundingClientRect();
        return {
          headerBackground: getComputedStyle(header).backgroundColor,
          footerBackground: getComputedStyle(footer).backgroundColor,
          navFont: getComputedStyle(link).fontFamily,
          navWeight: getComputedStyle(link).fontWeight,
          logoWidth: logo.width,
          headerHeight: header.getBoundingClientRect().height,
          headingFont: getComputedStyle(document.querySelector("h1")!).fontFamily,
          footerText: footer.textContent?.replace(/\s+/g, " ").trim(),
        };
      });
      if (entry.path === "/") referenceBranding = branding;
      else {
        expect(branding).toEqual(referenceBranding);
        const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(text => {
          const parsed = JSON.parse(text);
          return parsed["@graph"] ?? [parsed];
        });
        const organisation = schemas.find(schema => schema["@type"] === "Organization");
        const service = schemas.find(schema => schema["@type"] === "Service");
        const breadcrumb = schemas.find(schema => schema["@type"] === "BreadcrumbList");
        expect(organisation?.name).toBe("TileSPEC");
        expect(organisation?.url).toBe(`${canonicalOrigin}/`);
        expect(organisation?.logo).toBe(canonical("/tilespec-logo-animated.svg"));
        if (["national", "service"].includes(entry.category)) {
          expect(service?.url).toBe(canonical(entry.path));
          expect(service?.description).toBe(entry.description);
          expect(service?.provider?.name).toBe("TileSPEC");
        } else {
          expect(service, "Industry and coverage information should not claim a separate service").toBeUndefined();
        }
        const ancestry = [...ancestors(entry), entry];
        expect(breadcrumb?.itemListElement.map((item: { item: string; position: number }) => ({ item: item.item, position: item.position })))
          .toEqual(ancestry.map((item, index) => ({ item: canonical(item.path), position: index + 1 })));
        const breadcrumbNav = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
        await expect(breadcrumbNav).toBeVisible();
        expect(await breadcrumbNav.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href"))))
          .toEqual(ancestors(entry).map(item => item.path));
        await expect(breadcrumbNav.locator('[aria-current="page"]')).toHaveCount(1);
        const body = normalise(await page.locator("body").innerText());
        for (const section of entry.sections) {
          for (const paragraph of section.paragraphs) expect(body, `${entry.path}: missing original copy in ${section.id}`).toContain(normalise(paragraph));
        }
      }

      const links = await page.locator("a[href]").evaluateAll(elements => elements.map(element => element.getAttribute("href")!));
      linksByPath.set(entry.path, links);
      fragments.set(entry.path, new Set(await page.locator("[id]").evaluateAll(elements => elements.map(element => element.id))));
      const destinations = new Set(links.filter(href => href.startsWith("/")).map(href => new URL(href, page.url()).pathname));
      for (const related of [...entry.children, ...entry.relatedServices, ...entry.relatedIndustries, ...entry.relatedLocations, ...(entry.parent ? [entry.parent] : [])]) {
        expect(destinations.has(related), `${entry.path} must link to ${related}`).toBe(true);
      }
      for (const image of entry.images) {
        expect(image.alt.trim().length).toBeGreaterThan(15);
        await expect(page.getByAltText(image.alt, { exact: true }).first()).toBeVisible();
      }
      const enquiryLink = page.locator(`.hero-actions a[href="${entry.path === "/" ? "#tender" : "/#tender"}"]`).first();
      await expect(enquiryLink).toBeVisible();
      expect(await layoutIssues(page), entry.path).toEqual([]);

      if ((page.viewportSize()?.width ?? 1440) <= 760) {
        const button = page.getByRole("button", { name: "Open menu" });
        await button.click();
        await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("link", { name: "Expertise", exact: true }).first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toBeFocused();
        const prefix = entry.path === "/" ? "" : "/";
        expect(await page.locator('nav[aria-label="Main navigation"] a').evaluateAll(elements => elements.map(element => element.getAttribute("href"))))
          .toEqual(["expertise", "approach", "projects", "about", "tender"].map(id => `${prefix}#${id}`));
      }
      expect(browserErrors, entry.path).toEqual([]);

      if (screenshotPages.has(entry.path)) {
        await readyForScreenshot(page);
        const name = entry.path === "/" ? "homepage" : entry.path.slice(1).replaceAll("/", "-");
        const imagePrefix = `test-results/seo/${testInfo.project.name}-${name}`;
        const fullPage = await page.screenshot({ path: `${imagePrefix}.png`, fullPage: true, animations: "disabled" });
        // A previous 320px capture exposed an extra 20px despite the root
        // scrollWidth check. Verify actual PNG dimensions and post-capture
        // layout so clipping or resize side effects cannot hide overflow.
        expect(fullPage.readUInt32BE(16), `${entry.path}: full-page image exceeds viewport width`).toBe(page.viewportSize()!.width);
        expect(await layoutIssues(page), `${entry.path}: post-capture layout`).toEqual([]);
        await page.screenshot({ path: `${imagePrefix}-viewport.png`, animations: "disabled" });
        await testInfo.attach(`${name} full page`, { path: `${imagePrefix}.png`, contentType: "image/png" });
        await testInfo.attach(`${name} viewport`, { path: `${imagePrefix}-viewport.png`, contentType: "image/png" });
      }
      imageHealth[entry.path] = await page.locator("img").evaluateAll(elements => elements.map(element => {
        const image = element as HTMLImageElement;
        return { src: image.currentSrc || image.src, alt: image.alt, complete: image.complete, naturalWidth: image.naturalWidth, broken: image.complete && image.naturalWidth === 0 };
      }));
      // Third-party brand logo failures must be visible in the report even
      // when an approved photo/logo gate has already passed.
      await writeFile(`test-results/seo/${testInfo.project.name}-image-health.json`, JSON.stringify(imageHealth, null, 2));
    });
  }

  for (const [source, links] of linksByPath) {
    for (const href of links.filter(href => href.startsWith("/") || href.startsWith("#") || href.startsWith(canonicalOrigin + "/"))) {
      const destination = new URL(href, canonical(source));
      expect(pageByPath.has(destination.pathname), `${source} has a broken internal link: ${href}`).toBe(true);
      if (destination.hash) expect(fragments.get(destination.pathname)?.has(decodeURIComponent(destination.hash.slice(1))), `${source} has a broken fragment: ${href}`).toBe(true);
    }
  }
  // Follow ordinary links actually rendered by the site, rather than assuming
  // declared relationships have been included by every page composition.
  const reachable = new Set(["/"]);
  const queue = ["/"];
  while (queue.length) {
    const source = queue.shift()!;
    for (const href of linksByPath.get(source) ?? []) {
      if (!href.startsWith("/") && !href.startsWith(canonicalOrigin + "/")) continue;
      const destination = new URL(href, canonical(source)).pathname;
      if (!reachable.has(destination)) { reachable.add(destination); queue.push(destination); }
    }
  }
  expect(pages.filter(entry => !reachable.has(entry.path)).map(entry => entry.path), "Rendered HTML contains orphan pages").toEqual([]);
  expect(new Set(titles).size).toBe(pages.length);
  expect(new Set(descriptions).size).toBe(pages.length);
  expect(new Set(headings).size).toBe(pages.length);
  await writeFile(`test-results/seo/${testInfo.project.name}-page-graph.json`, JSON.stringify(Object.fromEntries(linksByPath), null, 2));
});

test("preview routing keeps all pages noindex, queries canonical and draft expansions unavailable", async ({ request, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Route behaviour is independent of viewport");
  for (const entry of pages) {
    if (entry.path !== "/") {
      const slash = await request.get(`${entry.path}/`, { maxRedirects: 0 });
      expect(slash.status(), entry.path).toBe(308);
      expect(new URL(slash.headers().location, "http://127.0.0.1:3104").pathname).toBe(entry.path);
    }
    const query = await request.get(`${entry.path}?utm_source=qa`);
    expect(query.status(), entry.path).toBe(200);
    expect(query.headers()["x-robots-tag"]).toContain("noindex");
    expect(await query.text()).toContain(`<link rel="canonical" href="${canonical(entry.path)}"`);
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["x-robots-tag"]).toContain("noindex");
  expect(await sitemap.text()).not.toContain("<loc>");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotRules = await robots.text();
  expect(robotRules).toContain("User-Agent: *");
  expect(robotRules).toContain("Allow: /");
  for (const privatePath of ["/admin", "/auth", "/login", "/api"]) expect(robotRules).toContain(`Disallow: ${privatePath}`);
  expect(robotRules).not.toContain("Sitemap:");
  const unpublished = new Set([
    ...seoPages.filter(entry => entry.publicationStatus === "draft").map(entry => entry.path),
    "/locations/yorkshire", "/locations/west-midlands", "/locations/london", "/does-not-exist",
  ]);
  for (const path of unpublished) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
  const missing = await page.goto("/does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "RETURN TO TILESPEC" })).toHaveAttribute("href", "/");
});

test("navigation and tender form prepare an accurate TileSpec email", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/commercial-tiling");
  const mobile = (page.viewportSize()?.width ?? 1440) <= 760;
  if (mobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator('nav[aria-label="Main navigation"] a[href="/#tender"]').click();
  } else {
    await page.locator('header a[href="/#tender"].nav-cta').click();
  }
  await expect(page).toHaveURL(/\/#tender$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#tender")).toBeInViewport();

  const session = await context.newCDPSession(page);
  await session.send("Page.enable");
  let preparedMailto = "";
  session.on("Page.frameRequestedNavigation", event => {
    if (event.url.startsWith("mailto:")) preparedMailto = event.url;
  });
  // Native required fields prevent an empty form from handing off to email.
  await page.getByRole("button", { name: "PREPARE EMAIL ENQUIRY" }).click();
  expect(preparedMailto).toBe("");
  expect(await page.locator(".tender-form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  await page.getByLabel("Your name *", { exact: true }).fill("QA Tender Contact");
  await page.getByLabel("Company", { exact: true }).fill("QA Main Contractor");
  await page.getByLabel("Email address *", { exact: true }).fill("tender@example.com");
  await page.getByLabel("Project location", { exact: true }).fill("Manchester M1");
  await page.getByLabel("Project name / reference", { exact: true }).fill("Retail refurbishment QA");
  await page.getByLabel("Tell us about the project *", { exact: true }).fill("120m² porcelain floor. Review substrate preparation, phased access and tender return dates.");
  await page.getByRole("button", { name: "PREPARE EMAIL ENQUIRY" }).click();
  await expect.poll(() => preparedMailto, { message: "Actual form submission must prepare an email to the TileSpec mailbox" }).toMatch(/^mailto:info@tilespec\.uk\?/);
  const email = new URL(preparedMailto);
  expect(email.pathname).toBe("info@tilespec.uk");
  expect(email.searchParams.get("subject")).toBe("TileSPEC tender enquiry — Retail refurbishment QA");
  const body = email.searchParams.get("body")!;
  for (const detail of ["QA Tender Contact", "QA Main Contractor", "tender@example.com", "Manchester M1", "Retail refurbishment QA", "120m² porcelain floor", "securely sending tender drawings"]) expect(body).toContain(detail);
  await expect(page.locator(".tender-form small")).toContainText("Please press Send there to submit it.");
  expect(errors).toEqual([]);
  await session.detach();
});
