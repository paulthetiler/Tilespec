import type { AuditEvent } from "@/lib/operations/types";
import { eventDate } from "./format";
import styles from "@/app/admin/admin.module.css";

const detailLabels: Record<string, string> = {
  target_user_id: "Affected account", work_package_id: "Work package",
  old_role: "Previous role", new_role: "New role", old_active: "Previously active", new_active: "Now active",
  old_financial_access: "Previous commercial grant", new_financial_access: "New commercial grant",
  valid_from: "Access from", valid_until: "Access until", old_valid_until: "Previous expiry", new_valid_until: "New expiry",
  document_reference: "Document reference", revision: "Document revision", classification: "Document classification", uploaded_at: "Upload confirmed at",
};
const changeLabels: Record<string, string> = {
  role: "role", active: "active membership", financial_access: "commercial grant", valid_from: "access start", valid_until: "access expiry",
};
function displayValue(value: unknown) {
  return value === null ? "None" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value).slice(0, 500);
}

export function AuditHistory({ events }: { events: AuditEvent[] }) {
  return <>
    <ol className={styles.auditList}>{events.map(event => {
      const details: [string, unknown][] = Object.entries(event.details ?? {})
        .filter(([key, value]) => key in detailLabels && (value === null || ["string", "boolean", "number"].includes(typeof value)))
        .map(([key, value]) => [detailLabels[key], value]);
      for (const stage of ["before", "after"] as const) {
        const change = event.details?.[stage];
        if (change && typeof change === "object" && !Array.isArray(change)) {
          for (const [key, value] of Object.entries(change)) {
            if (key in changeLabels && (value === null || ["string", "boolean"].includes(typeof value))) details.push([`${stage === "before" ? "Previous" : "New"} ${changeLabels[key]}`, value]);
          }
        }
        if (stage === "after" && change === null && event.action === "delete") details.push(["Allocation outcome", "Removed"]);
      }
      const changedFields = event.details?.changed_fields;
      if (Array.isArray(changedFields) && changedFields.every(field => typeof field === "string")) details.push(["Changed fields", changedFields.join(", ").replaceAll("_", " ")]);
      return <li key={event.id} className={styles.auditRow}>
        <div><strong>{event.action.replaceAll("_", " ")}</strong><p className={styles.small}>{event.entity_type} · actor {event.actor_id}</p>
          {details.length > 0 && <dl className={styles.detailGrid}>{details.map(([label, value]) => <div className={styles.detailItem} key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl>}
        </div>
        <time dateTime={event.created_at}>{eventDate(event.created_at)}</time>
      </li>;
    })}</ol>
    {events.length === 0 && <p className={styles.muted}>No accessible audit events are available.</p>}
  </>;
}
