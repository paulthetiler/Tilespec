import type { MetadataRoute } from "next";
import { commercialLocations } from "../lib/commercial-locations";

const origin = "https://tilespec.vercel.app";
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
    ...locations.map((slug) => ({
      url: origin + "/" + slug,
      changeFrequency: "monthly" as const,
      priority: slug === "north-west-commercial-tiling" ? 0.8 : 0.65,
    })),
  ];
}
