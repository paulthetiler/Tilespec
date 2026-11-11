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
    sitemap: "https://tilespec.vercel.app/sitemap.xml",
    host: "https://tilespec.vercel.app",
  };
}
