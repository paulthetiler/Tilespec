import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { holdNotificationsFor } from "@/lib/operations/quality-data";
import { qualityFilters } from "@/lib/operations/quality";
import { OperationsForm } from "@/components/operations/operations-form";
import { ConnectionStatus } from "@/components/site/connection-status";
import { markAlertReadAction } from "./actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function SiteAlerts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireActor(), q = await searchParams;
  const filters = qualityFilters(q), unread = q.unread === "on";
  const [alerts, contracts] = await Promise.all([holdNotificationsFor(supabase, filters.contract_id || null, unread), contractsFor(supabase)]);
  return <>
    <ConnectionStatus /><h1 className={styles.title}>Site alerts</h1><p>Saved in-application alerts for work within your current contract permissions. Read state is stored for your account.</p>
    <form method="get" className={styles.search}><label>Site<select name="contract_id" defaultValue={filters.contract_id || ""}><option value="">All authorised sites</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.reference} · {c.name}</option>)}</select></label><label className={styles.checkboxRow}><input type="checkbox" name="unread" defaultChecked={unread} />Unread only</label><button className={styles.button}>Apply filters</button></form>
    {!alerts ? <p className={styles.warning}>Site alerts are unavailable until the reviewed Phase 3C migration is applied.</p> : <>
      <p><strong>{alerts.unread} unread alert{alerts.unread === 1 ? "" : "s"}</strong> in the selected site scope.</p>
      {alerts.total > alerts.rows.length && <p className={styles.small}>Showing the latest {alerts.rows.length} of {alerts.total} matching alerts. Use the site or unread filter to focus the list.</p>}
      <div className={styles.cardList}>{alerts.rows.map(alert => {
        const contract = contracts.find(c => c.id === alert.contract_id);
        return <article className={styles.card} key={alert.id}>
          <p className={styles.eyebrow}>{contract ? `${contract.reference} · ${contract.name}` : "Authorised site"}</p><h2>{alert.title}</h2>
          <p><span className={alert.read_at ? styles.badge : styles.warningBadge}>{alert.read_at ? "Read" : "Unread"}</span> · {new Date(alert.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
          <div className={styles.rowActions}><Link className={styles.button} href={`/admin/holds/${alert.hold_id}`}>Open affected work</Link>
            {!alert.read_at && <OperationsForm action={markAlertReadAction} submitLabel="Mark read" plain compact><input type="hidden" name="notification_id" value={alert.id} /><input type="hidden" name="request_key" value={randomUUID()} /></OperationsForm>}
          </div>
        </article>;
      })}</div>
      {!alerts.rows.length && <p>No matching alerts.</p>}
    </>}
  </>;
}
