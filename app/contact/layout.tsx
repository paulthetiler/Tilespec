import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commercial Tiling Tender Enquiries | TileSPEC",
  description: "Send commercial wall and floor tiling tender drawings, specifications and programmes to TileSPEC for project review.",
  alternates: { canonical: "https://www.tilespec.uk/contact" },
};

export default function ContactLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return children;
}
