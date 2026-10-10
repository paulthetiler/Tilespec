import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, Commercial, Contract, DocumentRevision, Member, WorkArea, WorkPackage } from "./types";

export function checkDatabase(error: { code?: string } | null) {
  if (error) {
    if (error.code === "40001") throw new Error("This record changed while you were editing. Refresh before trying again.");
    if (error.code === "23505") throw new Error("This reference or revision already exists. Choose a different reference or refresh the record.");
    if (error.code === "42501") throw new Error("You do not have permission for this operation.");
    throw new Error("The record could not be read or saved. Check the backend connection and try again.");
  }
}
export async function contractsFor(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
  checkDatabase(error);
  return (data || []) as Contract[];
}
export async function contractDetails(supabase: SupabaseClient, id: string, financial: boolean) {
  const c = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  checkDatabase(c.error);
  if (!c.data) return null;
  const [areas, packages, documents, audit, commercial] = await Promise.all([
    supabase.from("work_areas").select("*").eq("contract_id", id).order("created_at"),
    supabase.from("work_packages").select("*").eq("contract_id", id).order("created_at"),
    supabase.from("document_revisions").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_events").select("*").eq("contract_id", id).order("created_at", { ascending: false }).limit(50),
    financial ? supabase.from("contract_commercials").select("*").eq("contract_id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  [areas, packages, documents, audit, commercial].forEach(r => checkDatabase(r.error));
  return { contract: c.data as Contract, areas: areas.data as WorkArea[], packages: packages.data as WorkPackage[], documents: documents.data as DocumentRevision[], audit: audit.data as AuditEvent[], commercial: commercial.data as Commercial | null };
}
export async function teamFor(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("organisation_members").select("*").order("display_name");
  checkDatabase(error);
  return data as Member[];
}
