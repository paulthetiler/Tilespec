import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import {
  DEFAULT_ENQUIRY_RECIPIENT, adminEnquiryPath, dispatchDueEnquiryNotifications, enquiryRecipient, notifySubmittedEnquiry, parseClaim,
  renderEnquiryNotification, sendEnquiryNotificationNow, type EnquiryDeps, type EnquiryDetails, type SendOutcome,
} from "../lib/notifications/enquiry";
import { completeEnquiry } from "../lib/enquiries/complete";

// Enquiry email alerts: what the office receives, and that a confirmed enquiry is never reported as failed,
// never loses its alert and never alerts twice. The database half (queue, claims, retries, permissions) is
// proved in tests/db/enquiry-notifications.test.sql.

const id = "9855e30e-0000-4000-8000-000000000001", token = "a".repeat(48);
const enquiry: EnquiryDetails = {
  reference: "TS-9855E30E", kind: "tender", name: "Sam <Buyer>", company: "Example Build & Co", email: "sam@example.invalid",
  project: "School refurbishment\r\nBcc: someone@example.invalid", deadline: "2027-01-15", message: "Please price <b>all</b> areas.\nThanks",
  received_at: "2026-11-12T14:37:13.767Z", files: [{ name: "Ground floor.pdf", size: 2_621_440 }, { name: "Schedule.xlsx", size: 20_480 }],
};
const claimRow = (attempt = 1) => ({ claim: "c1a1m000-0000-4000-8000-000000000001", notification: "a1e70000-0000-4000-8000-000000000001", attempt, enquiry });
type Call = { fn: string; args: Record<string, unknown> };
const quiet = { info() {}, warn() {}, error() {} };

