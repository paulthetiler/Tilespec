import type { Metadata } from "next";
import { canonicalUrl, isPageIndexable, readSeoConfig, type SeoConfig } from "./config";
import type { SeoPage } from "./types";

/** Root defaults deliberately have no canonical: private routes must not inherit '/'. */
export function rootMetadata(config: SeoConfig = readSeoConfig()): Metadata {
  return {
    ...(config.canonicalOrigin ? { metadataBase: new URL(config.canonicalOrigin) } : {}),
    title: "TileSPEC | Commercial Tiling Contractors",
    description: "Specialist commercial wall and floor tiling. Tender-led delivery for main contractors, developers and commercial projects across the North West and beyond.",
    robots: { index: false, follow: true },
  };
}

export function pageMetadata(page: SeoPage, config: SeoConfig = readSeoConfig()): Metadata {
  const canonical = canonicalUrl(page.path, config);
  const index = isPageIndexable(page, config);
  const image = page.images.find(entry => entry.role === "hero") ?? page.images[0];
  return {
    title: page.title,
    description: page.description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index, follow: true, googleBot: { index, follow: true } },
    openGraph: {
      title: page.title,
      description: page.description,
      type: "website",
      siteName: "TileSPEC",
      locale: "en_GB",
      ...(canonical ? { url: canonical } : {}),
      images: [{
        url: image?.src ?? "https://wxxxgqi56ekoi5vz.public.blob.vercel-storage.com/file_000000003b8c82108173987758914799.png",
        alt: image?.alt ?? "Illustrative commercial tiled interior",
      }],
    },
  };
}
