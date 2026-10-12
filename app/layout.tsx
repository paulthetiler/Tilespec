import { rootMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const metadata = rootMetadata();

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

