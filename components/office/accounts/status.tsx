import { displayStatusLabels, extraStateLabels, type DisplayStatus, type ExtraState } from "@/lib/operations/accounts";
import styles from "@/app/admin/admin.module.css";

const statusClass: Record<DisplayStatus, string> = {
  draft: styles.badge, submitted: styles.warningBadge, certified: styles.warningBadge, part_paid: styles.warningBadge, paid: styles.okBadge,
  disputed: styles.dangerBadge, overdue: styles.dangerBadge, cancelled: styles.badge,
};
export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <span className={statusClass[status]} data-account-status={status}>{displayStatusLabels[status]}</span>;
}
const extraClass: Record<ExtraState, string> = { draft: styles.badge, submitted: styles.warningBadge, approved: styles.okBadge, disputed: styles.dangerBadge, rejected: styles.badge };
export function ExtraBadge({ state }: { state: ExtraState }) {
  return <span className={extraClass[state]} data-extra-state={state}>{extraStateLabels[state]}</span>;
}
