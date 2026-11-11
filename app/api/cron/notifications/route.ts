import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public-client";
import { renderNotification } from "@/lib/notifications/render";
import { emailConfiguration, publicBaseUrl, sendEmail } from "@/lib/notifications/send";
import { londonClock, londonDate } from "@/lib/operations/planning";

export const dynamic = "force-dynamic";
const SUMMARY_FROM = "07:00";

/**
 * The scheduled email dispatcher (Vercel Cron, every ten minutes). It has no user session: it proves
 * itself to Vercel with CRON_SECRET and to the database with the owner's dispatcher key, and the
 * database decides what may be sent. Nothing is sent unless the owner has switched delivery on and
 * the email service is configured; otherwise each message is logged as a dry run.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const token = process.env.NOTIFICATIONS_DISPATCH_TOKEN?.trim();
  const connection = createPublicClient();
  if (!token || !connection) return NextResponse.json({ status: "not configured" });
  const db = connection.client;
  const now = new Date();
  let queued = 0;
  if (londonClock(now.toISOString()) >= SUMMARY_FROM) {
    const summaries = await db.rpc("dispatch_queue_summaries", { p_token: token, p_date: londonDate(now) });
    if (summaries.error) return NextResponse.json({ error: "Could not queue the morning summaries" }, { status: 502 });
    queued = Number(summaries.data) || 0;
  }
  const claim = await db.rpc("dispatch_claim", { p_token: token, p_limit: 25 });
  if (claim.error) return NextResponse.json({ error: "Could not read the outbox" }, { status: 502 });
  const configured = emailConfiguration().configured, baseUrl = publicBaseUrl();
  const results = { sent: 0, failed: 0, dry_run: 0 };
  for (const message of (claim.data ?? []) as { id: string; kind: string; email: string; subject: string; payload: Record<string, unknown>; live: boolean }[]) {
    const email = renderNotification(message.kind, message.subject, message.payload, baseUrl);
    let outcome: { result: "sent" | "failed" | "dry_run"; provider: string | null; error: string | null };
    if (!message.live || !configured) outcome = { result: "dry_run", provider: null, error: null };
    else {
      const sent = await sendEmail({ id: message.id, to: message.email, subject: email.subject, html: email.html, text: email.text });
      outcome = sent.ok ? { result: "sent", provider: sent.providerId, error: null } : { result: "failed", provider: null, error: sent.error };
    }
    const report = await db.rpc("dispatch_report", { p_token: token, p_outbox: message.id, p_result: outcome.result, p_provider_id: outcome.provider, p_error: outcome.error });
    if (!report.error) results[outcome.result] += 1;
  }
  return NextResponse.json({ status: "ok", queued, ...results });
}
