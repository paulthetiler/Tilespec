import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TileSPEC | Commercial Tiling Contractors",
  description: "Specialist commercial wall and floor tiling. Tender-led delivery for main contractors, developers and commercial projects across the North West and beyond.",
  openGraph: { title: "TileSPEC | Commercial Tiling Contractors", description: "Precision in every square metre.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
