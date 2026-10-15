import type { InstallationStage } from "./types";

export type OfficeItem = {
  id: string; contract_id: string; kind: "instruction" | "qa_request";
  title: string; body: string; recipient_id: string | null; recipient_name: string | null;
  acknowledgement_required: boolean; work_area_id: string | null; location_path: string[];
  stage: InstallationStage | null; work_package_id: string | null; due_on: string | null;
  created_by: string; created_by_name: string; created_at: string; request_key: string;
};
export type OfficeAcknowledgement = { id: string; item_id: string; actor_id: string; acknowledged_at: string; request_key: string };
export type QaSubmission = { id: string; item_id: string; inspection_id: string; submitted_by: string; submitted_at: string; has_issues: boolean; request_key: string };
export type SiteHandover = {
  id: string; contract_id: string; actor_id: string; actor_name: string; work_date: string;
  finished_at: string; work_completed: string; outstanding_problems: string; materials_needed: string;
  areas_awaiting_attention: string; office_notes: string; finish_workforce: boolean;
  actual_allocation_ids: string[]; ended_count: number; created_at: string; request_key: string;
};
export type SupervisorDailyRecords = {
  items: OfficeItem[]; acknowledgements: OfficeAcknowledgement[];
  submissions: QaSubmission[]; handovers: SiteHandover[];
};
export function outstandingQa(items: OfficeItem[], submissions: QaSubmission[]) {
  const submitted = new Set(submissions.map(item => item.item_id));
  return items.filter(item => item.kind === "qa_request" && !submitted.has(item.id));
}
export function unacknowledgedInstructions(items: OfficeItem[], acknowledgements: OfficeAcknowledgement[], actorId: string) {
  const read = new Set(acknowledgements.filter(row => row.actor_id === actorId).map(row => row.item_id));
  return items.filter(item => item.kind === "instruction" && item.acknowledgement_required && !read.has(item.id));
}
export function qaInspectionHref(item: OfficeItem) {
  const query = new URLSearchParams({ location: item.work_area_id ?? "", stage: item.stage ?? "", qa_request: item.id });
  if (item.work_package_id) query.set("package", item.work_package_id);
  return `/admin/supervisor/sites/${item.contract_id}/inspections?${query}`;
}
