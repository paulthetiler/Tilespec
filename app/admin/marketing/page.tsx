import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import styles from "../admin.module.css";

export const metadata: Metadata = {
  title: "Marketing & enquiry readiness | TileSPEC Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function MarketingReadinessPage() {
  const { supabase, member } = await requireActor();
  if (member.role !== "owner" && member.role !== "contracts_manager") redirect("/admin?error=permission");
  const now = Date.now();
  const sevenDays = new Date(now - 7 * 86400000).toISOString();
  const thirtyDays = new Date(now - 30 * 86400000).toISOString();
  const totals = await Promise.all([
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }),
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }).eq("status","received"),
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }).eq("kind","tender").eq("status","received"),
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }).eq("kind","general").eq("status","received"),
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }).eq("status","received").gte("received_at",thirtyDays),
    supabase.from("tender_enquiries").select("id", { count:"exact", head:true }).eq("status","received").gte("received_at",sevenDays),
  ]);
  const error = totals.find(result => result.error)?.error;
  const value = (index:number) => totals[index].count ?? 0;
  return <div>
    <div className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>Pre-launch measurement</p>
        <h1 className={styles.title}>Marketing & enquiries</h1>
        <p className={styles.description}>Read-only enquiry counts from the existing TileSPEC database. Google Search Console and visitor analytics are not connected here.</p>
      </div>
      <Link href="/admin" className={styles.secondaryButton}>Back to overview</Link>
    </div>
    {error ? <section className={styles.panel}><h2>Enquiry counts unavailable</h2><p>We could not read the existing tender records. No submissions or records have been changed.</p></section>
    : <div className={styles.metrics}>
      {[
        ["Confirmed enquiries",value(1),"All time · status received"],
        ["Tender enquiries",value(2),"All time · confirmed"],
        ["General enquiries",value(3),"All time · confirmed"],
        ["Last 30 days",value(4),"Confirmed within 30 days"],
        ["Last 7 days",value(5),"Confirmed within 7 days"],
        ["Total initiated",value(0),"Includes unfinished submissions"],
      ].map(([title,count,detail])=><div key={String(title)} className={styles.metric}>
        <span className={styles.metricLabel}>{title}</span>
        <strong className={styles.metricValue}>{count}</strong>
        <span className={styles.small}>{detail}</span>
      </div>)}
    </div>}
    <section className={styles.panel} style={{marginTop:24}}>
      <h2>What these figures mean</h2>
      <p>Counts come from enquiry records saved by the existing contact form. A submission is counted as a confirmed lead only when its status is <strong>received</strong>; failed or abandoned uploads do not count as conversions. Test submissions can still appear and should be excluded before judging marketing performance.</p>
      <p><strong>Not yet measured:</strong> visits, referrers, organic clicks, keyword rankings, conversion rate and campaign attribution. There is no reliable traffic denominator until visitor analytics is activated and checked. The number of enquiries is not the same as the number of new commercial customers.</p>
    </section>
    <section className={styles.panel} style={{marginTop:24}}>
      <h2>Pre-launch readiness</h2>
      <ul style={{lineHeight:1.9,paddingLeft:22}}>
        <li>Production domain, regional hubs, 75 location pages, four service pages and eight technical guides are prepared.</li>
        <li>Public sitemap, robots instructions, canonical addresses and internal links can be checked without Google Search Console.</li>
        <li>Use the private contact form workflow for real enquiries; do not submit fake customer leads just to test reporting.</li>
        <li>Visitor analytics remains disabled; decide on analytics and privacy/consent configuration before deliberately switching it on.</li>
        <li>Google Search Console property verification, sitemap submission, indexing inspections and search performance are reserved for launch.</li>
      </ul>
      <p><Link href="/contact">View enquiry form</Link> · <Link href="/coverage">UK coverage</Link> · <Link href="/guides">Technical articles</Link></p>
    </section>
  </div>;
}
