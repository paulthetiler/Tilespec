/*
 * Email alerts to the office for each enquiry from the website.
 *
 * The database queues exactly one alert when an enquiry is confirmed (every file arrived). This module
 * claims it, turns it into an email, sends it through the existing email service and reports the outcome,
 * which the database logs and, after a failure, schedules for a retry. Nothing here throws: a failed alert
 * never affects the visitor's enquiry, which is in the office inbox either way.
 *
 * The email carries no private link: the admin link opens the signed-in tender inbox, and documents are
 * listed by name only (they stay in private storage). No server-only import, so it is tested directly;
 * the database call and the email transport are passed in.
 */
import type { RenderedEmail } from "./render";

export const DEFAULT_ENQUIRY_RECIPIENT = "info@tilespec.uk";
const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
/** The number of attempts after which the database stops retrying on its own. */
export const AUTOMATIC_ATTEMPTS = 8;

export type EnquiryDetails = {
  reference: string; kind: string; name: string; company: string; email: string; project: string;
  deadline: string | null; message: string; received_at: string | null; files: { name: string; size: number }[];
};
export type EnquiryClaim = { claim: string; notification: string; attempt: number; enquiry: EnquiryDetails };
export type SendOutcome = { ok: true; providerId: string } | { ok: false; error: string; retryable?: boolean };
export type EnquirySender = (input: { id: string; to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<SendOutcome>;
export type RpcError = { code?: string; message?: string } | null;
export type EnquiryRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
type Log = Pick<Console, "info" | "warn" | "error">;
export type EnquiryDeps = {
  rpc: EnquiryRpc; send: EnquirySender; configured: boolean; to: string; baseUrl: string;
  log?: Log; wait?: (ms: number) => Promise<void>;
};
export type Delivery = { reference: string; result: "sent" | "failed"; reported: boolean; error?: string };

/** The office mailbox: ENQUIRY_NOTIFICATIONS_TO when it is a valid address, else info@tilespec.uk. */
export function enquiryRecipient(env: Record<string, string | undefined> = process.env) {
  const configured = env.ENQUIRY_NOTIFICATIONS_TO?.trim();
  return configured && configured.length <= 254 && EMAIL.test(configured) ? configured : DEFAULT_ENQUIRY_RECIPIENT;
}
/** The signed-in tender inbox, filtered to this enquiry. Sign-in is required; the reference grants nothing. */
export function adminEnquiryPath(reference: string) {
  return `/admin/tenders?ref=${encodeURIComponent(reference)}`;
}

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const oneLine = (value: string) => value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const when = (iso: string | null) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(date) : "";
};
const day = (iso: string | null) => iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "";

/**
 * The alert email. Deterministic for the same enquiry (no clock), because a retry reuses the alert's
 * idempotency key and the email service accepts a repeated key only with the same message.
 */
export function renderEnquiryNotification(e: EnquiryDetails, baseUrl: string): RenderedEmail {
  const tender = e.kind !== "general";
  const who = oneLine(e.company || e.name);
  const subject = oneLine(`New ${tender ? "tender" : "general"} enquiry ${e.reference}: ${who}${e.project ? ` – ${e.project}` : ""}`).slice(0, 200);
  const link = new URL(adminEnquiryPath(e.reference), baseUrl).toString();
  const files = e.files ?? [];
  const rows: [string, string, string?][] = [
    ["Reference", e.reference], ["Type", tender ? "Tender enquiry" : "General enquiry"], ["Name", e.name],
    ["Company", e.company || "Not given"], ["Email", e.email, `mailto:${e.email}`], ["Project", e.project || "Not given"],
    ...(tender && e.deadline ? [["Tender return date", day(e.deadline) || e.deadline] as [string, string]] : []),
    ["Received", when(e.received_at)],
  ];
  const documents = files.length
    ? `${files.length} document${files.length === 1 ? "" : "s"} (${size(files.reduce((sum, f) => sum + (Number(f.size) || 0), 0))}), stored privately`
    : "None attached";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#0f2a3a">
<div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d7e2e5;border-radius:10px;padding:24px">
<p style="margin:0 0 4px;color:#326e67;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">TileSPEC website</p>
<h1 style="margin:0 0 16px;font-size:22px">New ${tender ? "tender" : "general"} enquiry ${esc(e.reference)}</h1>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([label, value, href]) =>
  `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#536b77;font-weight:normal;white-space:nowrap">${esc(label)}</th><td style="padding:6px 0">${href ? `<a href="${esc(href)}" style="color:#326e67">${esc(value)}</a>` : esc(value)}</td></tr>`).join("")}
