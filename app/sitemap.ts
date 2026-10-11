import type { MetadataRoute } from "next";
import {canonical,seoPages} from "../lib/seo";
export default function sitemap():MetadataRoute.Sitemap{return [{url:canonical("/"),lastModified:new Date(),changeFrequency:"monthly",priority:1},...seoPages.map(p=>({url:canonical(p.path),lastModified:new Date(),changeFrequency:"monthly" as const,priority:p.path==="/commercial-tiling"?0.9:0.7}))]}
