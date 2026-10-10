"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, canManageContracts, canReadFinancial } from "@/lib/auth";
import { createStorageVerifier } from "@/lib/supabase/storage-admin";
import { checkDatabase } from "@/lib/operations/data";
import { areaInput, commercialInput, contractInput, integer, MAX_FILE_BYTES, memberRole, packageInput, text, uuid, ValidationError } from "@/lib/operations/validation";
import { inspectEvidence, verifyStoredEvidence } from "@/lib/operations/evidence";
import type { ActionState, DocumentRevision } from "@/lib/operations/types";

const failure = (error: unknown): ActionState => ({ error: error instanceof Error ? error.message : "The operation could not be completed. Try again." });
function manage(member: Parameters<typeof canManageContracts>[0]) {
  if (!canManageContracts(member)) throw new ValidationError("Only the owner or allocated contracts manager can change this record.");
}
function financial(member: Parameters<typeof canReadFinancial>[0]) {
  if (!canReadFinancial(member)) throw new ValidationError("Commercial access has not been authorised for your account.");
}
export async function createContractAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  let id: string;
  try {
    manage(member);
    const result = await supabase.rpc("create_contract", { p_organisation: member.organisation_id, p_request_key: uuid(form, "request_key"), p_data: contractInput(form), p_commercial: null });
    checkDatabase(result.error);
    id = result.data as string;
  } catch (error) { return failure(error); }
  revalidatePath("/admin");
  redirect(`/admin/contracts/${id}`);
}
export async function updateContractAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.rpc("update_contract", { p_contract: id, p_version: integer(form, "version", 1), p_data: contractInput(form) });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${id}`);
    revalidatePath("/admin");
    return { success: "Contract details saved. Installation remains unreleased." };
  } catch (error) { return failure(error); }
}
export async function saveCommercialAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    financial(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.rpc("save_contract_commercial", { p_contract: id, p_version: integer(form, "version"), p_data: commercialInput(form, member.role === "owner") });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${id}`);
    revalidatePath("/admin");
    return { success: "Original budget saved. This is not commercial acceptance or payment certification." };
  } catch (error) { return failure(error); }
}
export async function createAreaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.rpc("create_work_area", { p_contract: id, p_request_key: uuid(form, "request_key"), p_data: areaInput(form) });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${id}`);
    return { success: "Work area recorded. No installation approval has been issued." };
  } catch (error) { return failure(error); }
}
export async function createPackageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const result = await supabase.rpc("create_work_package", { p_area: uuid(form, "area_id"), p_request_key: uuid(form, "request_key"), p_data: packageInput(form) });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${uuid(form, "contract_id")}`);
    return { success: "Work package created. Allocate staff explicitly before they can access it." };
  } catch (error) { return failure(error); }
}
export async function assignContractAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const validUntil = text(form, "valid_until", 10);
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new ValidationError("Enter a valid access expiry date.");
    const result = await supabase.from("contract_assignments").upsert({ organisation_id: member.organisation_id, contract_id: id, user_id: uuid(form, "user_id"), valid_until: validUntil || null }, { onConflict: "contract_id,user_id" });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${id}`);
    return { success: "Contract access allocation saved." };
  } catch (error) { return failure(error); }
}
export async function assignPackageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.from("package_assignments").upsert({ organisation_id: member.organisation_id, contract_id: id, work_package_id: uuid(form, "package_id"), user_id: uuid(form, "user_id") }, { onConflict: "work_package_id,user_id", ignoreDuplicates: true });
    checkDatabase(result.error);
    revalidatePath(`/admin/contracts/${id}`);
    return { success: "Installer package allocation saved." };
  } catch (error) { return failure(error); }
}
export async function removeContractAssignmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.from("contract_assignments").delete().eq("contract_id", id).eq("user_id", uuid(form, "user_id")).select("user_id");
    checkDatabase(result.error);
    if (!result.data?.length) throw new ValidationError("No accessible allocation was removed. Refresh the record.");
    revalidatePath(`/admin/contracts/${id}`);
    return { success: "Contract access allocation removed." };
  } catch (error) { return failure(error); }
}
export async function removePackageAssignmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    manage(member);
    const id = uuid(form, "contract_id");
    const result = await supabase.from("package_assignments").delete().eq("work_package_id", uuid(form, "package_id")).eq("user_id", uuid(form, "user_id")).select("user_id");
    checkDatabase(result.error);
    if (!result.data?.length) throw new ValidationError("No accessible allocation was removed. Refresh the record.");
    revalidatePath(`/admin/contracts/${id}`);
    return { success: "Work package access allocation removed." };
  } catch (error) { return failure(error); }
}
export async function saveMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    if (member.role !== "owner") throw new ValidationError("Only the owner can manage accounts and commercial access.");
    const result = await supabase.rpc("save_member", { p_user: uuid(form, "user_id"), p_display_name: text(form, "display_name", 160, true), p_role: memberRole(form), p_financial_access: form.get("financial_access") === "on", p_active: form.get("active") === "on" });
    checkDatabase(result.error);
    revalidatePath("/admin/team");
    return { success: "Membership updated. Contract and package allocations are still required." };
  } catch (error) { return failure(error); }
}
export async function uploadDocumentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    const id = uuid(form, "request_key"), contractId = uuid(form, "contract_id");
    const areaId = text(form, "area_id", 36) ? uuid(form, "area_id") : null;
    const classification = text(form, "classification", 20, true);
    if (!["operational", "commercial"].includes(classification)) throw new ValidationError("Choose an operational or commercial document.");
    if (classification === "commercial") financial(member);
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_FILE_BYTES) throw new ValidationError("Choose a PDF, JPEG or PNG file no larger than 4 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = inspectEvidence(bytes, file.type);
    const document = {
      id, organisation_id: member.organisation_id, contract_id: contractId, work_area_id: areaId,
      document_reference: text(form, "document_reference", 80, true), revision: integer(form, "revision", 1, 100000),
      title: text(form, "title", 160, true), classification,
      object_path: `${member.organisation_id}/${contractId}/${classification}/${areaId || "contract"}/${id}.${type.extension}`,
      sha256: type.sha256, mime_type: type.mime, bytes: bytes.length, created_by: member.user_id,
    };
    const verifier = createStorageVerifier();
    const inserted = await supabase.from("document_revisions").insert(document);
    if (inserted.error?.code === "23505") {
      const existing = await supabase.from("document_revisions").select("*").eq("id", id).maybeSingle();
      checkDatabase(existing.error);
      if (!existing.data || Object.entries(document).some(([k, v]) => (existing.data as DocumentRevision & Record<string, unknown>)[k] !== v)) throw new ValidationError("This upload request was already used for different content. Refresh for a new request.");
    } else checkDatabase(inserted.error);
    await supabase.storage.from("tilespec-evidence").upload(document.object_path, bytes, { contentType: type.mime, upsert: false });
    // Even if a user races us with a direct raw upload, verify the stored bytes
    // before privileged completion. Unverified objects remain quarantined: user
    // RLS cannot download them or assert they were validated.
    const stored = await verifier.storage.from("tilespec-evidence").download(document.object_path);
    if (stored.error || !stored.data) throw new ValidationError("Upload is pending. The file has not been confirmed in storage. Retry this same form and file.");
    const storedBytes = new Uint8Array(await stored.data.arrayBuffer());
    verifyStoredEvidence(storedBytes, document);
    const completed = await verifier.rpc("complete_document_upload", { p_document: id, p_actor: member.user_id, p_sha256: document.sha256 });
    checkDatabase(completed.error);
    revalidatePath(`/admin/contracts/${contractId}`);
    return { success: "Private document revision uploaded. Uploading evidence does not approve it." };
  } catch (error) { return failure(error); }
}
