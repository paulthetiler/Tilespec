import { ClaimPage } from "@/components/subcontractors/claim-page";

export default function Page({ searchParams }: { searchParams: Promise<{ replaces?: string }> }) {
  return <ClaimPage mode="generated" searchParams={searchParams} />;
}
