import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/auth/", "/login", "/subcontractors/"],
      },
    ],
    sitemap: "https://www.tilespec.uk/sitemap.xml",
    host: "https://www.tilespec.uk",
  };
}