/** A stand-in database that behaves like the real one: an alert is claimed once and reported once. */
function fakeDatabase(options: { claimError?: { code: string; message?: string }; reportError?: boolean; due?: number } = {}) {
  const calls: Call[] = [];
  let pending = true, reported = 0;
  const rpc: EnquiryDeps["rpc"] = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "claim_submitted_enquiry_notification") {
      if (options.claimError) return { data: null, error: options.claimError };
      if (args.p_token !== token) return { data: null, error: { code: "42501", message: "Invalid submission" } };
      if (!pending) return { data: null, error: null };
      pending = false; return { data: claimRow(), error: null };
    }
    if (fn === "claim_due_enquiry_notifications") {
      if (args.p_key !== "k".repeat(64)) return { data: null, error: { code: "42501" } };
      return { data: Array.from({ length: options.due ?? 0 }, (_, n) => ({ ...claimRow(2), claim: `claim-${n}`, notification: `alert-${n}` })), error: null };
    }
    if (fn === "claim_enquiry_notification_for_office") return pending ? (pending = false, { data: claimRow(3), error: null }) : { data: null, error: { code: "23514", message: "This alert has already been sent" } };
    if (fn === "report_enquiry_notification") { reported += 1; return options.reportError ? { data: null, error: { code: "08006" } } : { data: args.p_result === "sent" ? "sent" : "retry", error: null }; }
    return { data: null, error: { code: "PGRST202" } };
  };
  return { rpc, calls, reports: () => calls.filter(c => c.fn === "report_enquiry_notification"), get reported() { return reported; } };
}
function fakeSender(outcomes: (SendOutcome | Error)[]) {
  const sent: Parameters<EnquiryDeps["send"]>[0][] = [];
  const send: EnquiryDeps["send"] = async input => {
    sent.push(input);
    const next = outcomes[Math.min(sent.length - 1, outcomes.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { send, sent };
}
const deps = (db: ReturnType<typeof fakeDatabase>, sender: ReturnType<typeof fakeSender>, overrides: Partial<EnquiryDeps> = {}): EnquiryDeps => ({
  rpc: db.rpc, send: sender.send, configured: true, to: DEFAULT_ENQUIRY_RECIPIENT, baseUrl: "https://tilespec.uk", log: quiet, wait: async () => {}, ...overrides,
});

test("the alert carries the customer, company, email, project, reference and a sign-in admin link", () => {
  const email = renderEnquiryNotification(enquiry, "https://tilespec.uk");
  for (const part of [email.html, email.text]) {
    assert.match(part, /TS-9855E30E/);
    assert.match(part, /sam@example\.invalid/);
    assert.match(part, /15 January 2027/);
    assert.match(part, /Ground floor\.pdf/);
    assert.match(part, /2 documents \(2\.5 MB\), stored privately/);
    assert.ok(part.includes("https://tilespec.uk/admin/tenders?ref=TS-9855E30E"));
  }
  assert.match(email.text, /Name: Sam <Buyer>/);
  assert.match(email.text, /Company: Example Build & Co/);
  assert.match(email.text, /Please price <b>all<\/b> areas\.\nThanks/);
  assert.equal(email.subject, "New tender enquiry TS-9855E30E: Example Build & Co – School refurbishment Bcc: someone@example.invalid");
  assert.ok(!/[\r\n]/.test(email.subject), "nothing typed by a visitor can break the subject line");
  assert.equal(adminEnquiryPath("TS-9855E30E"), "/admin/tenders?ref=TS-9855E30E");
});

test("everything a visitor typed is escaped in the HTML email", () => {
  const { html } = renderEnquiryNotification(enquiry, "https://tilespec.uk");
  assert.ok(html.includes("Sam &lt;Buyer&gt;") && html.includes("Example Build &amp; Co") && html.includes("Please price &lt;b&gt;all&lt;/b&gt; areas."));
  assert.ok(!html.includes("<b>all</b>") && !html.includes("<Buyer>"));
});

test("the alert never exposes a private file, a storage path, a signed link or a token", () => {
  const withPath = { ...enquiry, files: [{ name: "plan.pdf", size: 10, path: "9855e30e/secret.pdf", url: "https://x.supabase.co/storage/v1/object/sign/x?token=abc" }] };
  const { html, text } = renderEnquiryNotification(parseClaim({ ...claimRow(), enquiry: withPath })!.enquiry, "https://tilespec.uk");
  for (const part of [html, text]) {
    assert.ok(!/secret\.pdf|storage\/v1|token=|supabase/.test(part), "only file names and sizes reach the email");
    const links = [...part.matchAll(/https?:\/\/[^\s"<)]+/g)].map(m => m[0]);
    assert.deepEqual([...new Set(links)], ["https://tilespec.uk/admin/tenders?ref=TS-9855E30E"], "the only web link is the signed-in tender inbox");
  }
  assert.equal(renderEnquiryNotification({ ...enquiry, kind: "general", files: [] }, "https://tilespec.uk").subject.startsWith("New general enquiry"), true);
});

test("the same enquiry always renders the same email, so a retry can reuse its idempotency key", () => {
  assert.deepEqual(renderEnquiryNotification(enquiry, "https://tilespec.uk"), renderEnquiryNotification(structuredClone(enquiry), "https://tilespec.uk"));
});

test("the recipient is info@tilespec.uk unless a valid override is configured", () => {
  assert.equal(enquiryRecipient({}), "info@tilespec.uk");
  assert.equal(enquiryRecipient({ ENQUIRY_NOTIFICATIONS_TO: " office@example.invalid " }), "office@example.invalid");
  assert.equal(enquiryRecipient({ ENQUIRY_NOTIFICATIONS_TO: "not an address" }), "info@tilespec.uk");
});

test("a successful submission sends one alert to the office, replying to the customer, and records it", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: true, providerId: "re_123" }]);
  const result = await notifySubmittedEnquiry({ id, token }, deps(db, sender));
  assert.equal(result.status, "delivered");
  assert.equal(sender.sent.length, 1);
  assert.deepEqual({ to: sender.sent[0].to, replyTo: sender.sent[0].replyTo, id: sender.sent[0].id },
    { to: "info@tilespec.uk", replyTo: "sam@example.invalid", id: "a1e70000-0000-4000-8000-000000000001" });
  assert.deepEqual(db.reports().map(r => r.args), [{ p_claim: claimRow().claim, p_result: "sent", p_recipient: "info@tilespec.uk", p_provider_id: "re_123", p_error: null }]);
});

test("an email failure is reported to the database for a retry, and never thrown", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: false, error: "Email service refused the message (403 validation_error)", retryable: false }]);
  const result = await notifySubmittedEnquiry({ id, token }, deps(db, sender));
  assert.equal(result.status === "delivered" && result.result, "failed");
  assert.equal(sender.sent.length, 1, "a permanent refusal is not hammered");
  assert.deepEqual(db.reports().map(r => [r.args.p_result, r.args.p_error]), [["failed", "Email service refused the message (403 validation_error)"]]);
});

