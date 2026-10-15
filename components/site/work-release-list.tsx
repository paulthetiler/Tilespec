import Link from "next/link";
import { qualityStatusLabel, type WorkStatus } from "@/lib/operations/quality";
import { installationStageLabels, type InstallationStage } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

export function WorkReleaseList({ rows, truncated = false, contracts = [] }: { rows: WorkStatus[]; truncated?: boolean; contracts?: { id: string; name: string; reference: string }[] }) {
  return <>
    <p className={styles.small}>These saved decisions apply to the location and activity shown. They do not release the whole site or override principal-contractor safety controls.</p>
    {truncated && <p className={styles.warning}>Showing the first 200 location activities. Narrow the site, location or stage filter to inspect the remaining work.</p>}
    <div className={styles.cardList}>{rows.map(row => {
      const contract = contracts.find(item => item.id === row.contract_id);
      const blocked = /blocked|stopped|safety/.test(row.status);
      return <article className={styles.card} key={`${row.contract_id}:${row.work_area_id}:${row.stage}`}>
        {contract && <p className={styles.eyebrow}>{contract.reference} · {contract.name}</p>}
        <h3>{row.location_path?.join(" › ") || "Recorded location"}</h3>
        <p>{installationStageLabels[row.stage as InstallationStage] || row.stage}</p>
        <p><span className={blocked ? styles.dangerBadge : row.authorised ? styles.okBadge : styles.warningBadge}>{qualityStatusLabel(row.status)}</span></p>
        {row.release_status?.reason && <p>{row.release_status.reason}</p>}
        {row.release_status?.release && <p className={styles.small}>Recorded release decision by <strong>{row.release_status.release.reviewer_name}</strong> at {new Date(row.release_status.release.at).toLocaleString("en-GB", { timeZone: "Europe/London" })}: {row.release_status.release.note} <Link href={`/admin/holds/${row.release_status.release.hold_id}`}>Review the release and its evidence</Link>.{!row.authorised && " Current restrictions above still prevent this work from being shown as released."}</p>}
        <div className={styles.rowActions}>
          <Link className={styles.secondaryButton} href={`/admin/supervisor/sites/${row.contract_id}/inspections?location=${row.work_area_id}&stage=${row.stage}`}>Inspect this location</Link>
          <Link className={styles.secondaryButton} href={`/admin/holds?contract_id=${row.contract_id}&location_id=${row.work_area_id}&stage=${row.stage}`}>Review holds for this work</Link>
        </div>
      </article>;
    })}</div>
    {!rows.length && <p>No recorded location activities match this scope. No permission to proceed is implied.</p>}
  </>;
}
