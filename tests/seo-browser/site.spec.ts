import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  { path: "/", name: "homepage", title: "TileSPEC | Commercial Tiling Contractors", h1: "COMMERCIAL WALL & FLOOR TILING." },
  { path: "/commercial-tiling", name: "commercial-tiling", title: "Commercial Tiling Contractors | UK Project Enquiries | TileSPEC", h1: "COMMERCIAL TILING CONTRACTORS." },
] as const;
const navLabels = ["Expertise", "Our approach", "Projects", "About"];
const approvedPhotoHost = "wxxxgqi56ekoi5vz.public.blob.vercel-storage.com";

async function readyForScreenshot(page: Page, hub: boolean) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Fetch below-the-fold approved photographs before the full-page capture.
    document.querySelectorAll<HTMLImageElement>("img").forEach(image => { image.loading = "eager"; });
  });
  const images = hub ? page.locator("img") : page.locator(`img[src="/tilespec-logo-animated.svg"], img[src*="${approvedPhotoHost}"]`);
  await expect.poll(async () => images.evaluateAll(elements => elements.every(element => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0;
  })), { message: "Approved logo and architectural images must load successfully", timeout: 45_000 }).toBe(true);
  // Brand logos are third-party requests on the unchanged homepage. Wait for
  // completion where possible, but do not make their availability a test gate.
  await page.waitForFunction(() => [...document.images].every(image => image.complete), undefined, { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

async function layoutIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push("Document has horizontal overflow");
    const heading = document.querySelector("h1")!;
    const hero = heading.closest("section")!.getBoundingClientRect();
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.left < Math.max(0, hero.left) - 1 || rect.right > Math.min(window.innerWidth, hero.right) + 1 || rect.top < hero.top - 1 || rect.bottom > hero.bottom + 1) {
          issues.push(`H1 text clipped outside hero: ${node.textContent}`);
        }
      }
    }
    return issues;
  });
}

test("approved branding, responsive navigation, metadata and review screenshots", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrated|did not match/i.test(message.text())) browserErrors.push(message.text());
  });
  const homeFragments = new Set<string>();
  let referenceBranding: unknown;
  const descriptions: string[] = [];
  await mkdir("test-results/seo", { recursive: true });

  for (const entry of pages) {
    await test.step(entry.name, async () => {
      const response = await page.goto(entry.path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["x-robots-tag"]).toContain("noindex");
      await readyForScreenshot(page, entry.path !== "/");
      await expect(page).toHaveTitle(entry.title);
      await expect(page.locator("h1")).toHaveCount(1);
      expect((await page.locator("h1").innerText()).replace(/\s+/g, " ").trim()).toBe(entry.h1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('meta[name="description"]')).toHaveCount(1);
      const description = await page.locator('meta[name="description"]').getAttribute("content");
      expect(description?.length).toBeGreaterThan(60);
      descriptions.push(description!);
      if (process.env.SEO_CANONICAL_ORIGIN) {
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new URL(entry.path, process.env.SEO_CANONICAL_ORIGIN).href);
      } else {
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      }
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
        };
      });
      if (entry.path === "/") {
        referenceBranding = branding;
        for (const id of await page.locator("[id]").evaluateAll(elements => elements.map(element => element.id))) homeFragments.add(id);
        await expect(page.locator('footer a[href="/commercial-tiling"]')).toHaveCount(1);
      } else {
        expect(branding).toEqual(referenceBranding);
        const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
        expect(schema.length).toBeGreaterThanOrEqual(2);
        const types = schema.map(text => JSON.parse(text)["@type"]);
        expect(types).toContain("Organization");
        expect(types).toContain("Service");
        if (process.env.SEO_CANONICAL_ORIGIN) expect(types).toContain("BreadcrumbList");
      }
      const links = await page.locator("a[href]").evaluateAll(elements => elements.map(element => element.getAttribute("href")!));
      for (const href of links.filter(href => href.startsWith("/") || href.startsWith("#"))) {
        const destination = new URL(href, page.url());
        expect(["/", "/commercial-tiling"]).toContain(destination.pathname);
        if (destination.hash) {
          const fragment = decodeURIComponent(destination.hash.slice(1));
          if (destination.pathname === "/") expect(homeFragments.has(fragment), href).toBe(true);
          else await expect(page.locator(`[id="${fragment}"]`), href).toHaveCount(1);
        }
      }
      if ((page.viewportSize()?.width ?? 1440) <= 760) {
        const button = page.getByRole("button", { name: "Open menu" });
        await button.click();
        await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("link", { name: "Expertise", exact: true }).first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toBeFocused();
        if (entry.path !== "/") {
          const navHrefs = await page.locator('nav[aria-label="Main navigation"] a').evaluateAll(elements => elements.map(element => element.getAttribute("href")));
          expect(navHrefs).toEqual(["/#expertise", "/#approach", "/#projects", "/#about", "/#tender"]);
        }
      }
      expect(await layoutIssues(page)).toEqual([]);
      expect(browserErrors).toEqual([]);
      const imagePrefix = `test-results/seo/${testInfo.project.name}-${entry.name}`;
      await page.screenshot({ path: `${imagePrefix}.png`, fullPage: true, animations: "disabled" });
      await page.screenshot({ path: `${imagePrefix}-viewport.png`, animations: "disabled" });
      await testInfo.attach(`${entry.name} full page`, { path: `${imagePrefix}.png`, contentType: "image/png" });
      await testInfo.attach(`${entry.name} viewport`, { path: `${imagePrefix}-viewport.png`, contentType: "image/png" });
    });
  }
  expect(new Set(descriptions).size).toBe(pages.length);
});

test("preview routing, slash redirects, query variants and sitemap", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Route behaviour is independent of viewport");
  const slash = await request.get("/commercial-tiling/", { maxRedirects: 0 });
  expect(slash.status()).toBe(308);
  expect(new URL(slash.headers().location, "http://127.0.0.1:3104").pathname).toBe("/commercial-tiling");
  const query = await request.get("/commercial-tiling?utm_source=qa");
  expect(query.status()).toBe(200);
  expect(query.headers()["x-robots-tag"]).toContain("noindex");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain("<loc>");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).not.toContain("Sitemap:");
  for (const path of ["/services/commercial-floor-tiling", "/locations/north-west", "/industries/retail-showrooms", "/does-not-exist"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
