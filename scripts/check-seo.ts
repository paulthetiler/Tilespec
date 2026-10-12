import { checkSeoPages } from "../lib/seo/quality";
import { seoPages } from "../lib/seo/registry";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { readSeoConfig, isPageRoutable } from "../lib/seo/config";
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
