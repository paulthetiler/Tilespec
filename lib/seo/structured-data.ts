import { canonicalUrl, readSeoConfig, type SeoConfig } from "./config";
import type { SeoPage } from "./types";

export function organisationJsonLd(config: SeoConfig = readSeoConfig()) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TileSPEC",
    ...(config.canonicalOrigin ? {
      "@id": `${config.canonicalOrigin}/#organisation`,
      url: `${config.canonicalOrigin}/`,
      logo: `${config.canonicalOrigin}/tilespec-logo-animated.svg`,
    } : {}),
    address: { "@type": "PostalAddress", addressLocality: "Warrington", addressRegion: "Cheshire", addressCountry: "GB" },
  };
}

export function breadcrumbJsonLd(page: SeoPage, ancestors: readonly SeoPage[], config: SeoConfig = readSeoConfig()) {
  if (!config.canonicalOrigin) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [...ancestors, page].map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.path === "/" ? "Home" : entry.h1,
      item: canonicalUrl(entry.path, config),
    })),
  };
}

export function serviceJsonLd(page: SeoPage, config: SeoConfig = readSeoConfig()) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.h1,
    description: page.description,
    ...(config.canonicalOrigin ? { url: canonicalUrl(page.path, config) } : {}),
    provider: {
      "@type": "Organization", name: "TileSPEC",
      ...(config.canonicalOrigin ? { "@id": `${config.canonicalOrigin}/#organisation` } : {}),
    },
    areaServed: { "@type": "Country", name: "United Kingdom" },
  };
}

/** Escaping prevents content from terminating the application/ld+json script. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
