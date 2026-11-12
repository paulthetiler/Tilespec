"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { uuid, ValidationError } from "@/lib/operations/validation";
import { sendEnquiryNotificationNow } from "@/lib/notifications/enquiry";
import { enquiryDeps } from "@/lib/notifications/enquiry-server";
import type { DailyActionState } from "@/components/site/daily-form";

// Enquiry email alerts from the tender inbox, in the signed-in person's own session: the database checks
// that they are the owner or a contracts manager, and never sends an alert that was already sent.
export async function sendEnquiryAlertAction(_: DailyActionState, form: FormData): Promise<DailyActionState> {
  try {
    const { supabase, member } = await requireActor();
    if (member.role !== "owner" && member.role !== "contracts_manager") return { error: "Only the owner or a contracts manager can send enquiry alerts." };
    // The page is not refreshed here: a sent alert's button disappears on refresh, which would hide this answer.
    const outcome = await sendEnquiryNotificationNow(uuid(form, "notification_id"), enquiryDeps(supabase));
    if (!outcome.ok) return { error: "code" in outcome.error ? rpcErrorMessage(outcome.error) : outcome.error.message ?? "The alert could not be sent." };
    if (outcome.delivery.result === "sent") return { success: outcome.delivery.reported ? "Alert sent. Refresh to see it recorded." : "Alert sent. Its log entry could not be saved; refresh before sending again." };
    return { error: `The alert was not sent: ${outcome.delivery.error ?? "the email service refused it"}. It is logged and will be retried.` };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "The alert could not be confirmed. Refresh to see whether it was sent before trying again.", uncertain: !(error instanceof ValidationError) };
  }
}

export async function rotateEnquiryRetryKeyAction(_: DailyActionState): Promise<DailyActionState> {
  try {
    const { supabase, member } = await requireActor();
    if (member.role !== "owner") return { error: "Only the owner manages enquiry email alerts." };
    const result = await supabase.rpc("rotate_enquiry_notification_key");
    if (result.error) return { error: rpcErrorMessage(result.error) };
    revalidatePath("/admin/tenders");
    return { success: `New retry key: ${String(result.data)} — add it in Vercel → Settings → Environment Variables (Production, Sensitive) as ENQUIRY_NOTIFICATIONS_KEY, then redeploy. It is not shown again; creating another key stops this one working.` };
  } catch {
    return { error: "The key could not be confirmed. Refresh, then create a new key if none is shown as created.", uncertain: true };
  }
}
