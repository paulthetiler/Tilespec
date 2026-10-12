import type { MetadataRoute } from "next";
import { readSeoConfig } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  const config = readSeoConfig();
  return {
    // Prelaunch and preview pages remain crawlable so their noindex metadata
    // and X-Robots-Tag can be read. robots.txt is not an indexing approval gate.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/auth", "/login", "/api"] },
    ...(config.indexingEnabled ? { sitemap: `${config.canonicalOrigin}/sitemap.xml` } : {}),
  };
}
