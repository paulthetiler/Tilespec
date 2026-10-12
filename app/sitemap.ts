import type { MetadataRoute } from "next";
import { canonicalUrl, isPageIndexable, readSeoConfig } from "@/lib/seo/config";
import { seoPages } from "@/lib/seo/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const config = readSeoConfig();
  // The prelaunch and preview sitemap is intentionally empty. Route existence
  // alone is never approval to index a page.
  return seoPages.filter(page => isPageIndexable(page, config)).map(page => ({
    url: canonicalUrl(page.path, config)!,
  }));
}
