import { notFound } from "next/navigation";
import { LocationPage } from "@/components/site/location-page";
import { locationPages } from "@/lib/seo/content/locations";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";

type RouteProps = { params: Promise<{ slug: string[] }> };

function getLocation(slug: string[]) {
  const path = `/locations/${slug.join("/")}`;
  const page = locationPages.find(entry => entry.path === path);
  if (!page || !isPageRoutable(page)) notFound();
  return page;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return locationPages.filter(page => isPageRoutable(page)).map(page => ({ slug: page.path.replace(/^\/locations\//, "").split("/") }));
}

export async function generateMetadata({ params }: RouteProps) {
  const { slug } = await params;
  return pageMetadata(getLocation(slug));
}

export default async function CommercialLocationPage({ params }: RouteProps) {
  const { slug } = await params;
  return <LocationPage page={getLocation(slug)} />;
}
