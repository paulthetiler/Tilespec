export const roles = ["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"] as const;
export type Role = typeof roles[number];
export type Member = { organisation_id: string; user_id: string; display_name: string; role: Role; financial_access: boolean; active: boolean };
export type Contract = {
  id: string; organisation_id: string; reference: string; name: string; client: string;
  principal_contractor: string; address: string; site_contact: string; scope: string;
  exclusions: string; tile_specification: string; substrate_details: string;
  installation_system: string; movement_joints: string; access_restrictions: string;
  working_hours: string; insurance_requirements: string; defects_liability: string;
  start_date: string | null; end_date: string | null; state: "draft"; version: number;
  created_at: string; updated_at: string;
};
export type Commercial = {
  contract_id: string; organisation_id: string; contract_value: number; labour_budget: number;
  materials_budget: number; preliminaries_budget: number; contingency: number;
  target_margin: number; payment_terms: string; retention_percent: number; version: number;
};
export type WorkArea = { id: string; contract_id: string; name: string; location: string; substrate_notes: string; system_notes: string; specification_revision: string };
export type WorkPackage = { id: string; contract_id: string; work_area_id: string; name: string; quantity: number; unit: string };
export type DocumentRevision = {
  id: string; contract_id: string; work_area_id: string | null; document_reference: string;
  revision: number; title: string; classification: "operational" | "commercial";
  object_path: string; sha256: string; mime_type: string; bytes: number; created_by: string;
  created_at: string; uploaded_at: string | null;
};
export type AuditEvent = { id: number; actor_id: string; action: string; entity_type: string; entity_id: string; created_at: string; commercial: boolean; details: Record<string, unknown> };
export type ActionState = { error?: string; success?: string };
export const roleLabels: Record<Role, string> = {
  owner: "Owner / Director", contracts_manager: "Contracts manager", supervisor: "QA / Site supervisor",
  lead_installer: "Lead installer", subcontract_installer: "Subcontract installer",
};
