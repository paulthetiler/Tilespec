import type { MetadataRoute } from "next";
import { readSeoConfig } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  const config = readSeoConfig();
  return {
    // Previews remain crawlable so crawlers can read the noindex directive.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/auth", "/login", "/api"] },
    ...(config.indexingEnabled ? { sitemap: `${config.canonicalOrigin}/sitemap.xml` } : {}),
  };
}
