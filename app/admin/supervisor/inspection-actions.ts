"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { inspectionInput, templateInput, requirementInput } from "@/lib/operations/inspections";
import { uuid, ValidationError } from "@/lib/operations/validation";
import { rpcErrorMessage } from "@/lib/operations/errors";
import type { ActionState } from "@/lib/operations/types";
export type InspectionActionState = ActionState & { id?: string; uncertain?: boolean };
const savedId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const uncertain = (error: { code?: string }) => !error.code || !(/^[A-Z0-9]{5}$/.test(error.code) || error.code.startsWith("PGRST"));

export async function createInspectionTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = templateInput(form);
    const result = await supabase.rpc("create_location_inspection_template", { p_request_key: uuid(form, "request_key"), p_data: input });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    if (!savedId(result.data)) throw new Error("Unconfirmed template");
    const saved = await supabase.from("location_inspection_templates").select("id,contract_id,work_area_id").eq("id", result.data).single();
    if (saved.error || saved.data?.id !== result.data || saved.data?.contract_id !== input.contract_id || saved.data?.work_area_id !== input.work_area_id) throw new Error("Unconfirmed template");
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}/inspections`);
    return { success: "Template revision saved. Previous revisions and inspections are kept." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "We could not confirm this checklist was saved. Your entries are kept here; check the published checks before retrying." }; }
}
export async function recordLocationInspectionAction(_: InspectionActionState, form: FormData): Promise<InspectionActionState> {
  const { supabase, member } = await requireActor();
  let attempted = false;
  try {
    const input = inspectionInput(form);
    const key = uuid(form, "request_key"); attempted = true;
    const result = await supabase.rpc("record_location_inspection", { p_request_key: key, p_data: input });
    if (result.error) return { error: rpcErrorMessage(result.error), uncertain: uncertain(result.error) };
    if (!savedId(result.data)) throw new Error("Unconfirmed inspection response");
    const saved = await supabase.from("location_inspections").select("id,contract_id,work_area_id,template_id,actor_id,work_package_id,answers").eq("id", result.data).single();
    if (saved.error || !saved.data || saved.data.id !== result.data || saved.data.contract_id !== input.contract_id || saved.data.work_area_id !== input.work_area_id
      || saved.data.template_id !== input.template_id || saved.data.actor_id !== member.user_id
      || (saved.data.work_package_id || null) !== (input.work_package_id || null)
      || !Array.isArray(saved.data.answers) || saved.data.answers.length !== input.answers.length
      || saved.data.answers.some((answer: { status: string }, i: number) => answer.status !== input.answers[i].status)) throw new Error("Saved inspection not confirmed");
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}/inspections`);
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}`);
    revalidatePath("/admin/holds");
    return { id: result.data, success: "Inspection saved. Any issues are recorded for the office. Existing stops and required checks still apply." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "We could not confirm this was saved. Your answers are kept here. Check saved inspection history, then retry the same result.", uncertain: attempted && !(error instanceof ValidationError) }; }
}

export async function configureInspectionRequirementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = requirementInput(form);
    const result = await supabase.rpc("configure_inspection_requirement", { p_request_key: uuid(form, "request_key"), p_data: input });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    if (!savedId(result.data)) throw new Error("Unconfirmed applicability");
    const saved = await supabase.from("location_inspection_requirements").select("id,contract_id,work_area_id").eq("id", result.data).single();
    if (saved.error || saved.data?.id !== result.data || saved.data?.contract_id !== input.contract_id || saved.data?.work_area_id !== input.work_area_id) throw new Error("Unconfirmed applicability");
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}/inspections`);
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}`);
    revalidatePath("/admin/holds");
    return { success: "Inspection applicability saved with the office approval and exact document revisions. Earlier decisions are retained." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "We could not confirm these requirements were saved. Your entries are kept here; check the current requirements before retrying." }; }
}
