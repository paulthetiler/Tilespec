import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./data";
import type { Account, BillingProfile, Dispute, Inclusion, IssuedDocument, Line, Notice, PaymentTermsRecord, Receipt, Share, Stage } from "./accounts";
import type { DocumentRecord } from "../documents/model";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
// Commercial accounts arrive with their own reviewed migration (C6); before it is applied they are absent.
const missing = (error: { code?: string } | null) => !!error && ["42P01", "PGRST205", "PGRST202", "42883", "42703", "PGRST204"].includes(error.code ?? "");
const DOCUMENT_COLUMNS = "id,kind,reference,title,revision,application_id,credits_document_id,supersedes_id,revision_reason,issued_on,net,vat,total,due_on,final_on,"
  + "issued_by_name,issued_at,superseded_at,snapshot_sha256";
// The link's secret hash is never granted to the app.
const SHARE_COLUMNS = "id,document_id,recipient,expires_at,created_by_name,created_at,revoked_at,view_count,last_viewed_at";
export type ApplicationRecord = { id: string; number: number; kind: "interim" | "advance" | "final"; status: string; version: number; period_end: string; note: string | null;
  cis_materials: number; lines_version: number; certified_on: string | null; certificate_reference: string | null; cancel_reason: string | null;
  submitted_by_name: string | null; created_by_name: string; certified_by_name: string | null };

export type Accounts = {
  account: Account; terms: PaymentTermsRecord | null; stages: Stage[]; applications: ApplicationRecord[]; lines: Line[]; receipts: Receipt[];
  notices: Notice[]; disputes: Dispute[]; documents: IssuedDocument[]; shares: Share[]; inclusions: Inclusion[];
  commercial: { contract_value: number; retention_percent: number; payment_terms: string; version: number } | null;
};

/** Money access only: the database refuses or returns nothing to anyone else. Null until the C6 migration is applied. */
export async function accountsFor(supabase: SupabaseClient, contractId: string): Promise<Accounts | null> {
  const results = await Promise.all([
    supabase.rpc("commercial_account", { p_contract: contractId }) as unknown as Promise<Result>,
    supabase.from("contract_payment_terms").select("*").eq("contract_id", contractId).maybeSingle() as unknown as Promise<Result>,
    supabase.from("contract_payment_stages").select("id,position,label,amount,planned_on,note,voided_at").eq("contract_id", contractId).order("position") as unknown as Promise<Result>,
    supabase.from("payment_applications").select("id,number,kind,status,version,period_end,note,cis_materials,lines_version,certified_on,certificate_reference,cancel_reason,"
      + "submitted_by_name,created_by_name,certified_by_name").eq("contract_id", contractId).order("number") as unknown as Promise<Result>,
    supabase.from("payment_application_lines").select("id,application_id,lines_version,position,kind,daywork_id,stage_id,description,amount").eq("contract_id", contractId)
      .order("position") as unknown as Promise<Result>,
    supabase.from("payment_receipts").select("id,application_id,received_on,amount,cis_deducted,reference,recorded_by_name,voided_at").eq("contract_id", contractId)
      .order("received_on") as unknown as Promise<Result>,
    supabase.from("payment_notices").select("id,application_id,kind,given_on,sum_stated,basis,reference,in_time,recorded_by_name,voided_at").eq("contract_id", contractId)
      .order("given_on") as unknown as Promise<Result>,
    supabase.from("commercial_disputes").select("id,application_id,daywork_id,raised_on,raised_by_party,summary,amount_disputed,recorded_by_name,resolved_on,resolution")
      .eq("contract_id", contractId).order("raised_on") as unknown as Promise<Result>,
    supabase.from("commercial_documents").select(DOCUMENT_COLUMNS).eq("contract_id", contractId).order("issued_at", { ascending: false }) as unknown as Promise<Result>,
    supabase.from("commercial_document_shares").select(SHARE_COLUMNS).eq("contract_id", contractId).order("created_at", { ascending: false }) as unknown as Promise<Result>,
    supabase.from("variation_daywork_inclusions").select("id,variation_id,daywork_id,note,voided_at").eq("contract_id", contractId) as unknown as Promise<Result>,
    supabase.from("contract_commercials").select("contract_value,retention_percent,payment_terms,version").eq("contract_id", contractId).maybeSingle() as unknown as Promise<Result>,
  ]);
  if (results.some(result => missing(result.error))) return null;
  for (const result of results) checkDatabase(result.error);
  const [account, terms, stages, applications, lines, receipts, notices, disputes, documents, shares, inclusions, commercial] = results.map(result => result.data);
  const apps = (applications ?? []) as ApplicationRecord[];
  return {
    account: account as Account, terms: (terms ?? null) as PaymentTermsRecord | null, stages: (stages ?? []) as Stage[], applications: apps,
    // Only each application's current set of lines; earlier corrections stay in the database.
    lines: ((lines ?? []) as Line[]).filter(line => apps.some(app => app.id === line.application_id && app.lines_version === line.lines_version)),
    receipts: (receipts ?? []) as Receipt[], notices: (notices ?? []) as Notice[], disputes: (disputes ?? []) as Dispute[],
    documents: (documents ?? []) as IssuedDocument[], shares: (shares ?? []) as Share[], inclusions: (inclusions ?? []) as Inclusion[],
    commercial: (commercial ?? null) as Accounts["commercial"],
  };
}

/** TileSPEC's recorded business details, or null if none are recorded yet (or the migration is not applied). */
export async function billingProfileFor(supabase: SupabaseClient): Promise<{ profile: BillingProfile | null; available: boolean }> {
  const result = await supabase.from("organisation_billing_profiles").select("*").maybeSingle() as unknown as Result;
  if (missing(result.error)) return { profile: null, available: false };
  checkDatabase(result.error);
  return { profile: (result.data ?? null) as BillingProfile | null, available: true };
}

/** One issued document with its snapshot, for printing. Money access only (row-level security). */
export async function issuedDocument(supabase: SupabaseClient, contractId: string, documentId: string): Promise<DocumentRecord | null> {
  const result = await supabase.from("commercial_documents").select("kind,reference,title,issued_on,snapshot,snapshot_sha256,superseded_at")
    .eq("contract_id", contractId).eq("id", documentId).maybeSingle() as unknown as Result;
  if (missing(result.error)) return null;
  checkDatabase(result.error);
  const row = result.data as (DocumentRecord & { superseded_at: string | null }) | null;
  return row ? { ...row, superseded: !!row.superseded_at } : null;
}

/** What a document would look like if issued now. Money access only; nothing is saved. */
export async function previewDocument(supabase: SupabaseClient, data: Record<string, unknown>): Promise<DocumentRecord> {
  const result = await supabase.rpc("preview_commercial_document", { p_data: data }) as unknown as Result;
  if (result.error) {
    const error = new Error(result.error.message ?? "The preview could not be prepared.") as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  return result.data as DocumentRecord;
}
