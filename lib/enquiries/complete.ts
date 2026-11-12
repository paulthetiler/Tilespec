/*
 * Confirms a visitor's enquiry once its files have arrived, then hands the office's email alert to work that
 * runs after the visitor has their answer. The database checks the visitor's one-time token and that every
 * reserved file is stored at its declared size, and queues the alert in the same transaction. The email's
 * outcome can never change the answer: a confirmed enquiry is always reported as received.
 */
import type { EnquiryRpc } from "@/lib/notifications/enquiry";

export type CompletionDeps = {
  /** The publishable-key database connection, or null when the enquiry form is not configured. */
  rpc: EnquiryRpc | null;
  /** Runs work after the response has been sent (Next.js `after`). */
  schedule: (task: () => Promise<unknown>) => void;
  /** Sends the office's alert for this enquiry. Never throws. */
  notify: (input: { id: string; token: string }) => Promise<unknown>;
  log?: Pick<Console, "error">;
};
export type CompletionResult = { status: number; body: Record<string, unknown> };

export async function completeEnquiry(input: unknown, deps: CompletionDeps): Promise<CompletionResult> {
  const log = deps.log ?? console;
  const { id, token } = (input && typeof input === "object" ? input : {}) as { id?: unknown; token?: unknown };
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id) || typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token))
    return { status: 400, body: { error: "Invalid submission" } };
  try {
    if (!deps.rpc) throw new Error("Tender intake not configured");
    const publicClient = { rpc: deps.rpc };
    const { data, error } = await publicClient.rpc("complete_tender_enquiry", { p_id: id, p_token: token });
    if (error) {
      if (error.code === "42501") return { status: 403, body: { error: "Invalid submission" } };
      if (error.code === "22023") return { status: 409, body: { error: "Invalid status" } };
      throw error;
    }
    if (data !== "received") return { status: 409, body: { error: "Files have not all finished uploading. Please retry." } };
  } catch (error) {
    log.error("Tender completion failed", error);
    return { status: 503, body: { error: "Unable to confirm submission" } };
  }
  // Confirmed, and the alert is queued. A repeated confirmation finds the alert already claimed or sent, so it
  // sends nothing more.
  try {
    deps.schedule(() => deps.notify({ id, token }).catch(() => log.error("Enquiry alert failed unexpectedly; the schedule will retry")));
  } catch {
    log.error("Enquiry alert could not be started; the schedule will retry");
  }
  return { status: 200, body: { ok: true } };
}
