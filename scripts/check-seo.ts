import { checkSeoPages } from "../lib/seo/quality";
import { seoPages } from "../lib/seo/registry";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { canonicalUrl, readSeoConfig, isPageRoutable, isPageIndexable } from "../lib/seo/config";
import { checkRenderedSeo } from "../lib/seo/rendered-quality";

async function main() {
 try {
  const built = process.argv.includes("--built");
  const config = readSeoConfig(built ? { ...process.env, NODE_ENV: "production" } : process.env);
  const issues = checkSeoPages(seoPages, config);
  if (built) {
    const html = new Map<string, string>();
    for (const page of seoPages.filter(entry => isPageRoutable(entry, config))) {
      try { html.set(page.path, await readFile(join(process.cwd(), ".next/server/app", `${page.path === "/" ? "index" : page.path.slice(1)}.html`), "utf8")); } catch { /* Report a missing page through the rendered checker. */ }
    }
    const publicRoot = join(process.cwd(), "public");
    async function assets(directory: string): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      return (await Promise.all(entries.map(entry => entry.isDirectory() ? assets(join(directory, entry.name)) : [`/${relative(publicRoot, join(directory, entry.name))}`]))).flat();
    }
    issues.push(...checkRenderedSeo(seoPages, html, config, new Set(await assets(publicRoot))));
    // Metadata routes are also inspected from their real prerendered responses.
    // A noindex deployment must never advertise pages through its sitemap.
    for (const file of ["sitemap.xml", "robots.txt"]) {
      try {
        const response = await readFile(join(process.cwd(), ".next/server/app", `${file}.body`), "utf8");
        if (file === "sitemap.xml") {
          const urls = [...response.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll("&amp;", "&")).sort();
          const expected = seoPages.filter(page => isPageIndexable(page, config)).map(page => canonicalUrl(page.path, config)!).sort();
          if (JSON.stringify(urls) !== JSON.stringify(expected)) issues.push({ severity: "error", code: "rendered-sitemap", paths: ["/sitemap.xml"], message: "Sitemap must contain exactly the approved, indexable production canonical URLs." });
        } else {
          const sitemap = response.split(/\r?\n/).filter(line => /^Sitemap:/i.test(line));
          if (config.indexingEnabled ? sitemap.length !== 1 || sitemap[0] !== `Sitemap: ${config.canonicalOrigin}/sitemap.xml` : sitemap.length !== 0) issues.push({ severity: "error", code: "rendered-robots", paths: ["/robots.txt"], message: "Robots must advertise the production sitemap only after launch approval." });
        }
      } catch {
        issues.push({ severity: "error", code: "missing-metadata-route", paths: [`/${file}`], message: "Metadata route was not prerendered; inspect its build output." });
      }
    }
  }
  for (const issue of issues) {
    console[issue.severity === "error" ? "error" : "warn"](`${issue.severity.toUpperCase()} ${issue.code} ${issue.paths.join(", ")}: ${issue.message}`);
  }
  const errors = issues.filter(issue => issue.severity === "error");
  console.log(`SEO registry: ${seoPages.length} entries, ${errors.length} critical issues, ${issues.length - errors.length} editorial warnings.`);
  if (errors.length) process.exitCode = 1;
 } catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
 }
}
void main();
