import HomeContent from "@/components/site/home-content";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";
import { getSeoPage } from "@/lib/seo/registry";
import { organisationJsonLd, serializeJsonLd } from "@/lib/seo/structured-data";

export const metadata = pageMetadata(getSeoPage("/"));

export default function Home() {
  const showCommercialHub = isPageRoutable(getSeoPage("/commercial-tiling"));
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organisationJsonLd()) }} /><HomeContent showCommercialHub={showCommercialHub} /></>;
}
