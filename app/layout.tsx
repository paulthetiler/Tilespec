import type { Metadata } from "next";
import "./globals.css";
import ScrollReveal from "./scroll-reveal";

export const metadata: Metadata = {
  title: "TileSPEC | Commercial Tiling Contractors",
  description: "Commercial wall and floor tiling contractors delivering complete supply-and-install packages, substrate preparation and waterproofing across the North West and beyond.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg", apple: "/icon.svg" },
  openGraph: { title: "TileSPEC | Commercial Tiling Contractors", description: "Complete commercial tiling packages, from preparation and tile supply to installation and handover.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ScrollReveal />{children}</body></html>;
}
