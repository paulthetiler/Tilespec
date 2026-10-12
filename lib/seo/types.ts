export type PageCategory = "home" | "national" | "service" | "industry" | "region" | "location";

export interface ContentLink { href: string; label: string }
export interface ContentSection {
  id: string;
  heading: string;
  paragraphs: readonly string[];
  links?: readonly ContentLink[];
}
export interface PageImage {
  src: string;
  alt: string;
  role: "hero" | "supporting";
  provenance: "illustrative" | "verified-project";
}
export interface SeoPage {
  path: string;
  category: PageCategory;
  title: string;
  description: string;
  h1: string;
  intent: string;
  intro: string;
  /** Canonical is derived from path + confirmed SEO_CANONICAL_ORIGIN, never duplicated in content. */
  parent?: string;
  children: readonly string[];
  relatedServices: readonly string[];
  relatedIndustries: readonly string[];
  relatedLocations: readonly string[];
  sections: readonly ContentSection[];
  images: readonly PageImage[];
  publicationStatus: "draft" | "review" | "approved";
  indexingStatus: "noindex" | "index";
}
