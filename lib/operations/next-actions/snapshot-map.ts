import { inspectionHasBlockingFailure, type LocationInspection } from "../inspections";
import type { HoldRow, InspectionRequirementRow, InspectionRow, InstallationStageKey, SnagRow, SnagStatus } from "./types";

/*
 * Pure conversions from saved database rows to the engine's snapshot rows.
 * They contain no rules. Where the application already has a tested helper
 * (for example inspectionHasBlockingFailure) it is used, not copied.
 */

/** Append-only records: a revision names the row it replaces. Only the current, unreplaced rows count. */
export function currentRows<T extends { id: string; supersedes_id: string | null }>(rows: T[]): T[] {
  const replaced = new Set(rows.map(row => row.supersedes_id).filter((id): id is string => !!id));
  return rows.filter(row => !replaced.has(row.id));
}

export function toRequirement(row: { id: string; contract_id: string; work_area_id: string; stage: InstallationStageKey; applicability: string }): InspectionRequirementRow {
  return { id: row.id, contract_id: row.contract_id, work_area_id: row.work_area_id, stage: row.stage, applicability: row.applicability === "required" ? "required" : "not_required" };
}

export function toInspection(
  row: Pick<LocationInspection, "id" | "work_area_id" | "issues_count" | "answers" | "created_at"> & { contract_id: string; template_id: string },
  stageByTemplate: Map<string, InstallationStageKey>,
): InspectionRow | null {
  const stage = stageByTemplate.get(row.template_id);
  if (!stage) return null;
  return { id: row.id, contract_id: row.contract_id, work_area_id: row.work_area_id, stage, created_at: row.created_at, blocking_failure: inspectionHasBlockingFailure(row) };
}

const SNAG_STATUSES: SnagStatus[] = ["draft", "open", "assigned", "rectification_submitted", "reinspection", "closed", "cancelled"];
export function toSnag(row: Record<string, unknown>): SnagRow | null {
  const status = row.snag_status as SnagStatus | null;
  // Legacy rows with no lifecycle status are not part of the current workflow.
  if (!status || !SNAG_STATUSES.includes(status)) return null;
  return {
    id: String(row.id), contract_id: String(row.contract_id), work_area_id: (row.work_area_id as string | null) ?? null,
    check_label: String(row.check_label ?? ""), description: String(row.description ?? ""),
    severity: (row.severity as SnagRow["severity"]) ?? null, snag_status: status, assigned_team_id: (row.assigned_team_id as string | null) ?? null,
    target_date: (row.target_date as string | null) ?? null, raised_by: (row.inspector_id as string | null) ?? null, rectified_by: (row.rectified_by as string | null) ?? null,
    escalated: row.escalated === true, responsibility_state: (row.responsibility_state as string | null) ?? null,
    responsibility_team_id: (row.responsibility_team_id as string | null) ?? null,
  };
}

export function toHold(row: Record<string, unknown>): HoldRow {
  return {
    id: String(row.id), contract_id: String(row.contract_id), work_area_id: (row.work_area_id as string | null) ?? null,
    hold_type: row.hold_type === "safety" ? "safety" : "quality", status: row.status as HoldRow["status"],
    reason: String(row.reason ?? ""), required_action: String(row.required_action ?? ""), raised_by: String(row.raised_by),
    corrected_by: (row.corrected_by as string | null) ?? null, assigned_team_id: (row.assigned_team_id as string | null) ?? null,
    assigned_operative_id: (row.assigned_operative_id as string | null) ?? null, target_date: (row.target_date as string | null) ?? null,
    // The engine derives this from open critical snags in the same location. It is never read from a stored flag.
    critical_snags_open: false,
  };
}
