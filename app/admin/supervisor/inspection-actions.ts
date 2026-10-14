"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { inspectionInput, templateInput } from "@/lib/operations/inspections";
import { uuid } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

export async function createInspectionTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = templateInput(form);
    checkRpc((await supabase.rpc("create_location_inspection_template", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}/inspections`);
    return { success: "Template revision saved. Previous revisions and inspections are kept." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Template could not be saved." }; }
}
export async function recordLocationInspectionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = inspectionInput(form);
    checkRpc((await supabase.rpc("record_location_inspection", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    revalidatePath(`/admin/supervisor/sites/${input.contract_id}/inspections`);
    return { success: "Inspection saved with its workforce links. This does not release work or approve a specification." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Inspection could not be saved." }; }
}
