import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TileSPEC | Commercial Tiling Contractors",
  description: "Commercial wall and floor tiling contractors delivering complete supply-and-install packages, substrate preparation and waterproofing across the North West and beyond.",
  openGraph: { title: "TileSPEC | Commercial Tiling Contractors", description: "Complete commercial tiling packages, from preparation and tile supply to installation and handover.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
