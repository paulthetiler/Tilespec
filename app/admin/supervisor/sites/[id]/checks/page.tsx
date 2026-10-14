import Link from "next/link";
import { locationsFor, siteStatusFor } from "@/lib/operations/data";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { londonClock, londonDate } from "@/lib/operations/planning";
import SiteWorkflowPreview from "../../../site-workflow-preview";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function MorningChecks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  const [status, locations] = await Promise.all([siteStatusFor(supabase, id, londonDate()), locationsFor(supabase, id)]);
  const index = indexLocations(locations);
  const areas = orderLocations(locations.filter(location => !location.archived_at && location.path_ids.length <= 2)).map(location => locationPath(index, location.id));
  return <>
    {status.lastCheck && <div className={styles.success} role="status">
      <p>Morning checks were recorded at {londonClock(status.lastCheck.created_at)} today{status.lastCheck.issues_count ? ` with ${status.lastCheck.issues_count} issue${status.lastCheck.issues_count === 1 ? "" : "s"}` : ""}.</p>
      <Link className={styles.button} href={`${base}/workforce`}>Confirm today&apos;s workforce</Link>
    </div>}
    <SiteWorkflowPreview contractId={id} contractReference={contract.reference} areaNames={areas} dashboardHref={base} workforceHref={`${base}/workforce`} />
  </>;
}
