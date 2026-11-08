import type { Metadata } from "next";
import { requireFinancialActor } from "@/lib/auth";
import CommercialEstimator from "./estimator-client";

export const metadata: Metadata = {
  title: "Commercial estimator | TileSPEC Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EstimatorPage() {
  const {supabase,member}=await requireFinancialActor();
  const {data:contracts}=await supabase.from("contracts").select("id,name,reference").eq("organisation_id",member.organisation_id).order("name");
  return <CommercialEstimator contracts={contracts??[]}/>;
}
