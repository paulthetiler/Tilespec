import HomeContent from "@/components/site/home-content";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";
import { getSeoPage } from "@/lib/seo/registry";

export const metadata = pageMetadata(getSeoPage("/"));

export default function Home() {
  const showCommercialHub = isPageRoutable(getSeoPage("/commercial-tiling"));
  return <HomeContent showCommercialHub={showCommercialHub} />;
}
