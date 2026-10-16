import Link from "next/link";
import { notFound } from "next/navigation";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";
import dailyStyles from "@/components/site/daily.module.css";

export const dynamic = "force-dynamic";

// "Report an issue" is the everyday way to tell the office something is wrong. It adds no new
// record type: each choice opens the existing snag or hold form, with its permissions and audit trail.
export default async function ReportIssue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, contract } = await requireSite(id);
  if (!contract) return null;
  if (!flagEnabled("nextActions", member.role)) notFound();
  return <div className={dailyStyles.day}>
    <header className={dailyStyles.intro}>
      <p className={dailyStyles.greeting}>{contract.name}</p>
      <h1 className={dailyStyles.title}>Report an issue</h1>
      <p className={dailyStyles.muted}>Does work need to stop here?</p>
    </header>
    <div className={dailyStyles.siteList}>
      <Link className={dailyStyles.siteChoice} href={`/admin/snags/new?contract=${id}`}>
        <strong>No, just record it</strong>
        <span>Add a photo, the location and a short note. Work carries on and the office is told.</span>
      </Link>
      <Link className={dailyStyles.siteChoice} href={`/admin/holds/new?contract=${id}&type=quality`}>
        <strong>Yes, put a quality hold on it</strong>
        <span>Only the affected location and activity stop. They stay stopped until the fix is checked and the office restarts them.</span>
      </Link>
      <Link className={dailyStyles.siteChoice} href={`/admin/holds/new?contract=${id}&type=safety`}>
        <strong>Yes, it is a safety stop</strong>
        <span>Make the area safe first and follow the principal contractor&apos;s procedure. This records the stop and tells the office.</span>
      </Link>
    </div>
    <p className={styles.muted}>A critical defect does not stop work by itself. If affected work must stop, choose a hold.</p>
    <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${id}`}>Back to today</Link>
  </div>;
}
