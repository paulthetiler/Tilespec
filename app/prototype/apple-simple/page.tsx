import type { Metadata } from "next";
import AppleSimplePrototype from "./prototype";

export const metadata: Metadata = {
  title: "Apple-simple workflow prototype | TileSPEC",
  robots: { index: false, follow: false },
};

export default function AppleSimplePrototypePage() {
  return <AppleSimplePrototype />;
}
