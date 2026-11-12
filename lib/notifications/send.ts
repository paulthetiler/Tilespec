import "server-only";

/** Email delivery is configured only through the hosting settings. Nothing is sent without all three. */
export function emailConfiguration(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.NOTIFICATIONS_FROM?.trim(), replyTo = env.NOTIFICATIONS_REPLY_TO?.trim();
  return { configured: !!apiKey && !!from && /<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(from ?? ""), apiKey, from, replyTo: replyTo || undefined };
}
/** The public address emails link to: an explicit setting, else the production domain Vercel provides. */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env) {
  const explicit = env.NOTIFICATIONS_BASE_URL?.trim();
  if (explicit && /^https:\/\//.test(explicit)) return explicit;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : "https://tilespec.vercel.app";
}

/** The email service's address. Only an automated test points it at a local stand-in on this machine. */
export function emailEndpoint(env: Record<string, string | undefined> = process.env) {
  const override = env.NOTIFICATIONS_EMAIL_ENDPOINT?.trim();
  if (override && (/^https:\/\//.test(override) || (env.NODE_ENV !== "production" && /^http:\/\/127\.0\.0\.1:\d+\//.test(override)))) return override;
  return "https://api.resend.com/emails";
}
/**
 * One email through Resend. The outbox id is the idempotency key, so a retried request is never sent twice.
 * `replyTo` (for example the customer who sent an enquiry) takes the place of NOTIFICATIONS_REPLY_TO.
 * `retryable` marks a failure worth trying again soon: no answer, a rate limit or a server error. The
 * service's own explanation is kept (shortened) for the delivery log; the API key never appears in it.
 */
export async function sendEmail(input: { id: string; to: string; subject: string; html: string; text: string; replyTo?: string }, fetcher: typeof fetch = fetch):
  Promise<{ ok: true; providerId: string } | { ok: false; error: string; retryable: boolean }> {
  const config = emailConfiguration();
  if (!config.configured) return { ok: false, error: "Email service is not configured", retryable: false };
  const replyTo = input.replyTo || config.replyTo;
  try {
    const response = await fetcher(emailEndpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.id },
      body: JSON.stringify({ from: config.from, to: [input.to], subject: input.subject, html: input.html, text: input.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) {
      const reason = typeof body.message === "string" ? `: ${body.message.replaceAll(config.apiKey ?? "", "[key]").slice(0, 300)}` : "";
      return { ok: false, error: `Email service refused the message (${response.status}${body.name ? ` ${body.name}` : ""})${reason}`,
        retryable: response.status === 429 || response.status >= 500 || body.name === "concurrent_idempotent_requests" };
    }
    return { ok: true, providerId: body.id };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error && error.name === "TimeoutError" ? "Email service did not answer in time" : "Email service could not be reached" };
  }
}
