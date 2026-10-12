export type SeoEnvironment = Readonly<Record<string, string | undefined>>;

export interface SeoConfig {
  canonicalOrigin: string | null;
  production: boolean;
  indexingEnabled: boolean;
}

/** An explicitly confirmed HTTPS origin; deployment URLs are never a fallback. */
export function readSeoConfig(env: SeoEnvironment = process.env): SeoConfig {
  const configured = env.SEO_CANONICAL_ORIGIN?.trim();
  let canonicalOrigin: string | null = null;
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("SEO_CANONICAL_ORIGIN must be an absolute HTTPS origin.");
    }
    if (
      url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.port || url.pathname !== "/" || url.search || url.hash ||
      /\s/.test(configured) || !/^https:\/\/[^/:?#@]+\/?$/i.test(configured)
    ) {
      throw new Error("SEO_CANONICAL_ORIGIN must be an HTTPS origin without credentials, port, path, query or fragment.");
    }
    canonicalOrigin = url.origin;
  }

  const onVercel = !!env.VERCEL || !!env.VERCEL_ENV;
  const production = env.NODE_ENV === "production" &&
    (!onVercel || env.VERCEL_ENV === "production");
  const requested = env.SEO_PRODUCTION_INDEXING === "true";
  if (requested && !canonicalOrigin) {
    throw new Error("Confirm and configure SEO_CANONICAL_ORIGIN before enabling SEO_PRODUCTION_INDEXING.");
  }
  return { canonicalOrigin, production, indexingEnabled: production && requested && !!canonicalOrigin };
}

export function isCanonicalPath(path: string): boolean {
  return path === "/" || /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(path);
}

export function canonicalUrl(path: string, config: SeoConfig = readSeoConfig()): string | undefined {
  if (!isCanonicalPath(path)) throw new Error(`Invalid canonical path: ${path}`);
  return config.canonicalOrigin ? `${config.canonicalOrigin}${path}` : undefined;
}

type Publication = { publicationStatus: "draft" | "review" | "approved"; indexingStatus: "noindex" | "index" };

export function isPageRoutable(page: Publication, config: SeoConfig = readSeoConfig()): boolean {
  return page.publicationStatus === "approved" || (page.publicationStatus === "review" && !config.production);
}

export function isPageIndexable(page: Publication, config: SeoConfig = readSeoConfig()): boolean {
  return config.indexingEnabled && page.publicationStatus === "approved" && page.indexingStatus === "index";
}
