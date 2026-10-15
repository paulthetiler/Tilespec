"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import { notificationId } from "@/lib/operations/quality";
import { uuid } from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

export async function markAlertReadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const result = await supabase.rpc("mark_hold_notification_read", { p_notification: notificationId(form.get("notification_id")), p_request_key: uuid(form, "request_key") });
    checkRpc(result.error);
    if (typeof result.data !== "string") return { error: "The alert read state was not confirmed. Retry with the same request." };
    revalidatePath("/admin/alerts"); revalidatePath("/admin/quality"); revalidatePath("/admin", "layout");
    return { success: "Alert marked read and saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not confirm the alert was marked read. Retry with the same request." };
  }
}
