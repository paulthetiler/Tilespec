export type SeoEnvironment = Readonly<Record<string, string | undefined>>;

export interface SeoConfig {
  canonicalOrigin: string | null;
  production: boolean;
  indexingEnabled: boolean;
}

/** Owner-confirmed launch origin. A deployment hostname is never a fallback. */
export const TILESPEC_CANONICAL_ORIGIN = "https://tilespec.uk";

export function readSeoConfig(env: SeoEnvironment = process.env): SeoConfig {
  const configured = env.SEO_CANONICAL_ORIGIN?.trim() || TILESPEC_CANONICAL_ORIGIN;
  let canonicalOrigin: string;
  {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("SEO_CANONICAL_ORIGIN must be an absolute HTTPS origin.");
    }
    if (
      url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.port || url.pathname !== "/" || url.search || url.hash ||
      /\s/.test(configured) || !/^https:\/\/[^/:?#@]+\/?$/i.test(configured) ||
      url.hostname.endsWith(".vercel.app")
    ) {
      throw new Error("SEO_CANONICAL_ORIGIN must be a production HTTPS origin without credentials, port, path, query, fragment or Vercel deployment hostname.");
    }
    canonicalOrigin = url.origin;
  }

  const onVercel = !!env.VERCEL || !!env.VERCEL_ENV;
  const production = env.NODE_ENV === "production" &&
    (!onVercel || env.VERCEL_ENV === "production");
  const requested = env.SEO_PRODUCTION_INDEXING === "true";
  // Independent launch approval prevents an inherited indexing flag from
  // exposing the prelaunch website. Both flags default to false.
  const launchApproved = env.SEO_LAUNCH_APPROVED === "true";
  return { canonicalOrigin, production, indexingEnabled: production && requested && launchApproved };
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
