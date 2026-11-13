import { redirect } from "next/navigation";
import { requireSite } from "../../../site-access";
import { siteDayFactsFor } from "@/components/site/day-steps";
import { nextSiteStep, siteDaySteps, type SiteStepKey } from "@/lib/operations/day-steps";

export const dynamic = "force-dynamic";
const KEYS: SiteStepKey[] = ["checks", "people", "progress", "inspect", "finish"];

// "Next step" from anywhere in the supervisor's day: works out the next unfinished step from today's saved
// records and goes straight there. If the records cannot be read, it goes back to Today, which always works.
export default async function NextSiteStep({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string | string[] }> }) {
  const { id } = await params;
  const { after } = await searchParams;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  const current = KEYS.find(key => key === after) ?? null;
  let target = base;
  try {
    const next = nextSiteStep(siteDaySteps(base, await siteDayFactsFor(supabase, id, member.user_id)), current);
    if (next) target = next.href;
  } catch { /* Today explains anything that cannot be read. */ }
  redirect(target);
}
