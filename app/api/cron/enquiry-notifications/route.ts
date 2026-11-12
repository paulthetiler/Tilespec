import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public-client";
import { dispatchDueEnquiryNotifications } from "@/lib/notifications/enquiry";
import { enquiryDeps } from "@/lib/notifications/enquiry-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Retries enquiry email alerts that could not be sent straight after the enquiry (a Vercel Cron entry in
 * vercel.json). It has no user session: it proves itself to Vercel with CRON_SECRET and to the database with
 * the owner's retry key (ENQUIRY_NOTIFICATIONS_KEY), and the database decides which alerts are due.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`)))
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const key = process.env.ENQUIRY_NOTIFICATIONS_KEY?.trim();
  const connection = createPublicClient();
  if (!key || !connection) return NextResponse.json({ status: "not configured" });
  try {
    const result = await dispatchDueEnquiryNotifications(key, enquiryDeps(connection.client));
    if (result.status === "error" || result.status === "key not recognised") console.error(`Enquiry alert retry: ${result.status}`);
    return NextResponse.json(result, { status: result.status === "error" ? 502 : 200 });
  } catch {
    console.error("Enquiry alert retry could not reach the database");
    return NextResponse.json({ status: "error" }, { status: 502 });
  }
}
