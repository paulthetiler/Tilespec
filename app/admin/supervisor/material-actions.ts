"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { materialsInput } from "@/lib/operations/job-costs";
import { text, uuid, ValidationError } from "@/lib/operations/validation";
import type { DailyActionState } from "@/components/site/daily-form";

// Materials used on site: items and quantities only, never a price. The database checks the person
// is a supervisor or the office on this job; the office matches them to purchases separately.
const uncertain = "We could not confirm the save. Your entries are kept here. Check your connection, then retry the same details.";
function refresh(contract: string) {
  revalidatePath(`/admin/supervisor/sites/${contract}/materials`);
  revalidatePath(`/admin/contracts/${contract}/money`);
}

export async function recordMaterialsAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  let attempted = false;
  try {
    const data = materialsInput(form), key = uuid(form, "request_key");
    attempted = true;
    const result = await supabase.rpc("record_materials_used", { p_request_key: key, p_data: data });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(data.contract_id);
    return { id: String(result.data), success: `${data.lines.length === 1 ? "1 material" : `${data.lines.length} materials`} saved for the office.` };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : uncertain, uncertain: attempted && !(error instanceof ValidationError) };
  }
}

export async function voidMaterialAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  const { supabase } = await requireActor();
  try {
    const record = uuid(form, "record_id"), contract = uuid(form, "contract_id"), reason = text(form, "reason", 1000, true);
    if (reason.length < 3) throw new ValidationError("Say why it is being removed.");
    const result = await supabase.rpc("void_material_record", { p_record: record, p_reason: reason });
    if (result.error) return { error: rpcErrorMessage(result.error) };
    refresh(contract);
    return { success: "Removed. The office can still see it was entered and why it was removed." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : uncertain }; }
}