test("a transient email failure is tried once more with the same idempotency key", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: false, error: "Email service did not answer in time", retryable: true }, { ok: true, providerId: "re_456" }]);
  const result = await notifySubmittedEnquiry({ id, token }, deps(db, sender));
  assert.equal(result.status === "delivered" && result.result, "sent");
  assert.equal(sender.sent.length, 2);
  assert.equal(sender.sent[0].id, sender.sent[1].id);
  assert.equal(db.reports().length, 1);
});

test("a crashing email transport or an unreachable database is logged, not thrown", async () => {
  const db = fakeDatabase({ reportError: true }), sender = fakeSender([new Error("socket hang up")]);
  const errors: string[] = [];
  const result = await notifySubmittedEnquiry({ id, token }, deps(db, sender, { log: { ...quiet, error: (m: string) => errors.push(m) } }));
  assert.equal(result.status === "delivered" && result.result, "failed");
  assert.equal(result.status === "delivered" && result.reported, false);
  assert.ok(errors.some(e => /TS-9855E30E/.test(e)) && errors.every(e => !e.includes("sam@example.invalid")), "logs name the reference, never the customer");
  const broken: EnquiryDeps["rpc"] = async () => { throw new Error("network"); };
  assert.deepEqual(await notifySubmittedEnquiry({ id, token }, deps(db, sender, { rpc: broken })), { status: "unavailable" });
});

test("a duplicate request sends nothing more: the alert is claimed once", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: true, providerId: "re_1" }]);
  const first = await notifySubmittedEnquiry({ id, token }, deps(db, sender));
  const second = await notifySubmittedEnquiry({ id, token }, deps(db, sender));
  assert.equal(first.status, "delivered");
  assert.deepEqual(second, { status: "nothing to send" });
  assert.equal(sender.sent.length, 1);
  const office = await sendEnquiryNotificationNow("a1e70000-0000-4000-8000-000000000001", deps(db, sender));
  assert.equal(office.ok, false, "the office cannot resend an alert that was already sent");
  assert.equal(sender.sent.length, 1);
});

test("without an email service, or before the database update, nothing is claimed and the alert stays queued", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: true, providerId: "x" }]);
  assert.deepEqual(await notifySubmittedEnquiry({ id, token }, deps(db, sender, { configured: false })), { status: "not configured" });
  assert.equal(db.calls.length, 0);
  const old = fakeDatabase({ claimError: { code: "PGRST202" } });
  assert.deepEqual(await notifySubmittedEnquiry({ id, token }, deps(old, sender)), { status: "not installed" });
  assert.equal(sender.sent.length, 0);
});

test("the scheduled retry sends every due alert and refuses without the right key", async () => {
  const db = fakeDatabase({ due: 2 }), sender = fakeSender([{ ok: true, providerId: "re_a" }, { ok: false, error: "Email service could not be reached", retryable: true }]);
  assert.deepEqual(await dispatchDueEnquiryNotifications("k".repeat(64), deps(db, sender)), { status: "ok", sent: 1, failed: 1 });
  assert.deepEqual(db.reports().map(r => r.args.p_claim), ["claim-0", "claim-1"]);
  assert.deepEqual(await dispatchDueEnquiryNotifications("wrong".repeat(10), deps(db, sender)), { status: "key not recognised", sent: 0, failed: 0 });
});

test("a confirmed enquiry is reported as received even when its email fails, and only then is the alert started", async () => {
  const scheduled: (() => Promise<unknown>)[] = [];
  const notified: string[] = [];
  const rpc = (answer: { data: unknown; error: { code: string } | null }): EnquiryDeps["rpc"] => async () => answer;
  const completion = (answer: Parameters<typeof rpc>[0]) => completeEnquiry({ id, token }, {
    rpc: rpc(answer), schedule: task => { scheduled.push(task); },
    notify: async input => { notified.push(input.id); throw new Error("email exploded"); }, log: quiet,
  });
  assert.deepEqual(await completion({ data: "received", error: null }), { status: 200, body: { ok: true } });
  assert.equal(scheduled.length, 1, "the alert runs after the visitor has their answer");
  await scheduled[0]();
  assert.deepEqual(notified, [id], "a failing alert is contained inside the scheduled work");

  scheduled.length = 0;
  assert.equal((await completion({ data: "pending", error: null })).status, 409);
  assert.equal((await completion({ data: null, error: { code: "42501" } })).status, 403);
  assert.equal((await completion({ data: null, error: { code: "57014" } })).status, 503);
  assert.equal(scheduled.length, 0, "no alert is started for an enquiry that is not confirmed");
  assert.equal((await completeEnquiry({ id, token: "short" }, { rpc: null, schedule: () => {}, notify: async () => {}, log: quiet })).status, 400);
  const throwingSchedule = await completeEnquiry({ id, token }, { rpc: rpc({ data: "received", error: null }), schedule: () => { throw new Error("no request scope"); }, notify: async () => {}, log: quiet });
  assert.deepEqual(throwingSchedule, { status: 200, body: { ok: true } }, "even if the alert cannot be started, the enquiry is reported as received");
});

