import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TileSpec Homepage Concept — Private Preview",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
