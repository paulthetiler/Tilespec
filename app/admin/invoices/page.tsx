import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { contractsFor } from "@/lib/operations/data";
import { billingProfileFor } from "@/lib/operations/accounts-data";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

type InvoiceRow = { id: string; contract_id: string; reference: string; issued_on: string | null; due_on: string | null; total: number | string | null; kind: string; superseded_at: string | null };
const gbp = (v: number | string | null) => new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(Number(v ?? 0));

export default async function InvoicesPage({ searchParams }: {searchParams: Promise<{q?: string}>}) {
  const {supabase} = await requireFinancialActor();
  const [contracts, billing, params] = await Promise.all([contractsFor(supabase), billingProfileFor(supabase), searchParams]);
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().slice(0,120) : "";
  const names = new Map(contracts.map(c => [c.id, {name:c.name, client:c.client, reference:c.reference}]));
  if (!billing.available) return <><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Commercial accounts</p><h1 className={styles.title}>Invoices</h1></div></div><section className={styles.warning}>The commercial invoicing database update is not active yet. No invoices can be issued until it is applied and verified.</section><p><Link href="/admin/contracts">View contracts</Link></p></>;
  const result = await supabase.from("commercial_documents").select("id,contract_id,reference,issued_on,due_on,total,kind,superseded_at").in("kind",["invoice","credit_note"]).order("issued_on",{ascending:false}).limit(500);
  if (result.error) throw new Error(result.error.message);
  const rows = ((result.data ?? []) as InvoiceRow[]).filter(x => names.has(x.contract_id)).filter(x => {
    const c = names.get(x.contract_id)!;
    return !q || [x.reference,c.name,c.client,c.reference].some(v => v.toLowerCase().includes(q));
  });
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Commercial accounts</p><h1 className={styles.title}>Invoices</h1><p className={styles.description}>Issued invoices and credit notes across your contracts. Open a job to create an application, issue an invoice or record a payment.</p></div><Link className={styles.button} href="/admin/contracts">Choose contract to invoice</Link></div>
    {!billing.profile?.legal_name && !billing.profile?.trading_name && <section className={styles.warning}>Business details must be entered before issuing invoices. <Link href="/admin/accounts/settings">Set up business details</Link>.</section>}
    <form method="get" className={styles.search}><label className={styles.field}>Find an invoice<input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Invoice number, client or contract" /></label><button type="submit" className={styles.secondaryButton}>Search</button></form>
    <p className={styles.small}>{rows.length} matching issued documents{rows.length===500?" (showing latest 500)":""}</p>
    <div className={styles.contractList}>
      {rows.map(d => {const c=names.get(d.contract_id)!;return <div key={d.id} className={styles.contractCard}><div className={styles.cardTop}><span className={styles.eyebrow}>{d.reference}</span><span>{d.kind==="credit_note"?"Credit note":d.superseded_at?"Superseded invoice":"Invoice"}</span></div><h2>{c.client || c.name}</h2><p>{c.reference} · {c.name}</p><p>Issued: {d.issued_on || "—"} · Due: {d.due_on || "—"}</p><p><strong>{gbp(d.total)}</strong></p><div className={styles.inline}><Link href={`/admin/contracts/${d.contract_id}/accounts/documents/${d.id}`}>View PDF</Link><Link href={`/admin/contracts/${d.contract_id}/accounts`}>Job accounts and payments</Link></div></div>})}
      {rows.length===0 && <div className={styles.empty}><h2>No invoices found</h2><p>{q?"Try another search.":"Issued invoices will appear here. Open a contract to create the first one."}</p></div>}
    </div>
  </>;
}
