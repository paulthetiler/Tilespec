import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { DailyForm } from "@/components/site/daily-form";
import { CustomerFields } from "@/components/office/customer-fields";
import { saveCustomerAction } from "@/app/admin/command-centre-actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const kindLabels: Record<string, string> = { client: "Client", main_contractor: "Main contractor", developer: "Developer", consultant: "Consultant", other: "Other" };

/** Customers and the jobs, quotations and money that belong to each. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).trim().toLowerCase().slice(0, 80) : "";
  const [customers, contracts] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("contracts").select("*"),
  ]);
  const unavailable = !!customers.error && ["42P01", "PGRST205"].includes(customers.error.code ?? "");
  if (!unavailable) checkDatabase(customers.error);
  checkDatabase(contracts.error);
  const jobs = (contracts.data ?? []) as Row[];
  const rows = ((customers.data ?? []) as Row[]).filter(c => !q || [c.name, c.contact_name, c.email].some(v => String(v ?? "").toLowerCase().includes(q)));
  const jobCount = (c: Row) => jobs.filter(j => j.customer_id === c.id || (!j.customer_id && String(j.client ?? "").trim().toLowerCase() === String(c.name).trim().toLowerCase())).length;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Sales</p><h1 className={styles.title}>Customers</h1>
      <p className={styles.description}>Clients, main contractors and developers, with their jobs, quotations and balances.</p></div>
      <a className={styles.button} href="#new">Add a customer</a></div>
    {unavailable ? <p className={styles.warning}>The customer list arrives with the latest database update, which is not applied yet. Jobs keep their client name meanwhile.</p> : <>
      <form method="get" className={styles.search}><label className={styles.field}>Find a customer<input type="search" name="q" defaultValue={q} maxLength={80} /></label>
        <button className={styles.secondaryButton} type="submit">Search</button></form>
      <div className={styles.contractList}>{rows.map(c => <Link key={String(c.id)} href={`/admin/customers/${c.id}`} className={styles.contractCard}>
        <div className={styles.cardTop}><span className={styles.eyebrow}>{kindLabels[String(c.kind)] ?? "Customer"}</span>{c.active === false && <span className={styles.warningBadge}>Inactive</span>}</div>
        <h2>{String(c.name)}</h2><p className={styles.muted}>{[c.contact_name, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details yet"}</p>
        <p className={styles.small}>{jobCount(c)} {jobCount(c) === 1 ? "job" : "jobs"}</p>
      </Link>)}</div>
      {!rows.length && <section className={styles.empty}><h2>{q ? "No matching customers" : "No customers yet"}</h2><p>Add your clients and main contractors below.</p></section>}
      <section className={styles.panel} id="new" aria-labelledby="new-customer"><h2 id="new-customer">Add a customer</h2>
        <DailyForm action={saveCustomerAction} label="Add customer"><input type="hidden" name="request_key" value={randomUUID()} /><CustomerFields /></DailyForm>
      </section>
    </>}
  </>;
}
