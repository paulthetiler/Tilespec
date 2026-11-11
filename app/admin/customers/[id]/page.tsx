import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { jobStage, money, stageLabels } from "@/lib/operations/command-centre";
import { DailyForm } from "@/components/site/daily-form";
import { CustomerFields } from "@/components/office/customer-fields";
import { saveCustomerAction, setContractCustomerAction } from "@/app/admin/command-centre-actions";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/** One customer: details, every job, quotations and what they owe. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (customer.error || !customer.data) notFound();
  const c = customer.data as Row;
  const financial = canReadFinancial(member);
  const today = londonDate();
  const contracts = await supabase.from("contracts").select("*").order("start_date", { ascending: false });
  checkDatabase(contracts.error);
  const name = String(c.name).trim().toLowerCase();
  const jobs = ((contracts.data ?? []) as Row[]).filter(j => j.customer_id === id || (!j.customer_id && String(j.client ?? "").trim().toLowerCase() === name));
  const [quotes, debts] = financial ? await Promise.all([
    supabase.from("quotes").select("id,reference,title,status,value_net,issued_on").eq("customer_id", id).order("number", { ascending: false }),
    supabase.rpc("debtor_ledger"),
  ]) : [null, null];
  const owed = ((debts?.data ?? []) as { contract_id: string; outstanding: number; days_overdue: number }[]).filter(d => jobs.some(j => j.id === d.contract_id));
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}><Link href="/admin/customers">Customers</Link></p><h1 className={styles.title}>{String(c.name)}</h1>
      <p className={styles.description}>{[c.contact_name, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details yet"}</p></div></div>
    {financial && <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.metricLabel}>Owed</span><strong className={styles.metricValue}>{money(owed.reduce((s, d) => s + Number(d.outstanding), 0))}</strong></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Overdue</span><strong className={styles.metricValue}>{money(owed.filter(d => Number(d.days_overdue) > 0).reduce((s, d) => s + Number(d.outstanding), 0))}</strong></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Jobs</span><strong className={styles.metricValue}>{jobs.length}</strong></div>
    </div>}
    <section className={styles.panel} aria-labelledby="customer-jobs"><h2 id="customer-jobs">Jobs</h2>
      {jobs.length === 0 ? <p>No jobs yet. Link a job from the job's own page.</p> : <ul className={styles.plainList}>{jobs.map(j => {
        const { stage } = jobStage(j.lifecycle_stage as string | null, j.start_date as string | null, j.end_date as string | null, today);
        return <li key={String(j.id)}><Link href={`/admin/contracts/${j.id}`}>{String(j.reference)} · {String(j.name)}</Link> · {stageLabels[stage]}
          {!j.customer_id && <DailyForm action={setContractCustomerAction} label="Confirm this job belongs to this customer">
            <input type="hidden" name="contract_id" value={String(j.id)} /><input type="hidden" name="customer_id" value={id} />
          </DailyForm>}</li>;
      })}</ul>}
    </section>
    {quotes && <section className={styles.panel} aria-labelledby="customer-quotes"><h2 id="customer-quotes">Quotations</h2>
      {(quotes.data ?? []).length === 0 ? <p>No quotations. <Link href={`/admin/quotes?customer=${id}#new`}>Prepare one</Link>.</p>
      : <ul className={styles.plainList}>{((quotes.data ?? []) as Row[]).map(q => <li key={String(q.id)}><Link href={`/admin/quotes/${q.id}`}>{String(q.reference)} · {String(q.title)}</Link> · {String(q.status)} · {money(Number(q.value_net))}</li>)}</ul>}
    </section>}
    <section className={styles.panel} aria-labelledby="customer-edit"><h2 id="customer-edit">Details</h2>
      <DailyForm action={saveCustomerAction} label="Save details">
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="customer_id" value={id} /><input type="hidden" name="version" value={String(c.version)} />
        <CustomerFields customer={c as never} />
      </DailyForm>
    </section>
  </>;
}
