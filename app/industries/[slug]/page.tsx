import { notFound } from "next/navigation";
import { IndustryPage } from "@/components/site/industry-page";
import { industryPages } from "@/lib/seo/content/industries";
import { isPageRoutable } from "@/lib/seo/config";
import { pageMetadata } from "@/lib/seo/metadata";

type IndustryPageProps = { params: Promise<{ slug: string }> };

function findPage(slug: string) {
  return industryPages.find(page => page.path === `/industries/${slug}` && isPageRoutable(page));
}

export function generateStaticParams() {
  return industryPages.filter(page => isPageRoutable(page)).map(page => ({ slug: page.path.split("/").at(-1)! }));
}

export async function generateMetadata({ params }: IndustryPageProps) {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) notFound();
  return pageMetadata(page);
}

export default async function IndustryRoute({ params }: IndustryPageProps) {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) notFound();
  return <IndustryPage page={page} />;
}
