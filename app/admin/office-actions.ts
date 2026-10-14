"use server";

import { revalidatePath } from "next/cache";
import { requireActor, canManageContracts } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { buildLocationItems } from "@/lib/operations/locations";
import {
  accreditationInput, companyInput, companyUpdateInput, insuranceInput, integer, locationBuilderInput, locationUpdateInput,
  membershipInput, operativeInput, operativeUpdateInput, planInput, requiredDate, teamInput, text, uuid, ValidationError,
} from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

// Office screens for Supervisor V2. Every write is a Supervisor V2 database function
// called with the signed-in user's own session; row-level security and the
// function's checks decide what is allowed. Pages refresh only after success.
const failure = (error: unknown): ActionState => ({ error: error instanceof Error ? error.message : "The change could not be saved. Try again." });
function reason(form: FormData, required: boolean) {
  const value = text(form, "reason", 2000, required);
  if (required && value.length < 5) throw new ValidationError("Give a short reason (at least 5 characters).");
  return value;
}

export async function createCompanyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = companyInput(form);
    checkRpc((await supabase.rpc("create_company", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidatePath("/admin/workforce");
    return { success: `${input.name} added. Link its gangs and operatives to it below.` };
  } catch (error) { return failure(error); }
}
export async function updateCompanyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("update_company", { p_company: uuid(form, "company_id"), p_version: integer(form, "version", 1), p_data: companyUpdateInput(form) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Company saved." };
  } catch (error) { return failure(error); }
}
export async function recordInsuranceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("record_company_insurance", { p_request_key: uuid(form, "request_key"), p_data: insuranceInput(form) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Insurance recorded." };
  } catch (error) { return failure(error); }
}
export async function recordAccreditationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("record_company_accreditation", { p_request_key: uuid(form, "request_key"), p_data: accreditationInput(form) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Accreditation recorded." };
  } catch (error) { return failure(error); }
}
export async function voidInsuranceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("void_company_insurance", { p_insurance: uuid(form, "record_id"), p_reason: reason(form, true) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Marked as entered in error. The entry is kept with your reason." };
  } catch (error) { return failure(error); }
}
export async function voidAccreditationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("void_company_accreditation", { p_accreditation: uuid(form, "record_id"), p_reason: reason(form, true) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Marked as entered in error. The entry is kept with your reason." };
  } catch (error) { return failure(error); }
}
export async function createOperativeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    const input = operativeInput(form, canManageContracts(member));
    checkRpc((await supabase.rpc("create_operative", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidatePath("/admin/workforce");
    return { success: `${input.display_name} added.` };
  } catch (error) { return failure(error); }
}
export async function updateOperativeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("update_operative", { p_operative: uuid(form, "operative_id"), p_version: integer(form, "version", 1), p_data: operativeUpdateInput(form) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Operative saved." };
  } catch (error) { return failure(error); }
}
export async function confirmOperativeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("update_operative", { p_operative: uuid(form, "operative_id"), p_version: integer(form, "version", 1), p_data: { status: "active" } })).error);
    revalidatePath("/admin/workforce");
    return { success: "Confirmed. They can now be named in plans." };
  } catch (error) { return failure(error); }
}
export async function createTeamAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = teamInput(form);
    checkRpc((await supabase.rpc("create_team", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidatePath("/admin/workforce");
    return { success: `${input.name} created. Add its members below.` };
  } catch (error) { return failure(error); }
}
export async function updateTeamAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("update_team", { p_team: uuid(form, "team_id"), p_version: integer(form, "version", 1), p_data: { ...teamInput(form), active: form.get("active") === "on" } })).error);
    revalidatePath("/admin/workforce");
    return { success: "Team saved." };
  } catch (error) { return failure(error); }
}
export async function addTeamMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("add_team_member", { p_request_key: uuid(form, "request_key"), p_data: membershipInput(form) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Member added." };
  } catch (error) { return failure(error); }
}
export async function endMembershipAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("end_team_membership", { p_membership: uuid(form, "membership_id"), p_valid_until: requiredDate(form, "valid_until", "last day in the team"), p_reason: reason(form, false) || null })).error);
    revalidatePath("/admin/workforce");
    return { success: "Membership ended. Their earlier time in the team stays on record." };
  } catch (error) { return failure(error); }
}
export async function voidMembershipAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("void_team_membership", { p_membership: uuid(form, "membership_id"), p_reason: reason(form, true) })).error);
    revalidatePath("/admin/workforce");
    return { success: "Marked as entered in error. The record is kept with your reason." };
  } catch (error) { return failure(error); }
}

function revalidateContract(contractId: string) {
  for (const path of ["", "/locations", "/plan"]) revalidatePath(`/admin/contracts/${contractId}${path}`);
}
export async function createLocationsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const contractId = uuid(form, "contract_id");
    const parentId = text(form, "parent_id", 36) ? uuid(form, "parent_id") : null;
    const { items, total } = buildLocationItems(locationBuilderInput(form));
    checkRpc((await supabase.rpc("create_locations", { p_contract: contractId, p_request_key: uuid(form, "request_key"), p_parent: parentId, p_items: items })).error);
    revalidateContract(contractId);
    return { success: `${total.toLocaleString("en-GB")} ${total === 1 ? "location" : "locations"} created.` };
  } catch (error) { return failure(error); }
}
export async function updateLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const contractId = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("update_location", { p_area: uuid(form, "location_id"), p_version: integer(form, "version", 1), p_data: locationUpdateInput(form) })).error);
    revalidateContract(contractId);
    return { success: "Location saved." };
  } catch (error) { return failure(error); }
}
export async function archiveLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const contractId = uuid(form, "contract_id");
    const result = await supabase.rpc("archive_location", { p_area: uuid(form, "location_id"), p_version: integer(form, "version", 1), p_reason: reason(form, true) });
    checkRpc(result.error);
    revalidateContract(contractId);
    return { success: `Archived ${result.data === 1 ? "this location" : `this location and ${Number(result.data) - 1} inside it`}. Its records are kept.` };
  } catch (error) { return failure(error); }
}

export async function planAllocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = planInput(form);
    checkRpc((await supabase.rpc("plan_allocation", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidateContract(input.contract_id);
    return { success: input.supersedes_id ? "Plan changed. The earlier version is kept in the history." : "Added to the plan." };
  } catch (error) { return failure(error); }
}
export async function cancelPlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const contractId = uuid(form, "contract_id");
    checkRpc((await supabase.rpc("cancel_planned_allocation", { p_plan: uuid(form, "plan_id"), p_reason: reason(form, true) })).error);
    revalidateContract(contractId);
    return { success: "Planned work cancelled. It stays in the history with your reason." };
  } catch (error) { return failure(error); }
}