<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#536b77;font-weight:normal;white-space:nowrap">Documents</th><td style="padding:6px 0">${esc(documents)}${files.length ? `<ul style="margin:6px 0 0;padding-left:18px">${files.map(f => `<li>${esc(f.name)} (${esc(size(Number(f.size) || 0))})</li>`).join("")}</ul>` : ""}</td></tr>
</table>
<h2 style="margin:20px 0 8px;font-size:16px">Message</h2>
<p style="margin:0;white-space:pre-wrap">${e.message ? esc(e.message) : "No message."}</p>
<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;background:#326e67;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Open in the tender inbox</a></p>
<p style="margin:16px 0 0;color:#536b77;font-size:12px">Sign in to open the documents: they are never attached or linked from this email. Reply to this email to answer ${esc(e.name)} directly. Sent automatically by the TileSPEC website once the enquiry and all its documents were received.</p>
</div></body></html>`;
  const text = [
    `New ${tender ? "tender" : "general"} enquiry ${e.reference}`, "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `Documents: ${documents}`, ...files.map(f => `  - ${f.name} (${size(Number(f.size) || 0)})`), "",
    "Message:", e.message || "No message.", "",
    `Open in the tender inbox (sign in required): ${link}`, "",
    `Documents are never attached or linked from this email. Reply to this email to answer ${e.name} directly.`,
  ].join("\n");
  return { subject, html, text };
}

/** A claim returned by the database, checked before anything is sent. */
export function parseClaim(value: unknown): EnquiryClaim | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>, e = v.enquiry as Record<string, unknown> | undefined;
  if (typeof v.claim !== "string" || typeof v.notification !== "string" || !e || typeof e.reference !== "string" || typeof e.email !== "string") return null;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    claim: v.claim, notification: v.notification, attempt: Number(v.attempt) || 1,
    enquiry: { reference: e.reference, kind: str(e.kind), name: str(e.name), company: str(e.company), email: e.email, project: str(e.project),
      deadline: typeof e.deadline === "string" ? e.deadline : null, message: str(e.message), received_at: typeof e.received_at === "string" ? e.received_at : null,
      files: (Array.isArray(e.files) ? e.files : []).map(f => ({ name: str((f as Record<string, unknown>)?.name), size: Number((f as Record<string, unknown>)?.size) || 0 })) },
  };
}

const missingFunction = (error: RpcError) => !!error && ["PGRST202", "42883"].includes(error.code ?? "");

/**
 * Sends one claimed alert and reports the outcome. A transient failure (no answer, rate limit, server
 * error) is tried once more straight away with the same idempotency key; anything else is reported as
 * failed for the database to retry later.
 */
export async function deliverEnquiryNotification(claim: EnquiryClaim, deps: EnquiryDeps): Promise<Delivery> {
  const log = deps.log ?? console, wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const reference = claim.enquiry.reference;
  let outcome: SendOutcome;
  try {
    const email = renderEnquiryNotification(claim.enquiry, deps.baseUrl);
    const message = { id: claim.notification, to: deps.to, subject: email.subject, html: email.html, text: email.text,
      ...(EMAIL.test(claim.enquiry.email) ? { replyTo: claim.enquiry.email } : {}) };
    outcome = await deps.send(message);
    if (!outcome.ok && outcome.retryable) { await wait(1500); outcome = await deps.send(message); }
  } catch {
    outcome = { ok: false, error: "The email could not be prepared or sent" };
  }
  let reported = false;
  try {
    // Whoever claimed the attempt reports it: the visitor's or schedule's signed-out connection, or the office's session.
    const sent = outcome.ok ? outcome.providerId : null, error = outcome.ok ? null : outcome.error;
    const report = await deps.rpc("report_enquiry_notification", { p_claim: claim.claim, p_result: sent ? "sent" : "failed", p_recipient: deps.to, p_provider_id: sent, p_error: error });
    reported = !report.error;
    if (report.error) log.error(`Enquiry alert ${reference}: the outcome could not be recorded (${report.error.code ?? "unknown"}); it will be retried`);
  } catch {
    log.error(`Enquiry alert ${reference}: the outcome could not be recorded; it will be retried`);
  }
  if (outcome.ok) { log.info(`Enquiry alert ${reference} sent`); return { reference, result: "sent", reported }; }
  log.error(`Enquiry alert ${reference} not sent: ${outcome.error}`);
  return { reference, result: "failed", reported, error: outcome.error };
}

export type SubmissionNotice = { status: "not configured" | "not installed" | "nothing to send" | "unavailable" } | ({ status: "delivered" } & Delivery);

/** Straight after a visitor's enquiry is confirmed: the first attempt, proved by the visitor's one-time token. */
export async function notifySubmittedEnquiry(input: { id: string; token: string }, deps: EnquiryDeps): Promise<SubmissionNotice> {
  const log = deps.log ?? console;
  // Without an email service the alert stays queued; the schedule or the office sends it once configured.
  if (!deps.configured) { log.warn("Enquiry alert queued but not sent: the email service is not configured"); return { status: "not configured" }; }
  // The signed-out connection: the visitor's one-time token is what allows the claim.
  const publicClient = { rpc: deps.rpc };
  try {
    const { data, error } = await publicClient.rpc("claim_submitted_enquiry_notification", { p_id: input.id, p_token: input.token });
    if (missingFunction(error)) { log.warn("Enquiry alerts are not installed in the database yet"); return { status: "not installed" }; }
    if (error) { log.error(`Enquiry alert could not be claimed (${error.code ?? "unknown"}); the schedule will retry`); return { status: "unavailable" }; }
    const claim = parseClaim(data);
    if (!claim) return { status: "nothing to send" };
    return { status: "delivered", ...(await deliverEnquiryNotification(claim, deps)) };
  } catch {
    log.error("Enquiry alert could not be claimed; the schedule will retry");
    return { status: "unavailable" };
  }
}

/** The scheduled retry: every due alert, one at a time. */
export async function dispatchDueEnquiryNotifications(key: string, deps: EnquiryDeps, limit = 10) {
  if (!deps.configured) return { status: "not configured" as const, sent: 0, failed: 0 };
  // The signed-out connection: the owner's retry key is what allows the claim.
  const publicClient = { rpc: deps.rpc };
  const { data, error } = await publicClient.rpc("claim_due_enquiry_notifications", { p_key: key, p_limit: limit });
  if (missingFunction(error)) return { status: "not installed" as const, sent: 0, failed: 0 };
  if (error) return { status: error.code === "42501" ? "key not recognised" as const : "error" as const, sent: 0, failed: 0 };
  const results = { sent: 0, failed: 0 };
  for (const row of Array.isArray(data) ? data : []) {
    const claim = parseClaim(row);
    if (!claim) continue;
    const delivery = await deliverEnquiryNotification(claim, deps);
    results[delivery.result] += 1;
  }
  return { status: "ok" as const, ...results };
}

/** The owner or a contracts manager sends one alert now, in their own signed-in session. */
export async function sendEnquiryNotificationNow(notification: string, deps: EnquiryDeps):
  Promise<{ ok: true; delivery: Delivery } | { ok: false; error: NonNullable<RpcError> | { message: string } }> {
  if (!deps.configured) return { ok: false, error: { message: "The email service is not configured yet, so the alert stays queued." } };
  const { data, error } = await deps.rpc("claim_enquiry_notification_for_office", { p_notification: notification });
  if (error) return { ok: false, error };
  const claim = parseClaim(data);
  if (!claim) return { ok: false, error: { message: "The alert could not be prepared. Refresh and try again." } };
  return { ok: true, delivery: await deliverEnquiryNotification(claim, deps) };
}
