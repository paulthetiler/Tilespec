import type { Metadata } from "next";
import { requireFinancialActor } from "@/lib/auth";
import CommercialEstimator from "./estimator-client";

export const metadata: Metadata = {
  title: "Commercial estimator | TileSPEC Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EstimatorPage() {
  await requireFinancialActor();
  return <CommercialEstimator/>;
}
