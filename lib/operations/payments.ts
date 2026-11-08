/*
 * Payment applications (C4). Money access only. Types for the summary on the job money page; every
 * figure shown comes from the database's `payment_application_summaries`. Forms for applications,
 * notices, invoices and payments are in accounts.ts (C6).
 */

export type PaymentSummary = {
  application_id: string; number: number; period_end: string; status: "draft" | "submitted" | "certified" | "cancelled";
  gross: number; retention_percent: number; retention: number; net: number; net_this_period: number | null;
  certified_gross: number | null; certified_retention: number | null; certified_net: number | null; certified_this_period: number | null; received: number;
};
export type PaymentApplication = {
  id: string; contract_id: string; number: number; period_end: string; status: PaymentSummary["status"]; note: string | null; lines_version: number; version: number;
  submitted_at: string | null; submitted_by_name: string | null; certified_on: string | null; certificate_reference: string | null; certified_by_name: string | null;
  cancel_reason: string | null; created_by_name: string; created_at: string;
};
export type PaymentLine = {
  id: string; application_id: string; lines_version: number; position: number; kind: "contract_works" | "extra_work" | "materials_on_site" | "other";
  daywork_id: string | null; description: string; amount: number;
};
export type PaymentReceipt = { id: string; application_id: string; received_on: string; amount: number; reference: string | null; recorded_by_name: string; voided_at: string | null };

export const statusLabels: Record<PaymentSummary["status"], string> = { draft: "Draft", submitted: "Submitted", certified: "Certified", cancelled: "Cancelled" };
