import { notFound } from "next/navigation";
import { ServicePage } from "@/components/site/service-page";
import { servicePages } from "@/lib/seo/content/services";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";

type RouteProps = { params: Promise<{ slug: string }> };

function findService(slug: string) {
  const page = servicePages.find(entry => entry.path === `/services/${slug}`);
  if (!page || !isPageRoutable(page)) notFound();
  return page;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return servicePages.filter(page => isPageRoutable(page)).map(page => ({ slug: page.path.split("/").at(-1)! }));
}

export async function generateMetadata({ params }: RouteProps) {
  const { slug } = await params;
  return pageMetadata(findService(slug));
}

export default async function ServiceRoute({ params }: RouteProps) {
  const { slug } = await params;
  return <ServicePage page={findService(slug)} />;
}
