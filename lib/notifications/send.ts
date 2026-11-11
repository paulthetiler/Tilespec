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

/** One email through Resend. The outbox id is the idempotency key, so a retried request is never sent twice. */
export async function sendEmail(input: { id: string; to: string; subject: string; html: string; text: string }, fetcher: typeof fetch = fetch):
  Promise<{ ok: true; providerId: string } | { ok: false; error: string }> {
  const config = emailConfiguration();
  if (!config.configured) return { ok: false, error: "Email service is not configured" };
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.id },
      body: JSON.stringify({ from: config.from, to: [input.to], subject: input.subject, html: input.html, text: input.text, ...(config.replyTo ? { reply_to: config.replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) return { ok: false, error: `Email service refused the message (${response.status}${body.name ? ` ${body.name}` : ""})` };
    return { ok: true, providerId: body.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "Email service did not answer in time" : "Email service could not be reached" };
  }
}
