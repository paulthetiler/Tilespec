import { installationStages } from "./types";

export type QualityCounts = {
  inspections_due: number; failed_inspections: number; failed_mandatory: number;
  blocked_locations: number; released_locations: number;
  critical_snags: number;
};
export type HoldCounts = {
  active_quality: number; active_safety: number; awaiting_release: number; overdue: number; rejected: number; released: number;
};
export type QualityHold = {
  id: string; contract_id: string; work_area_id: string | null; stage: string | null; hold_type: string;
  type?: string; status: string; reason: string; location_path: string[];
  contract_name: string; contract_reference: string; assigned_team_name?: string | null; assigned_operative_name?: string | null;
  target_date?: string | null; overdue?: boolean;
};
export type WorkStatus = {
  contract_id: string; work_area_id: string; stage: string; location_path: string[];
  status: string; authorised: boolean;
  release_status: { reason: string | null; release: { hold_id: string; reviewer: string; reviewer_name: string; at: string; note: string; authority_acknowledgement: Record<string, unknown> | null } | null };
};
export type QualityOverview = {
  rows: QualityHold[]; total: number; counts: HoldCounts; quality_counts: QualityCounts;
  work_statuses: WorkStatus[]; work_statuses_truncated?: boolean;
};
export type HoldNotification = {
  id: number; hold_id: string; event_id: string; kind: string; title: string; created_at: string; read_at: string | null;
  contract_id: string; work_area_id: string | null; hold_type: string; status: string;
};
export type HoldNotifications = { rows: HoldNotification[]; unread: number; total: number };

export const qualityStatusLabels: Record<string, string> = {
  active: "Active", corrective_action_submitted: "Corrective action submitted", correction_submitted: "Corrective action submitted",
  awaiting_release: "Awaiting release authorisation", awaiting_release_review: "Awaiting release authorisation",
  released: "Released for specified activity", rejected: "Correction rejected", escalated: "Escalated",
  superseded: "Superseded", entered_in_error: "Entered in error", not_assessed: "Not assessed",
  awaiting_inspection: "Awaiting mandatory inspection", awaiting_mandatory_inspection: "Awaiting mandatory inspection",
  blocked_quality: "Blocked — quality hold", stopped_safety: "Stopped — safety",
  blocked_quality_hold: "Blocked — quality hold", safety_stopped: "Stopped — safety",
};
export function qualityStatusLabel(status: string) {
  return qualityStatusLabels[status] ?? status.replaceAll("_", " ");
}
export function qualityFilters(query: Record<string, string | string[] | undefined>) {
  const filters: Record<string, string> = {};
  for (const key of ["contract_id", "location_id", "team_id"])
    if (typeof query[key] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query[key])) filters[key] = query[key];
  if (typeof query.stage === "string" && (installationStages as readonly string[]).includes(query.stage)) filters.stage = query.stage;
  if (typeof query.status === "string" && /^[a-z_]{1,50}$/.test(query.status)) filters.status = query.status;
  if (typeof query.work_status === "string" && ["not_assessed", "awaiting_inspection", "blocked_quality", "stopped_safety", "awaiting_release", "released"].includes(query.work_status)) filters.work_status = query.work_status;
  if (typeof query.hold_type === "string" && ["quality", "safety"].includes(query.hold_type)) filters.hold_type = query.hold_type;
  for (const key of ["overdue", "rejected"]) if (query[key] === "on" || query[key] === "true") filters[key] = "true";
  return filters;
}
export function notificationId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Refresh the alert before marking it read.");
  return Number(value);
}
export function qualityRpcFilters(filters: Record<string, unknown>) {
  const result = { ...filters };
  for (const key of ["overdue", "rejected"]) if (result[key] === "true" || result[key] === "on") result[key] = true;
  return result;
}
