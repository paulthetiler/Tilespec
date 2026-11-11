import Link from "next/link";
import { canReadFinancial, requireActor } from "@/lib/auth";
import { DailyForm } from "@/components/site/daily-form";
import { setTenderStatusAction } from "@/app/admin/command-centre-actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { received: "Received", reviewing: "Reviewing", pricing: "Pricing", submitted: "Submitted", won: "Won", lost: "Lost", declined: "Declined to price" };
const open = ["received", "reviewing", "pricing"];

/** Tender enquiries from the website, tracked from receipt to submission and outcome. Files are private and expire after five minutes. */
export default async function TenderInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (member.role !== "owner" && member.role !== "contracts_manager") return <p>Not authorised to view tender enquiries.</p>;
  // Read in the signed-in person's own session: only the owner and contracts managers are allowed
  // to see enquiries and their files. No service key is used.
  const params = await searchParams;
  const filter = typeof params.status === "string" && (params.status === "closed" || statusLabels[params.status]) ? params.status : "open";
  const wanted = filter === "open" ? open : filter === "closed" ? ["submitted", "won", "lost", "declined"] : [filter];
  const { data, error } = await supabase.from("tender_enquiries").select("id,reference,kind,name,company,email,project,deadline,message,status,attachments,received_at")
    .in("status", wanted).order("deadline", { ascending: true, nullsFirst: false }).order("received_at", { ascending: false }).limit(100);
  if (error) return <p>Tender inbox unavailable. Please try again shortly.</p>;
  const entries = await Promise.all((data || []).map(async e => {
    const documents = await Promise.all(((e.attachments || []) as { name: string; path: string }[]).map(async f => {
      const { data: link } = await supabase.storage.from("tilespec-tenders").createSignedUrl(f.path, 300);
      return { name: f.name, url: link?.signedUrl || "" };
    }));
    return { ...e, documents };
  }));
  const financial = canReadFinancial(member);
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>New business</p><h1 className={styles.title}>Tender enquiries</h1>
      <p className={styles.description}>Enquiries from the website, from receipt to pricing, submission and outcome. Files expire after five minutes; refresh to renew.</p></div>
      {financial && <Link className={styles.secondaryButton} href="/admin/quotes">Quotations</Link>}</div>
    <nav className={styles.rowActions} aria-label="Filter enquiries">
      {[["open", "Open"], ["closed", "Submitted and decided"], ...Object.entries(statusLabels)].map(([key, label]) =>
        <Link key={key} className={styles.secondaryButton} href={`/admin/tenders?status=${key}`} aria-current={filter === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <section className={styles.panel}>{entries.length === 0 ? <p>No enquiries {filter === "open" ? "are open" : "with this status"}.</p> : entries.map(e => <article key={e.id} id={`tender-${e.id}`} style={{ padding: "20px 0", borderBottom: "1px solid #dce4e6" }}>
      <p className={styles.eyebrow}>{statusLabels[e.status] ?? e.status}{e.deadline ? ` · return by ${e.deadline}` : ""}</p>
      <strong>{e.reference} · {e.project || "General enquiry"}</strong><p>{e.company || e.name} · {e.email}</p>
      <p>Submitted: {e.received_at ? new Date(e.received_at).toLocaleString("en-GB") : "Not confirmed"}</p>
      {e.message && <p style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>}
      {e.documents.length > 0 && <div><strong>Documents</strong><ul>{e.documents.map((f, i) => <li key={i}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name + " (temporarily unavailable)"}</li>)}</ul></div>}
      <div className={styles.rowActions}>
        {financial && open.includes(e.status) && <Link className={styles.secondaryButton} href={`/admin/quotes?tender=${e.id}#new`}>Prepare a quotation</Link>}
        <details className={styles.details}><summary>Change status</summary>
          <DailyForm action={setTenderStatusAction} label="Save status">
            <input type="hidden" name="tender_id" value={e.id} />
            <label className={styles.field}>Status<select name="status" defaultValue={e.status === "received" ? "reviewing" : e.status}>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className={styles.field}>Note (a reason is needed for declined or lost)<input name="note" maxLength={1000} /></label>
          </DailyForm>
        </details>
      </div>
    </article>)}</section>
  </>;
}
