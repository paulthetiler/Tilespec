import type { MetadataRoute } from "next";
import { commercialLocations } from "../lib/commercial-locations";
import { regionalHubs } from "../lib/region-hubs";

const origin = "https://www.tilespec.uk";
const establishedLocations = [
  "north-west-commercial-tiling",
  "manchester-commercial-tiling",
  "liverpool-commercial-tiling",
  "preston-commercial-tiling",
  "stoke-on-trent-commercial-tiling",
  "birmingham-commercial-tiling",
  "sheffield-commercial-tiling",
  "leeds-commercial-tiling",
  "wrexham-commercial-tiling",
  "coventry-commercial-tiling",
  "wolverhampton-commercial-tiling",
  "derby-commercial-tiling",
  "nottingham-commercial-tiling",
  "leicester-commercial-tiling",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const locations = [...establishedLocations, ...commercialLocations.map((item) => item.slug)];
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: origin + "/contact", changeFrequency: "monthly", priority: 0.7 },
    { url: origin + "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { url: origin + "/coverage", changeFrequency: "monthly", priority: 0.85 },
    { url: origin + "/guides", changeFrequency: "monthly", priority: 0.6 },
    ...["substrate-readiness","movement-joints-and-setting-out","waterproofing-and-wet-areas"].map(slug => ({ url: origin + "/guides/" + slug, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...["commercial-floor-tiling","commercial-wall-tiling","commercial-tiling-packages","commercial-substrate-preparation"].map(slug => ({ url: origin + "/services/" + slug, changeFrequency: "monthly" as const, priority: 0.85 })),
    ...regionalHubs.filter(hub => hub.id !== "north-west" && hub.id !== "london").map(hub => ({
      url: origin + "/" + hub.path,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...locations.map((slug) => ({
      url: origin + "/" + slug,
      changeFrequency: "monthly" as const,
      priority: slug === "north-west-commercial-tiling" ? 0.8 : 0.65,
    })),
  ];
}