test("a repeated confirmation of the same enquiry is still answered as received", async () => {
  const db = fakeDatabase(), sender = fakeSender([{ ok: true, providerId: "re_1" }]);
  const tasks: Promise<unknown>[] = [];
  const confirm = () => completeEnquiry({ id, token }, {
    rpc: async () => ({ data: "received", error: null }), schedule: task => { tasks.push(task()); },
    notify: input => notifySubmittedEnquiry(input, deps(db, sender)), log: quiet,
  });
  assert.deepEqual([await confirm(), await confirm()].map(r => r.status), [200, 200]);
  await Promise.all(tasks);
  assert.equal(sender.sent.length, 1, "two confirmations of one enquiry send one email");
});

// The real email transport, with only the framework's server-only marker replaced.
const transport = build({
  entryPoints: [path.join(__dirname, "../lib/notifications/send.ts")], absWorkingDir: path.resolve(__dirname, ".."), bundle: true, write: false,
  platform: "node", format: "cjs", alias: { "server-only": path.join(__dirname, "rpc-contract/server-only-stub.ts") },
}).then(result => {
  const bundled = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(__filename), bundled, bundled.exports);
  return bundled.exports as typeof import("../lib/notifications/send");
});

test("the email transport sends the customer's reply-to and the alert id as idempotency key, and classifies failures", async () => {
  const { sendEmail } = await transport;
  const saved = { ...process.env };
  Object.assign(process.env, { RESEND_API_KEY: "re_test_secret_value", NOTIFICATIONS_FROM: "TileSPEC Website <enquiries@notify.tilespec.uk>", NOTIFICATIONS_REPLY_TO: "office@example.invalid" });
  try {
    const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const answer = (status: number, body: Record<string, unknown>) => (async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push({ headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    const message = { id: "alert-1", to: "info@tilespec.uk", subject: "s", html: "<p>h</p>", text: "t", replyTo: "sam@example.invalid" };
    assert.deepEqual(await sendEmail(message, answer(200, { id: "re_1" })), { ok: true, providerId: "re_1" });
    assert.equal(requests[0].headers["Idempotency-Key"], "alert-1");
    assert.deepEqual([requests[0].body.to, requests[0].body.reply_to, requests[0].body.from], [["info@tilespec.uk"], "sam@example.invalid", "TileSPEC Website <enquiries@notify.tilespec.uk>"]);
    await sendEmail({ ...message, replyTo: undefined }, answer(200, { id: "re_2" }));
    assert.equal(requests[1].body.reply_to, "office@example.invalid", "without a customer, the configured reply-to is kept");

    const refused = await sendEmail(message, answer(403, { name: "validation_error", message: "The notify.tilespec.uk domain is not verified. re_test_secret_value" }));
    assert.equal(refused.ok, false);
    assert.ok(!refused.ok && !refused.retryable && /domain is not verified/.test(refused.error) && !refused.error.includes("re_test_secret_value"), "the API key never reaches the log");
    const limited = await sendEmail(message, answer(429, { name: "rate_limit_exceeded" }));
    assert.ok(!limited.ok && limited.retryable);
    const down = await sendEmail(message, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
    assert.ok(!down.ok && down.retryable && down.error === "Email service could not be reached");
    delete process.env.RESEND_API_KEY;
    assert.deepEqual(await sendEmail(message, answer(200, { id: "never" })), { ok: false, error: "Email service is not configured", retryable: false });
  } finally {
    for (const key of ["RESEND_API_KEY", "NOTIFICATIONS_FROM", "NOTIFICATIONS_REPLY_TO"]) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
